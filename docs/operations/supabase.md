# Supabase development

## Remote project

The only authorized deployment target is:

- Project: `fustify-multiplayer`
- Ref: `qwmsybhpjnfjiyxcspwj`
- Region: `us-east-1`
- PostgreSQL: 17

Never reset this project or delete unrelated audit rows. The source of truth is
`supabase/migrations/` plus the source-controlled directories under
`supabase/functions/`.

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
11. `20260724171927_account_required_gameplay.sql`
12. `20260724211217_canonical_profile_multiplayer_names.sql`
13. `20260725083521_default_rooms_to_normalized_generator.sql`
14. `20260725083532_add_public_multiplayer_browser.sql`
15. `20260725180409_secure_admin_dashboard.sql`
16. `20260725193047_expire_inactive_multiplayer_rooms.sql`
17. `20260725212915_discord_room_announcements.sql`
18. `20260725231245_publish_immutable_public_lobbies.sql`
19. `20260727055631_multiplayer_match_launch_state.sql`
20. `20260728042940_expand_admin_operations.sql`

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

The immutable-public-lobbies migration makes private waiting the authoritative
creation result, adds the host-only `publish_room` transaction, locks
advertised settings after publication, clears published room codes, narrows
public joining to an ID-only result, and makes the private-to-public update the
sole Discord enqueue event. Existing public rooms are immediately treated as
published and locked; existing private waiting rooms remain editable.

The multiplayer-match-launch-state migration adds a service-role-only launch
lease. It moves a validated room to `active` before server-side world
generation so all current members receive the launch state through the
existing member-scoped room subscription, clears the lease when the canonical
match is inserted, and supports token-matched failure cleanup plus a
five-minute abandoned-launch retry.

The expanded administration migration adds application-owned moderation,
append-only privileged-action auditing, server-only room lifecycle functions,
curated health and cleanup-candidate snapshots, safe Discord retry, and a
nightly cleanup dry run. Browser roles have no table access or function
execution for this surface. Its shared access check is also applied to
registered-user mutation boundaries; the Node match-start service and
`multiplayer-game` Edge Function independently reject blocked accounts so an
already-issued JWT cannot retain Fustify write access.

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

The Node administration API prefers `SUPABASE_SECRET_KEY`; a legacy
`SUPABASE_SERVICE_ROLE_KEY` is accepted only as a migration fallback.
`SUPABASE_MANAGEMENT_ACCESS_TOKEN` is optional and must be a server-only,
fine-grained token with `analytics_logs_read` for the curated log feed. Set
`SUPABASE_PROJECT_REF` explicitly in production. Keep
`FUSTIFY_ADMIN_MUTATIONS_ENABLED=0` through initial read-only validation, then
set it to `1` only after the remote grants, moderation enforcement, audit
inserts, and synthetic-room smoke checks pass.

The `/api/admin/*` routes verify the bearer token with Auth and then query the
application-owned `user_roles` table on every request. They return
`Cache-Control: no-store`, validate bounded inputs, and never expose join codes,
raw log payloads, credentials, full identifiers without an audited reveal, or
the analytics token. The log view uses the ClickHouse-backed Management API
`analytics/endpoints/logs` endpoint and does not persist imported entries. The
Metrics API is scraped server-side with the project secret and returns only
selected aggregates. Host and droplet telemetry remain outside this console.

Room cleanup remains deliberately non-destructive at first. The
`admin-nightly-room-cleanup-dry-run` cron records only job health while the
Maintenance section lists up to 100 eligible candidates. A room is eligible
only when it is closed, memberless, older than 30 days, and has no match.
Anything associated with match history is preserved indefinitely. Manual purge
and announcement retry require a reason, confirmation, an idempotency key, and
the mutation feature flag.

`announce-public-room` also uses `verify_jwt=false`, but it is not public. It
requires a dedicated secret in the `apikey` header and compares that value to
the Edge Function secret
`DISCORD_ROOM_ANNOUNCEMENT_INVOCATION_SECRET`. The outbound
`DISCORD_WEBHOOK` secret is never accepted for inbound authentication.

Before applying the Discord announcement migration:

1. Keep the existing `DISCORD_WEBHOOK` Edge Function secret.
2. Generate one new high-entropy value and store it as the Edge Function secret
   `DISCORD_ROOM_ANNOUNCEMENT_INVOCATION_SECRET`.
3. Store the same value in Vault as
   `discord_room_announcement_invocation_secret`.
4. Store
   `https://qwmsybhpjnfjiyxcspwj.supabase.co/functions/v1/announce-public-room`
   in Vault as `discord_room_announcement_function_url`.

No value for either secret belongs in Git, a migration, `config.toml`, a test
fixture, or a browser variable. If either Vault entry is missing, room
publication still commits and the announcement remains pending without an HTTP
request.

The single `discord_room_announcement_config` row is editable in Studio.
Supported placeholders in the title and description templates are
`{{room_name}}`, `{{join_url}}`, `{{open_seats}}`, `{{max_seats}}`, `{{seed}}`,
`{{territory_count}}`, `{{continent_count}}`, `{{assignment_mode}}`, and
`{{configuration_summary}}`. The locked seed and core world/capacity fields are
always present; open-seat-at-publication and configuration-summary fields
remain configurable. Mentions are always disabled in the Discord payload.
Delivery starts disabled and must be enabled as the final controlled rollout
step.

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

For the immutable-public-lobbies rollout, preserve this compatibility order:

1. Confirm the project ref, migration history, and Discord Edge/Vault
   prerequisites.
2. Deploy the backward-compatible `announce-public-room` source with
   `verify_jwt=false`; its handler performs dedicated `apikey` authentication.
3. Apply the exact source-controlled migrations in filename order.
4. Verify function definitions and grants, RLS, immutable-setting enforcement,
   private/public joining, discovery, and one publication outbox row.
5. Regenerate `src/multiplayer/database.types.ts` from the deployed schema,
   verify the pending migration surface, and preserve the accepted nullable
   `update_own_profile.p_avatar_url` and
   `set_match_event_reaction.p_reaction` parameters.
6. Deploy the frontend.
7. Run one controlled private-create → publish → public-list → Discord →
   direct-join test, then enable delivery only when all gates pass.

CLI equivalents, when `SUPABASE_ACCESS_TOKEN` is available, are:

```bash
pnpm supabase:link
pnpm supabase:migrations:list
pnpm exec supabase functions deploy announce-public-room \
  --project-ref qwmsybhpjnfjiyxcspwj --no-verify-jwt --use-api
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

Public discovery and public joining are narrow registered-account functions,
not broad table reads. `list_public_rooms` returns only safe card data for
published public waiting rooms and omits room codes and account identifiers.
`join_public_room` locks the target room and reuses the membership/capacity
rules before returning only its ID. `publish_room` uses the same row lock,
derives the caller from `auth.uid()`, requires the registered host, validates
the complete final configuration and an available seat, clears the private
code, and crosses the private-to-public boundary once. These functions pin
`search_path`, revoke default/anonymous execution, and grant execution only to
`authenticated`.

Discord announcement configuration and outbox tables have RLS enabled and no
`anon` or `authenticated` grants or policies. A deferred trigger runs only for
the private-to-public room update and inserts at most one outbox row per room.
Creation, private edits, membership changes, heartbeats, and later room updates
do not enqueue. The Edge Function revalidates public/waiting
status, member capacity, seats, and configuration after atomically claiming a
pending row. Failures store only bounded error codes. There is no automatic
retry: after verifying that Discord did not accept an ambiguous timed-out
request, an operator may call
`multiplayer_private.reset_discord_room_announcement(uuid)` in the SQL editor
to reset and asynchronously redispatch failed or stuck work.

The public `room-thumbnails` bucket accepts only WebP objects up to 1 MiB.
Object writes are restricted to authenticated hosts, public rooms, and the
exact `{room-id}/world.webp` path. Upsert is covered by host-scoped
`SELECT`/`INSERT`/`UPDATE` policies; delete uses the same ownership predicate.
The image contains only deterministic world geometry, and the room row stores
only its object path and monotonically increasing cache version.

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
- `account_moderation` and `admin_action_audit` have RLS enabled and no browser
  grants; the audit table grants `SELECT`/`INSERT` only to `service_role`.
- Blocked, revoked, and soft-deleted accounts fail browser mutation RPCs,
  Node match start, and Edge Function commands while active users still pass.
- `/api/admin/*` rejects missing, ordinary, anonymous, blocked, and stale
  sessions before touching privileged clients.
- Account reveal and every mutation append an outcome with actor, target,
  reason, request ID, and idempotency key; admin/self targeting is rejected.
- Curated logs redact identifiers, network addresses, query values, tokens, and
  payloads, and the Logs Explorer link opens the same project.
- The nightly cleanup job remains dry-run until candidates have been reviewed;
  matched rooms never appear in the candidate set.
- `matches` and `match_commands` RLS are enabled.
- `match_event_reactions` RLS is enabled and browser roles have `SELECT` only.
- `profiles` RLS is enabled, authenticated users have `SELECT` only, and the
  trigger/backfill leave one profile per Auth user.
- New anonymous users receive deterministic adjective+noun names with a
  three-digit suffix; only exact old per-user fallbacks are backfilled.
- Anonymous and malformed/missing-claim callers receive `account_required` for
  profile and reaction mutations; registered callers retain normal behavior.
- Public listing excludes private and non-waiting rooms and exposes no join
  codes, user IDs, emails, or administrative fields.
- New rooms are private waiting rooms regardless of a deployed old client's
  requested visibility.
- Only the registered host can publish a structurally valid, non-full private
  waiting room; the transition clears the code and enqueues exactly once.
- Published, active, and closed room settings cannot change, and public
  visibility cannot be reverted.
- Public joining rechecks visibility, waiting state, membership, and capacity
  under a room lock and returns only the room ID; code joining rejects public
  rooms.
- Only a public room host can write its exact stable thumbnail object path or
  publish its thumbnail metadata.
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
