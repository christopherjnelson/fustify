# Fustify LAN game-night deployment

## Purpose

The LAN bundle runs the Fustify frontend, Node API, and the pinned self-hosted
Supabase services as one Docker Compose project. It is intended for an
occasional trusted private-network session where the operator wants to press
**Up** or **Down** in Arcane instead of running the development servers.

The public gateway is the only LAN-facing service. PostgreSQL and Supavisor
remain bound to host loopback, and Supabase's Envoy gateway remains internal.
The browser uses the same origin for Fustify and Supabase, so friends need only
one URL and changing the LAN hostname does not require rebuilding the app.

This is not an Internet deployment. Keep the published port blocked at the
WAN edge and do not configure router port forwarding.

## One-time installation

Choose a stable LAN IP or hostname for the Docker host. Install into an empty,
absolute directory inside Arcane's configured Projects Directory:

```bash
pnpm lan:install -- /absolute/path/to/arcane/projects/fustify-lan \
  http://192.168.1.50:8080
```

Use `pnpm lan:install`, not `pnpm install`. Plain `pnpm install` interprets the
directory and URL as dependencies, which produces a nonexistent-directory
warning and repeated HTTP requests to an application that has not started yet.
Cancel that command with Ctrl+C and run the script above.

### Finding Arcane's projects directory

For a Docker-installed Arcane manager, inspect its bind mounts:

```bash
docker inspect arcane \
  --format '{{range .Mounts}}{{println .Type "|" .Source "|" .Destination}}{{end}}'
```

Find the line whose container destination is `/app/data/projects`. Its source
is the absolute directory Arcane scans. On the current development host, that
mount is:

```text
/home/chris/Projects/docker-stacks -> /app/data/projects
```

The complete installation command used on that host is therefore:

```bash
pnpm lan:install -- /home/chris/Projects/docker-stacks/fustify-lan \
  http://192.168.0.78:8080
```

The installer:

1. downloads the reviewed `self-hosted/v0.8.0` Supabase Docker bundle;
2. generates unique database, JWT, opaque API, Dashboard, and encryption keys;
3. copies all Fustify migrations, Edge Functions, and shared function source;
4. creates an Arcane-compatible canonical `compose.yaml`;
5. snapshots the application source used by the two local container builds;
6. enables email autoconfirm while leaving anonymous Auth, external email, and
   Discord integrations disabled; and
7. validates the fully merged Compose model without starting it.

The generated `.env` is mode `0600` and contains secrets. Do not commit, copy,
or paste it into Arcane templates. Back up the whole project directory if its
game history matters.

Arcane discovers projects recursively and prefers the canonical
`compose.yaml`. Open the `fustify-lan` project and select **Up**. The first start
pulls the pinned Supabase images and builds the two small Fustify images, so it
takes longer than later starts. Once every service is healthy, visit the origin
passed to the installer.

The equivalent CLI operation is:

```bash
cd /absolute/path/to/arcane/projects/fustify-lan
docker compose up -d --build --wait
./verify-lan.sh
```

The LAN project is separate from `pnpm dev`. Development continues to read
`.env.local`; it uses whichever Supabase URL that file contains. The Arcane
project always uses the Supabase services in its own Compose network, and its
browser build routes Supabase, the Node API, and the frontend through the one
LAN origin.

## Ordinary operation

- **Up** starts the complete game and backend.
- **Down** removes containers and the project network but retains the named
  volumes and bind-mounted database and Storage data.
- **Restart** is safe when troubleshooting a transient container problem.
- Never choose a destroy/delete-volumes option unless the LAN accounts,
  matches, uploads, and database can be discarded.

The Supabase Studio container runs for gateway health compatibility but is not
routed through the public Fustify gateway. Database pooler ports `5432` and
`6543` inside the project are available as `15432` and `16543` on host
`127.0.0.1` by default. Change `FUSTIFY_LAN_POSTGRES_PORT` or
`FUSTIFY_LAN_POOLER_PORT` if those host ports are already occupied.

## Updating from the repository

After changing Fustify, synchronize the application snapshot, migrations, and
Edge Functions:

```bash
pnpm lan:sync -- /absolute/path/to/arcane/projects/fustify-lan
```

Then use Arcane **Redeploy**, or run:

```bash
cd /absolute/path/to/arcane/projects/fustify-lan
docker compose up -d --build --wait
./verify-lan.sh
```

On every Up or Redeploy, the one-shot `fustify-migrations` service waits for
Supabase Auth to finish its platform migrations, applies each pending Fustify
migration transactionally, records it in `supabase_migrations`, and exits. The
Fustify API does not start until that service completes successfully.

## Changing the LAN address

Edit these values together in the project's `.env`, then recreate the stack:

```dotenv
FUSTIFY_LAN_ORIGIN=http://192.168.1.60:8080
FUSTIFY_LAN_PORT=8080
FUSTIFY_LAN_POSTGRES_PORT=15432
FUSTIFY_LAN_POOLER_PORT=16543
SUPABASE_PUBLIC_URL=http://192.168.1.60:8080
API_EXTERNAL_URL=http://192.168.1.60:8080/auth/v1
SITE_URL=http://192.168.1.60:8080
ADDITIONAL_REDIRECT_URLS=http://192.168.1.60:8080/auth/callback,http://192.168.1.60:8080/auth/reset-password
```

Because the frontend resolves Supabase against `window.location.origin`, a
hostname-only change does not require an image rebuild. Changing the published
port requires recreating the gateway container.

## Verification and diagnostics

`./verify-lan.sh` checks running services, required PostgreSQL extensions, the
latest migration, Storage buckets, the static frontend, Node API, Auth, and
PostgREST through the same LAN origin used by browsers.

For a complete game-night rehearsal:

1. Select **Up** in Arcane and wait for the project to become healthy.
2. Run the verifier from the installed project directory:

   ```bash
   cd /home/chris/Projects/docker-stacks/fustify-lan
   ./verify-lan.sh
   ```

3. Open `http://192.168.0.78:8080` from another device on the LAN.
4. Register an email/password account. Email confirmation is automatic in this
   private profile, so no SMTP server or inbox is needed.
5. Create a multiplayer room, join it from a second browser or device, and
   start enough of a match to create durable state.
6. Select **Down** in Arcane, then **Up** again. Sign back in and confirm that
   the account, room, and match still exist. This exercises container removal,
   recreation, migrations, and persistent database/Storage data together.

If the host IP changes, update the values in [Changing the LAN address](#changing-the-lan-address)
before testing from another device.

Useful diagnostics:

```bash
docker compose ps
docker compose logs --tail 100 caddy fustify-api api-gw auth rest realtime storage functions db
```

External SMTP, Discord OAuth, and Discord room announcements are deliberately
off in the default LAN profile. They can be configured later in `.env`.
Autoconfirmed email accounts are sufficient for a private game night and avoid
dependencies on external credentials; multiplayer intentionally does not grant
gameplay access to anonymous users.
