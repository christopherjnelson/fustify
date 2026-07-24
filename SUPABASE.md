# Supabase development

## Remote project

The only authorized deployment target is:

- Project: `fustify-multiplayer`
- Ref: `qwmsybhpjnfjiyxcspwj`
- Region: `us-east-1`
- PostgreSQL: 17

Never reset this project or delete unrelated audit rows. The source of truth is
`supabase/migrations/` plus `supabase/functions/multiplayer-game/`.

Migration order:

1. `20260722040118_create_multiplayer_foundation.sql`
2. `20260722040242_add_rooms_host_index.sql`
3. `20260722041857_fix_update_room_settings_conflict.sql`
4. `20260722043353_release_seat_on_member_delete.sql`
5. `20260722190224_authoritative_multiplayer_gameplay.sql`
6. `20260722192905_harden_match_command_grants.sql`
7. `20260722201731_finalize_after_capture_movement.sql`
8. `20260724032701_add_match_event_reactions.sql`
9. `20260724062455_create_profile_foundation.sql`
10. `20260724081653_add_email_password_accounts.sql`

The authority migration extends `matches`, creates append-only
`match_commands`, adds member-scoped read RLS, removes browser execution of the
old preview start RPC, adds service-role-only initialization/commit functions,
and publishes command notifications. The grant hardening migration narrows the
command ledger to service-role `SELECT`/`INSERT`. The completion migration keeps
a winning capture active until its mandatory movement reaches the reducer's
`game-over` phase, then persists completion. All are additive and preserve
historical preview/audit rows; an old preview cannot silently become playable
and reports `legacy_match_incomplete`.

The reaction migration adds participant-readable `match_event_reactions`,
explicit desired-state `set_match_event_reaction`, canonical snapshot event-ID
validation, direct-DML denial, and Realtime publication membership. Reaction
rows are social metadata and never update `matches`, `match_commands`, gameplay
revision, state fingerprint, or winner fields.

The profile migration adds application-owned `profiles` keyed directly by
`auth.users.id`, creates rows for new anonymous or permanent Auth users,
backfills existing users, and exposes authenticated reads plus controlled
own-profile ensure/update RPCs. Browser roles have no direct profile write
grants. Display names and HTTPS avatar URLs are presentation data only; profiles
contain no role, permission, or administrator fields.

The account migration derives readable guest names from each Auth user UUID,
updates only untouched `Guest XXXX` fallbacks, and keeps aliases and historical
snapshots unchanged. Its private registered-account helper trusts only
`auth.uid()` and the JWT `is_anonymous` boolean, failing closed when the claim is
missing or malformed. Guests may still ensure and read profiles, rooms, matches,
Activity events, and reactions, but profile updates and reaction mutations now
return `account_required`. Registered users retain the existing RPC behavior.
The frontend capability model mirrors these restrictions for profile editing,
reactions, and future chat presentation. Future chat writes must independently
enforce registered-user status on the server.

The hosted history contains all ten migrations in this order. Edge Function
`multiplayer-game` is active at version 3 with `verify_jwt=false`. The Activity
reaction, profile-foundation, and account work do not change
authority-imported source and therefore do not redeploy this function.

## Secrets and browser configuration

The browser uses only:

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_publishable_key
```

Never add a secret key, legacy `service_role`, database password, access token,
or database URL to a `VITE_` variable. Hosted Edge Functions receive
`SUPABASE_URL`, the publishable/anon key, and `SUPABASE_SERVICE_ROLE_KEY`
automatically. `multiplayer-game` disables the legacy gateway JWT check in
`config.toml` and explicitly verifies the bearer token with `auth.getUser()` so
current asymmetric and legacy user JWTs share one controlled path.

## Email Auth prerequisites

Before testing email/password Auth against the hosted project:

- Enable the email/password provider and choose whether confirmation is
  required. The application supports required confirmation.
- Add the deployed origin's exact `/auth/callback` and
  `/auth/reset-password` URLs, plus their local equivalents, to the Auth
  redirect allow list. Do not use an external return URL; the client accepts
  only known same-origin application paths.
- Set the hosted Site URL to the deployed application origin. The checked-in
  `config.toml` intentionally contains only local development URLs and must not
  be pushed unchanged as production Auth configuration.
- Configure custom SMTP before friend or volume testing. Supabase's hosted
  default sender is test-only and rate limited. SMTP credentials belong only
  in Supabase's secret configuration, never Git or browser variables.
- Enable an appropriate password policy and leaked-password protection for
  production. The application requires at least eight characters client-side,
  while Supabase remains the final policy authority.

Local registration, confirmation, anonymous upgrade, and recovery are exercised
against Mailpit with `pnpm test:auth:local`. The script uses generated disposable
identities, does not print email addresses, passwords, tokens, or verification
links, and removes its local Auth users and room records.

## Deployment

Using the authenticated Supabase connector:

1. Confirm project ref and current remote migration history.
2. Apply the exact source-controlled migrations in filename order.
3. Deploy `multiplayer-game` with every relative shared-engine dependency and
   `verify_jwt=false` because authentication is performed in its handler.
4. Regenerate `src/multiplayer/database.types.ts` from the deployed schema and
   review the diff.
5. Confirm remote migration history, function version/configuration, grants,
   RLS policies, publication membership, and advisors.

CLI equivalents, when `SUPABASE_ACCESS_TOKEN` is available, are:

```bash
pnpm supabase:link
pnpm supabase:migrations:list
pnpm supabase:db:push
pnpm exec supabase functions deploy multiplayer-game \
  --project-ref qwmsybhpjnfjiyxcspwj --no-verify-jwt --use-api
pnpm supabase:types
```

Do not use `--prune`, reset, or dashboard-only DDL.

## Security model

RLS is enabled on every exposed application table. Authenticated room members
receive explicit read grants and policies; non-members see no room, seat, match,
command, or reaction rows. There are no browser insert/update/delete grants for
canonical match state, commands, or reactions. Authority RPC execute is revoked
from `PUBLIC`, `anon`, and `authenticated`, then granted only to `service_role`.
The reaction RPC is the narrow exception: only `authenticated` may execute it.
It derives the caller from `auth.uid()`, requires the trusted JWT
`is_anonymous` claim to be exactly `false`, requires current room membership and
the claimed human seat recorded in the immutable seat snapshot, and accepts no
caller-supplied user ID. Profile customization uses the same private
registered-account check. No profile value or user-editable metadata grants
either capability.

The Edge Function derives `actor_user_id` from the verified JWT, never request
JSON. Both TypeScript and SQL validate current seat membership; SQL locks the
canonical row and independently checks actor-to-player mapping and revision.
Exact action parsing rejects extra fields, including fabricated combat rolls.
SHA-256 fingerprints use recursively sorted JSON keys.

`supabase/tests/authoritative_multiplayer.sql` documents transactional pgTAP
coverage. Remote runtime coverage is `pnpm test:multiplayer:authority`, which
uses only publishable browser clients and supported endpoints. Advisor output
must be reviewed after deployment; intentional anonymous-auth warnings do not
permit weakening grants or policies.

## Remote validation checklist

- Migration history exactly matches Git.
- `matches` and `match_commands` RLS are enabled.
- `match_event_reactions` RLS is enabled and browser roles have `SELECT` only.
- `profiles` RLS is enabled, authenticated users have `SELECT` only, and the
  trigger/backfill leave one profile per Auth user.
- New anonymous users receive deterministic adjective+noun names with a
  three-digit suffix; only exact old per-user fallbacks are backfilled.
- Anonymous and malformed/missing-claim callers receive `account_required` for
  profile and reaction mutations; registered callers retain normal behavior.
- Member reads and non-member zero-row behavior pass.
- Browser writes and authority-function execution fail.
- Reaction writes validate canonical event ownership, participant identity, and
  explicit set/remove semantics without changing gameplay state.
- Edge calls without/with invalid JWTs return 401.
- Unseated, non-member, and out-of-turn commands fail.
- One duplicate key produces one command row/revision.
- Changed-payload key reuse and stale revisions fail.
- Completed matches reject new keys.
- Function source/configuration matches Git.
- Frontend output contains no service-role/secret-key material.
- Two-browser and mobile recovery gates pass before calling the beta playable.

Test cleanup closes/leaves rooms through public RPCs. Closed rooms, command
history, and anonymous Auth audit rows are retained; tests never delete them.
