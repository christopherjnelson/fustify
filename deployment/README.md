# Fustify droplet release

The release contains three artifacts built from the same commit:

- `web/`: the Vite production frontend
- `api/server.mjs`: the localhost-only Node 24 HTTP API
- `api/initializer-worker.mjs`: the worker-thread authoritative initializer

The API authenticates the caller with Supabase Auth, authorizes the canonical
room host, loads canonical settings and profiles with the server-only service
role, and commits through the existing `authority_initialize_room_match` RPC.
Normal gameplay remains on the `multiplayer-game` Edge Function.

## One-time setup

These steps are intentionally not automated beyond installing reviewed files.
They assume the droplet already has Caddy, `/usr/local/bin/node` version 24, pnpm, an
existing non-root deploy user, and a clean Fustify checkout.

1. Replace the existing Fustify Caddy site block with the reviewed
   `deployment/fustify.caddy` template. If sites are split into snippets, the
   main Caddyfile can import it with:

   ```caddyfile
   import /etc/caddy/sites/*.caddy
   ```

   Do not add a second block for the same hostname. Validate and reload the
   resulting Caddy configuration:

   ```sh
   sudo caddy validate --config /etc/caddy/Caddyfile
   sudo systemctl reload caddy
   ```

2. Run the systemd/release-directory setup from the checkout:

   ```sh
   sudo ./deployment/setup-droplet.sh fustify
   ```

3. Replace every placeholder in the server-only environment file:

   ```text
   /home/fustify/.config/fustify/fustify-api.env
   ```

   Keep it mode `0600`. Required names are `SUPABASE_URL`,
   `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
   `FUSTIFY_API_PORT` is optional and defaults to `8787`; if changed, update
   Caddy and the deployment health URL together.

4. Return to the non-root deploy user and create the first release:

   ```sh
   pnpm deploy:droplet
   ```

No Supabase migration or Edge Function deployment is part of this droplet
command. Subsequent frontend/API deployments use only `pnpm deploy:droplet`
after the desired commit is checked out.

The command installs the locked repository dependencies, builds all three
artifacts, stages an immutable directory under `/srv/fustify/releases`, swaps
`/srv/fustify/current` atomically, restarts the user service, and checks
`GET /api/health`. A failed restart or health check restores the previous
symlink and service. Releases are retained for manual audit and pruning.
