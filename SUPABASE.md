# Supabase development

## Remote project and initial audit

This repository uses the dedicated hosted project `fustify-multiplayer`:

- Project ref: `qwmsybhpjnfjiyxcspwj`
- Organization: `Fustify`
- Region: `us-east-1`
- Postgres: 17

No secret, service-role key, database password, or direct connection string is
stored in Git. Before this task the new project had no application tables,
migrations, public functions, policies, or users. Its default empty
`supabase_realtime` publication and platform-managed schemas/extensions existed.
Anonymous sign-in was initially disabled and was enabled for this project; the
public Auth settings endpoint now reports it enabled.

Two previously connected hosted projects were also audited and deliberately not
modified: `mcu_kb` (`eioehvcowocvoixodakc`) contained an unrelated `mcu` schema
and migrations, while `gcajdeycavucmudirabz` contained unrelated public content
tables. No ambiguous project was used or reset.

## Source of truth and remote workflow

Database migrations in `supabase/migrations/` are the schema source of truth:

1. `20260722040118_create_multiplayer_foundation.sql`
2. `20260722040242_add_rooms_host_index.sql`
3. `20260722041857_fix_update_room_settings_conflict.sql`
4. `20260722043353_release_seat_on_member_delete.sql`

The hosted migration history contains all four in that order. Create and review
a migration locally before applying it remotely; never make an undocumented
dashboard-only schema change and never run a destructive remote reset.

With a Supabase access token available to the CLI:

```bash
pnpm supabase:link
pnpm supabase:migrations:list
pnpm supabase:db:push
pnpm supabase:types
```

`pnpm supabase:config:push` synchronizes checked-in Auth configuration when the
operator is authorized. The current remote anonymous toggle was separately
verified because this environment did not expose a CLI access token. This task
used the connected hosted-project tooling to apply and verify migrations; local
Docker is not required or authoritative.

Generated public-schema TypeScript types are committed at
`src/multiplayer/database.types.ts`. Regenerate them after every schema or RPC
signature change and review the diff with its migration.

## Browser environment

Copy `.env.example` to ignored `.env.local` and use only:

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_publishable_key
```

The publishable value may use Supabase's current `sb_publishable_...` format.
It is intentionally browser-safe and derives authority from Auth plus RLS.
Never put an `sb_secret_...`, legacy `service_role`, database password, or
database URL in a Vite variable or Playwright browser context. If these two
variables are absent, only `/multiplayer` shows a configuration-unavailable
state; local play and `/admin` keep working.

## Grants, RLS, and Realtime

RLS is enabled on `rooms`, `room_members`, `room_seats`, and `matches`.
Authenticated users receive explicit `SELECT` grants, but policies return rows
only for durable room members. There are no direct client insert/update/delete
grants. All writes pass through the eight authenticated RPCs documented in
[MULTIPLAYER.md](./MULTIPLAYER.md); execute was revoked from `PUBLIC` and
`anon`. Guessing a UUID or room code cannot bypass membership.

All four tables are in `supabase_realtime`. Realtime only invalidates client
caches; canonical authorization and state remain in Postgres.

Supabase's security advisor reports intentional warnings that authenticated
users can execute the reviewed security-definer RPCs and that anonymous
authenticated users can reach membership policies. These are expected for this
anonymous-RLS architecture: every function validates `auth.uid()`, uses an
empty search path, and is narrowly granted. Performance advice currently notes
no findings. The password-leak-protection warning is not applicable to this
anonymous-only milestone because the product exposes no password sign-in.

## Validation and cleanup

The committed SQL suite is designed to run transactionally:

```bash
pnpm test:multiplayer:concurrency
pnpm test:e2e:multiplayer
```

`pnpm supabase:test:db` is the CLI's optional local-stack pgTAP runner for the
same SQL file. It was not used for this task: all authoritative application and
database verification ran against the dedicated remote project as requested.

The connected remote SQL runner executed all 25 database/RLS assertions with
separate identities. The concurrency harness and browser tests create rooms,
then close and leave them through supported RPCs. They do not use a service-role
key. Closed room rows and anonymous Auth identities remain as hosted audit data;
there is no destructive test teardown.

The checked-in hosted-development setting permits 30 anonymous signups per hour
per source IP. Normal clients persist sessions, and the visual projects reuse an
ignored Playwright storage state. Repeated ad hoc isolated-context reruns can
temporarily exhaust this bucket; the route reports that condition accessibly.

For this foundation, no Storage bucket, Edge Function, matchmaking/public room
listing, permanent account, social login, email invitation, or gameplay reducer
is configured.
