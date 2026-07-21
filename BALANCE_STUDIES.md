# Balance study runbook

The balance-study runner is a self-service, unattended research tool. It builds a deterministic multi-configuration matrix and sends every match through canonical world generation, random territory assignment, `balanced-v1`, the authoritative reducer, invariant checks, and the existing headless match runner. It does not tune rules or bot weights.

## Operator workflow

Terminal 1:

```bash
pnpm dev
```

Open <http://localhost:5173/admin> and use the read-only **Balance Studies** section.

Terminal 2, preview before committing time:

```bash
pnpm study:balance --preset thorough --dry-run
pnpm study:balance --preset thorough
```

`Ctrl+C` and `SIGTERM` finish the current match, atomically checkpoint it, and mark the study `interrupted`. Resume without repeating completed match indices:

```bash
pnpm study:balance --resume <run-id>
```

The starting commit is recorded. Resume from a different commit is refused unless the operator deliberately adds `--force`; the report retains the mismatch. An abrupt shutdown may lose work since the last checkpoint, but the previous atomic checkpoint stays valid. A dashboard report that remains `running` without an update for 30 seconds is shown as abandoned/resumable.

Inspect, export, or share compact results:

```bash
pnpm study:balance --inspect <run-id> --format summary
pnpm study:balance --inspect <run-id> --format json > balance-summary.json
pnpm study:balance --inspect <run-id> --format csv > balance-configurations.csv
pnpm study:balance --inspect <run-id> --format json --export ./balance-summary.json
pnpm study:balance --reproduce '<descriptor>' --verbose
```

Share the run ID, compact JSON, and any reproduction descriptors—not checkpoint data or raw terminal output. Future agents should inspect an existing compact result before asking to rerun a large study.

## Presets and estimates

| Preset     | Configurations | Matches/config |  Total | Baseline estimate at 3 games/s |
| ---------- | -------------: | -------------: | -----: | -----------------------------: |
| quick      |              4 |              4 |     16 |                about 5 seconds |
| standard   |              6 |            100 |    600 |     about 3 minutes 20 seconds |
| thorough   |              6 |          1,000 |  6,000 |               about 33 minutes |
| exhaustive |              6 |         10,000 | 60,000 |       about 5 hours 33 minutes |

These are rough estimates based on historical 12-territory throughput. Larger worlds and higher player counts are slower; dry-run output labels runtime as an estimate. `exhaustive` only runs when named explicitly and is never part of normal tests or verification profiles.

The representative matrix spans 2–5 players, 12–48 territories, 2–8 continents, small/standard/large world buckets, different territory-to-player and continent-density ratios, deterministic world and match seeds, ownership/assignment variants, and rotated seat order. Custom JSON can change these without code edits and is runtime-validated against supported limits.

The runner deliberately uses one worker. Sequential execution keeps aggregation and checkpoints predictable and leaves `/admin` responsive. `--workers 1` is accepted; other values fail clearly.

## Reports and interpretation

Artifacts are ignored by Git under `.fustify/reports/studies/`: `latest.json`, `history/<run-id>.json`, and `checkpoints/<run-id>.json`. Reports use dedicated schema version 1. Writes use same-directory temporary files and atomic rename. Completed history retains the newest 20 reports; active checkpoints are never removed by retention.

Hard failures include engine errors and invariant failures. Seat differences of at least 8 percentage points from the mixed equal-seat baseline, cap rates of at least 5%, and stalemate rates of at least 5% are warnings by default. Warnings are findings and do not fail a study.

Seat summaries report observed win percentage, sample count, difference from equal-seat baseline, and a two-sided 95% Wilson score interval. This describes binomial uncertainty and does not prove causation. Starting territory counts are reported by seat. Starting total armies are fixed equally by canonical setup rules for each player count. Match length uses nearest-rank median, p90, p95, and p99 values.

Successful full traces are not retained. Engine failures preserve reproduction descriptors, and verbose reproduction produces a focused single-match trace on demand.
