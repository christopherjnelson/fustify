# Verification reports

Fustify's developer verification pipeline runs existing pnpm checks and writes
validated JSON artifacts for command-line and file-based review.

Run `pnpm verify:report` for the practical standard profile (unit, typecheck,
lint, build, formatting, diff consistency, quick bots, and coverage). The unit
suite already includes the ordinary generation-simulation smoke matrix. Run
`pnpm verify:report:full` to add Playwright interaction and visual comparisons
plus generation and bot stress suites. Independent checks continue after a
failure. Extended thousands-game studies remain explicit `pnpm simulate:bots`
commands and are never part of ordinary verification.

Reports use schema version 1, validated at every write and read. The runner
atomically replaces `.fustify/reports/latest.json` before and after each suite,
then stores the completed or interrupted report at
`.fustify/reports/history/<run-id>.json`. History defaults to 20 reports and can
be changed with `FUSTIFY_REPORT_RETENTION`; generated reports are ignored by
Git. Writes use a same-directory temporary file plus rename, so readers never
observe partial JSON. Output is ANSI-stripped and bounded. Reports contain Git
branch, full/short commit, subject, initial/final cleanliness, changed-file
count, Node/platform identifiers, suite commands/results, coverage, adapted
simulation summaries, and bounded diagnostics—never environment contents,
remote URLs, arbitrary paths, or secrets.

SIGINT and SIGTERM terminate the active child and preserve the run and suite as
`interrupted`; nonzero commands are `failed`; exceptions are recorded rather
than losing the partial run. Pending suites are never presented as passed. A
running report older than 30 seconds is shown as potentially abandoned, without
rewriting it.

Inspect `.fustify/reports/latest.json` for the current result and
`.fustify/reports/history/` for retained runs. The schemas and report-store
tests remain the authority for parsing and retention.

Bot data is adapted from the existing `BotSimulationReport`: requested and
completed games, outcomes, wins, turn percentiles, caps, errors, invariants,
runtime, throughput, and reproduction descriptors. The existing simulation
contract and reducer remain authoritative.

Future agents should run the appropriate report-enabled profile and include
the resulting run ID in their handoff. Never claim that an
interrupted, incomplete, pending, or skipped suite passed.

## Generated-output maintenance

Use `pnpm clean --dry-run` to preview routine removal of reproducible builds,
coverage, Playwright output, bundle analysis, and release staging. `pnpm clean`
performs that bounded cleanup without touching verification or research
history.

Use `pnpm clean:reports --dry-run` before intentionally removing all local
verification, world-generation, balance-study, bot-simulation, and legacy
image artifacts. `pnpm clean:all` combines report and transient cleanup.
Targets are fixed inside the Fustify repository; the commands never remove
`.env.local`, dependencies, or PostgreSQL data.

## Procedural-world visual audit

World-generation changes use a focused Playwright path rather than gameplay
matches:

```bash
pnpm exec playwright install chromium
pnpm test:world-visual
WORLD_AUDIT_PHASE=investigation pnpm audit:world-visual
```

The acceptance command runs the checked-in seed matrix and fails hard
structural or severe shape findings. The audit command captures the same
evidence without failing on findings, which is useful for a pre-fix baseline.
Each run replaces its selected phase directory before capture, preventing
removed fixtures from contaminating later summaries. Use different phase names
when a before/after comparison must coexist. Artifacts live under ignored
`.fustify/reports/world-generation/<phase>/`. Inspect `index.html`, every
known-bad capture, the complete laptop matrix, and responsive full-page images;
passing DOM/metric assertions do not replace image review. Camera captures use
0°, 90°, 180°, and 270° longitude at fixed elevation and distance.

This suite does not run matches or bot simulations. Focused generator, URL,
save, typecheck, lint, build, formatting, diff, and bundle checks remain
separate gates. Details and quality thresholds are in
[`../world-generation/README.md`](../world-generation/README.md).
