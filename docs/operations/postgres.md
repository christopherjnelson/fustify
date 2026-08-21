# PostgreSQL and application API

Fustify has one supported backend: the Node application API in `api/` backed by
plain PostgreSQL. Browser code talks only to same-origin `/api/*` routes. It
does not connect to PostgreSQL or a database vendor SDK directly.

## Local operation

The easiest complete environment is:

```bash
docker compose up --build
```

This starts PostgreSQL 17 and the combined frontend/API service at
<http://localhost:8080>. The database is stored in the named
`fustify-postgres` volume. To start with an empty database, explicitly remove
that volume with `docker compose down --volumes`; this permanently deletes
local accounts, rooms, and matches.

For host-based development, copy `.env.example` to `.env.local`, provide a
reachable `DATABASE_URL`, and run `pnpm dev`. Required production settings are:

- `DATABASE_URL`: server-only PostgreSQL connection string.
- `BETTER_AUTH_SECRET`: high-entropy server-only signing secret.
- `BETTER_AUTH_URL`: public application origin.
- `FUSTIFY_TRUSTED_ORIGINS`: comma-separated allowed browser origins.

No browser environment variable, email provider, OAuth application, Discord
callback, or Supabase project is required. Email/password registration signs
the player in immediately and deliberately skips email verification.

## Migrations

Ordered SQL files live in `database/migrations/`. API startup takes a PostgreSQL
advisory lock, creates `fustify_schema_migrations` when needed, and applies each
pending migration transactionally. Add schema changes as a new numbered file;
never edit a migration that may already have run on another installation.

The application tables use normal PostgreSQL constraints and transactions.
Authorization is enforced at the API boundary and within transactional service
methods; the browser never receives database credentials.

## API boundaries

- `/api/auth/*` is handled by Better Auth using the same PostgreSQL pool.
- `/api/profile*` owns profile reads, username checks, and updates.
- `/api/multiplayer/rooms*` owns room discovery and lifecycle operations.
- `/api/multiplayer/matches*` owns canonical state, gameplay commands,
  reactions, and generated room thumbnails.
- `/api/health` is the runtime health endpoint.

Authoritative gameplay locks the canonical match row, validates membership,
seat, turn, revision, action, and idempotency, then applies the shared
`gameReducer` and persists the command plus resulting snapshot in one
transaction.

## Validation

Run unit and integration checks with `pnpm test`. Use the multiplayer
Playwright suites for browser lifecycle coverage and `pnpm build:release` for
the deployable combined artifact. A targeted live smoke should cover immediate
signup, profile load, room create/join/seat claim, match start, one gameplay
command, idempotent retry, reactions, and thumbnail delivery.
