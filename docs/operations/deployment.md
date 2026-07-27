# Fustify droplet deployment

## Supported architecture

Fustify runs from immutable combined releases on the Ubuntu 24.04 droplet:

- Repository: `/srv/fustify/repository`
- Releases: `/srv/fustify/releases/<timestamp>-<commit>`
- Active symlink: `/srv/fustify/current`
- Frontend: `/srv/fustify/current/web`
- Node API: `/srv/fustify/current/api/server.mjs`
- User service: `fustify-api.service`, running as `chris`
- Caddy frontend root: `/srv/fustify/current/web`
- Caddy API upstream: `127.0.0.1:8787`

Each release contains `web/`, `api/`, and private root `release.json`
metadata. A non-sensitive copy of the same metadata is intentionally available
at `/release.json` for commit verification. `web/health.json` retains the former
static health metadata contract. The Node `/api/health` endpoint is the runtime
health authority.

The API only initializes multiplayer matches. Ordinary multiplayer gameplay
continues to use Supabase. This workflow does not run migrations or deploy Edge
Functions.

## One-time installation

Prerequisites are Caddy, Git, pnpm, `/usr/local/bin/node` version 24, the
existing non-root `chris` user, and a checkout at
`/srv/fustify/repository`. Run these commands as `chris`, not root:

```sh
cd /srv/fustify/repository
./deployment/setup-droplet.sh
```

The setup script creates the release directories, installs the user unit,
enables user lingering, and installs `/usr/local/bin/fustify-deploy`. It uses
`sudo` only for operations that require root ownership or system login
configuration. Git, pnpm, builds, release activation, and
`systemctl --user` always run as `chris`.

The Caddyfile must contain this one reviewed import:

```caddyfile
import /etc/caddy/sites/*.caddy
```

Then install the managed site fragment:

```sh
cd /srv/fustify/repository
./deployment/install-caddy.sh
```

The Caddy installer changes only `/etc/caddy/sites/fustify.caddy`. It backs up
the prior fragment, validates the complete Caddy configuration, and reloads
only after validation. A validation or reload failure restores the backup and
attempts to reactivate it. The installer refuses to edit an unrelated
Caddyfile when the managed import is absent.

## Private configuration

Keep both files mode `0600`; never commit them:

`/home/chris/.config/fustify/fustify-api.env`

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- Optional: `FUSTIFY_API_PORT` (default `8787`)

`/srv/fustify/repository/.env.production.local`

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

After valid server values are present, rerunning `setup-droplet.sh` derives a
missing or invalid frontend file from the corresponding public server values
inside a restrictive-umask subshell. It never overwrites an already valid
frontend file.

Deployment notifications use two deliberately separate Discord webhooks:

`/home/chris/.config/fustify/deploy.env`

- Optional: `DISCORD_ADMIN_WEBHOOK_URL` for deployment success, failures,
  rollback results, cleanup warnings, and other operational diagnostics.
- Optional: `DISCORD_CHANGELOG_WEBHOOK_URL` for only the commits newly made
  live, determined from the previously active release's recorded commit
  through the newly activated and publicly verified commit.

Either variable may instead be exported in the operator environment. Values
are never printed. Missing or invalid configuration never redirects a message
to the other webhook. Notification failure is reported but does not roll back
a healthy deployment.

## Normal deployment

```sh
fustify-deploy
```

The command takes a nonblocking lock, requires user `chris`, enters the
configured repository, refuses dirty tracked files or branch divergence,
fetches `origin/main`, and fast-forwards only. It then validates both private
environment files and runs:

1. `pnpm install --frozen-lockfile`
2. `pnpm format:check`
3. `pnpm lint`
4. `pnpm exec vitest run --testTimeout=15000`
5. `pnpm test:deployment`
6. `pnpm test:integration:dev-proxy`
7. `pnpm build:release`
8. `pnpm bundle:check`

Only checks that actually ran are listed in the success notification. The
command stages web and API artifacts together, applies explicit Caddy-readable
frontend permissions, atomically switches `current`, restarts the user
service, and retries local API health silently for a bounded interval. It then
checks the public API, `/`, `/multiplayer`, `/admin`, sensitive-path blocking,
and the full commit in `/release.json`.

A same-commit rebuild is normal: update the private environment file and run
`fustify-deploy` again. A unique release is built even when Git does not move,
which is required for Vite environment changes.

`pnpm deploy:droplet` remains a repository-level activation entry point for
controlled diagnostics and test parity. It does not replace the locked,
Git-updating operator command.

## Rollback and retention

Activation or local/public verification failure atomically restores the
previous release and restarts the API. Rollback verification confirms that
`current` resolves to that exact release, its private root metadata contains
the expected full commit, the local and public APIs are healthy, required
public routes return `200`, and sensitive paths return `404`. Modern releases
that contain `web/release.json` must also expose that exact commit publicly.
A legacy release without `web/release.json` may use its validated private
metadata instead; the deploy command reports when this compatibility path is
used. Missing public metadata is the only check omitted for a legacy release.
The failure notification names the failed stage and whether rollback
verification succeeded. If any applicable rollback check fails, the deploy
command prints an explicit emergency diagnostic.

Retention runs only after successful local and public verification. A
retention failure is therefore reported as a post-deployment cleanup failure:
the newly verified release remains live, no rollback is attempted solely for
cleanup, and the warning goes only to the admin webhook. The release changelog
may still be sent because its commits genuinely became active.

The public changelog is sent only after activation and public verification.
It uses the exact previous deployed commit recorded in the formerly active
release and the newly verified commit; it does not use an arbitrary
`origin/main` range. Failed or rolled-back deployments send no changelog, and
same-commit deployments do not invent changes.

The default is five newest release directories (`FUSTIFY_KEEP_RELEASES=5`);
the older `FUSTIFY_RELEASE_RETENTION` name remains supported when the preferred
variable is unset. The active and immediate rollback releases are always
protected even if that temporarily keeps more than the configured count. Every
deletion candidate must be a canonical direct child of
`/srv/fustify/releases` with a validated release name. Immediately before
deletion, the candidate is revalidated against the resolved active and
previous releases. Only that stale candidate's directories and files are made
user-writable and removed; retained releases remain immutable, and symlink
escapes are rejected.

For a manual rollback, run as `chris` and replace `CANDIDATE` with an existing
combined release:

```sh
candidate="$(realpath -e /srv/fustify/releases/CANDIDATE)"
case "${candidate}" in
  /srv/fustify/releases/*) ;;
  *) echo "Unsafe rollback path" >&2; exit 1 ;;
esac
test -f "${candidate}/web/index.html"
test -f "${candidate}/api/server.mjs"
expected_commit="$(
  grep --only-matching --extended-regexp \
    '"commit"[[:space:]]*:[[:space:]]*"[0-9a-f]{40}"' \
    "${candidate}/release.json" |
    sed -nE 's/.*"([0-9a-f]{40})"$/\1/p' |
    head -n 1
)"
test "${#expected_commit}" = 40
case "$(basename "${candidate}")" in
  *-"${expected_commit:0:12}"|*-"${expected_commit:0:12}"-[0-9]*) ;;
  *) echo "Release metadata does not match its directory" >&2; exit 1 ;;
esac
next="/srv/fustify/.current-manual-$$"
ln -s "${candidate}" "${next}"
mv -Tf "${next}" /srv/fustify/current
test "$(readlink -f /srv/fustify/current)" = "${candidate}"
systemctl --user restart fustify-api.service
curl --fail --silent http://127.0.0.1:8787/api/health
curl --fail --silent https://dev.fustify.com/api/health
for route in / /multiplayer /admin; do
  test "$(curl --silent --output /dev/null --write-out '%{http_code}' \
    "https://dev.fustify.com${route}")" = 200
done
for route in /.env /.git/config /src/main.tsx /node_modules/ /assets/app.js.map; do
  test "$(curl --silent --output /dev/null --write-out '%{http_code}' \
    "https://dev.fustify.com${route}")" = 404
done
if test -f "${candidate}/web/release.json"; then
  curl --fail --silent https://dev.fustify.com/release.json
else
  cat "${candidate}/release.json"
fi
```

Confirm `current` still resolves to `${candidate}` and that the final response
contains the selected release's full commit. Public metadata is mandatory when
`web/release.json` exists. Only a legacy release lacking that file may be
confirmed from its private root metadata; do not add files to an immutable old
release.

## Operations and recovery

```sh
systemctl --user status fustify-api.service --no-pager
journalctl --user -u fustify-api.service -n 100 --no-pager
curl --fail --silent http://127.0.0.1:8787/api/health
curl --fail --silent https://dev.fustify.com/api/health
```

To rotate environment values, edit the applicable private file, restore mode
`0600`, and run `fustify-deploy`. Frontend values require a rebuild; server
values take effect when the service restarts.

If the frontend returns `403`, do not change environment-file permissions.
Repair only the validated active release:

```sh
umask 022
active="$(readlink -f /srv/fustify/current)"
case "${active}" in
  /srv/fustify/releases/*) ;;
  *) echo "Unsafe active release" >&2; exit 1 ;;
esac
chmod a+rx "${active}"
find "${active}/web" -type d -exec chmod 0755 {} +
find "${active}/web" -type f -exec chmod 0644 {} +
```

If port `8787` is unavailable, inspect the listener and service before
restarting:

```sh
ss -ltnp 'sport = :8787'
systemctl --user status fustify-api.service --no-pager
journalctl --user -u fustify-api.service -n 100 --no-pager
```

Stop or reconfigure only the identified conflicting process. Do not run a
second API instance.

The static-only legacy `/usr/local/bin/fustify-deploy` implementation is
obsolete and must be replaced by `setup-droplet.sh`. The home-directory
`test.sh` was a one-time July 26 recovery wrapper and is not a canonical
deployment mechanism. Direct static artifact copies, the old `web` symlink
repair, and `sudo systemctl` for `fustify-api.service` are also obsolete.
