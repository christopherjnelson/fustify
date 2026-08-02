# Fustify

[![CI](https://github.com/christopherjnelson/fustify/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/christopherjnelson/fustify/actions/workflows/ci.yml)

**Strategy on a different world every time.**

<img width="1827" height="875" alt="procedural generated strategy" src="https://github.com/user-attachments/assets/48362323-f810-4962-88e6-aaeb5355514b" />

**[Play the live beta →](https://dev.fustify.com)**

Fustify is a browser strategy game played on deterministic, procedurally
generated spherical worlds. Registered players can play locally against
heuristic bots or people sharing a device, or create public and private
authoritative multiplayer rooms for 2–5 human players.

The application includes:

- a normalized deterministic world generator shared by the globe, minimap,
  local play, simulation, and hosted matches;
- a default 42-territory, 6-continent world with four local seats;
- random distributed ownership or a complete local round-robin draft;
- reinforcement, deterministic combat, capture movement, fortification,
  elimination, and victory through one authoritative reducer;
- browser-local versioned saves and shareable versioned setup URLs;
- registered-account multiplayer with durable rooms, seats, immutable
  published settings, authoritative commands, and Realtime recovery;
- deterministic heuristic controllers, simulations, balance studies, and
  replayable failure descriptors;
- responsive keyboard- and touch-capable globe, minimap, navigator, HUD, and
  accessibility behavior;
- deterministic unit, simulation, Playwright, visual-regression, and
  world-quality verification.

## Routes

| Route                         | Purpose                                                       |
| ----------------------------- | ------------------------------------------------------------- |
| `/`                           | Home page, generated-world preview, and account controls      |
| `/local`                      | Local humans and/or deterministic heuristic bots              |
| `/multiplayer`                | Public game browser and private-room creation/joining         |
| `/multiplayer/room/:roomId`   | Waiting room, world settings, publication, and seat selection |
| `/multiplayer/match/:matchId` | Canonical authoritative multiplayer match                     |
| `/admin`                      | Protected operations and local verification reports           |

Legacy setup links at `/?v=1&...` remain supported and open local setup
directly.

## Local development

Use the Node.js and pnpm versions compatible with `package.json`:

```bash
pnpm install
pnpm dev
```

`pnpm dev` starts Vite on port 5173 and the localhost Node API on port 8787 by
default. Vite proxies `/api/*` to that API.

Copy `.env.example` to `.env.local` and configure
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Multiplayer match
initialization also requires the server-only `SUPABASE_SERVICE_ROLE_KEY`.
Never expose that service-role key through a `VITE_` variable.

Production uses a combined immutable frontend/API release on an Ubuntu
droplet behind Caddy. Use the
[deployment runbook](./docs/operations/deployment.md) for setup, secrets,
deployment, rollback, retention, and recovery.

## Commands

Core checks:

```bash
pnpm test
pnpm test:coverage
pnpm test:simulation
pnpm test:simulation:stress
pnpm test:bot
pnpm test:bot:stress
pnpm lint
pnpm format:check
pnpm build
pnpm bundle:check
```

Browser and visual checks:

```bash
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:e2e:multiplayer
pnpm test:visual
pnpm test:visual:multiplayer
pnpm test:world-visual
WORLD_AUDIT_PHASE=my-review pnpm audit:world-visual
```

Structured verification and research:

```bash
pnpm verify:report
pnpm verify:report:full
pnpm simulate:bots -- --games 10
pnpm study:balance --preset quick
pnpm study:balance --preset thorough --dry-run
```

Generated-output cleanup:

```bash
pnpm clean --dry-run
pnpm clean
pnpm clean:reports --dry-run
pnpm clean:reports
pnpm clean:all --dry-run
pnpm clean:all
```

`clean` removes reproducible build, coverage, Playwright, bundle-analysis, and
release-staging output. `clean:reports` explicitly removes ignored verification,
world-generation, balance-study, bot-simulation, and legacy local image
artifacts. `clean:all` combines them. Cleanup is repository-bound and never
touches `.env.local`, `node_modules`, or Supabase local state.

## World and match contracts

Fresh local and multiplayer worlds default to 42 territories and 6 gameplay
continents. Local setup starts with four seats—one local human and three
heuristic bots—and may be configured for 2–5 seats. Multiplayer supports 2–5
human seats and random assignment. Compatible historical setup data may still
contain up to 8 continents or 6 seats.

Version-1 setup URLs serialize:

| Parameter     | Default  | New-creation range         |
| ------------- | -------- | -------------------------- |
| `v`           | `1`      | `1`                        |
| `seed`        | random   | Any non-empty string       |
| `territories` | `42`     | 12–48                      |
| `continents`  | `6`      | 2–6                        |
| `players`     | `4`      | Local 2–5; multiplayer 2–5 |
| `assignment`  | `random` | `random` or local draft    |

Example:

```text
http://localhost:5173/local?v=1&seed=atlas-prime&territories=42&continents=6&players=4&assignment=random
```

`PlanetDefinition` is immutable generated geography. `MatchState` owns mutable
turn, territory, army, selection, combat, elimination, event, and victory
state. The UI, controllers, simulator, browser persistence, Node initializer,
and multiplayer Edge Function all use the same legal-action helpers and
`gameReducer`; there is no parallel rules implementation.

Generation is deterministic for its seed, setup, generator version, and code
version. Random starting positions evaluate a bounded deterministic candidate
set. Combat uses a separate deterministic match stream. Cosmetic geographic
names do not consume terrain, ownership, controller, or combat randomness.

## Architecture

- `src/core/` contains platform-neutral generation, setup, rules, persistence,
  controllers, and simulation.
- `src/components/`, `src/app/`, and `src/browser/` contain local application
  presentation and routing.
- `src/multiplayer/` contains room, match synchronization, publication, and
  browser integration.
- `api/` contains the trusted Node match initializer and HTTP service.
- `supabase/` contains migrations, Edge Functions, database tests, and
  generated database contracts.
- `scripts/` contains development, verification, analysis, study, release, and
  maintenance tooling.
- `tests/e2e/` contains browser interaction and committed visual baselines.

The visual scenario driver remains development-only and requires both
`import.meta.env.DEV` and `visual-review=1`. Generated verification output is
ignored under `.fustify/reports/`, `test-results/`, `coverage/`, and
`artifacts/`.

## Documentation

Use [docs/README.md](./docs/README.md) as the documentation index. The primary
runbooks are:

- [multiplayer](./docs/gameplay/multiplayer.md)
- [controllers and simulation](./docs/gameplay/controllers.md)
- [balance studies](./docs/gameplay/balance-studies.md)
- [world generation](./docs/world-generation/README.md)
- [verification](./docs/operations/verification.md)
- [Supabase](./docs/operations/supabase.md)
- [bundle analysis](./docs/operations/bundle-analysis.md)
- [deployment](./docs/operations/deployment.md)
- [brand assets](./docs/brand/README.md)

Architecture and operational behavior belong in the relevant active runbook;
Git history is the archive for superseded implementation milestones.

## License

Fustify is source-available under the
[PolyForm Noncommercial License 1.0.0](./LICENSE).

You may use, study, modify, and run Fustify for personal and other
noncommercial purposes. Commercial use—including paid or advertising-supported
hosting, resale, or monetized derivative works—requires prior written permission
from Christopher J. Nelson.

The Fustify name and logo may not be used to imply that a derivative project is
official, affiliated with, or endorsed by Fustify.

Copyright © 2026 Christopher J. Nelson.
