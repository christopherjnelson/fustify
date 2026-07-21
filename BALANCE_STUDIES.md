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

Preset definitions are version 2. Historical schema-v1 reports without a
preset version remain readable and are labeled legacy; their matrices are not
reinterpreted.

| Preset          | Purpose/matrix                                      | Matches/config |  Total |
| --------------- | --------------------------------------------------- | -------------: | -----: |
| quick           | 42/6 at 4–6 seats + two engine edge cases           |              4 |     20 |
| standard        | 42/6 at 4–6 seats + limited engine regression       |            100 |    500 |
| thorough        | product balance: 42/6 at 4, 5, and 6 seats          |          1,000 |  3,000 |
| exhaustive      | explicit large product balance; never automatic     |         10,000 | 30,000 |
| engine-coverage | 12/2 two-seat and 18/4 three-seat boundary coverage |             10 |     20 |

Dry runs show an estimate range, source, and quality. With no valid local
history, the conservative fallback weights each match by territory and player
count instead of assuming 3 games/s. Completed configuration throughput is
persisted in reports for offline inspection. Interrupted/invalid results are
not authoritative timing evidence. `exhaustive` only runs when named explicitly.

Every configuration is explicitly `product-balance` or `engine-coverage`.
Product conclusions use 42 territories, 6 continents, and 4–6 seats with
deterministic seeds, assignment variants, and rotated seats. Small, unusual,
and two-player worlds remain a small engine regression surface. Custom JSON can
change the matrix without code edits and is runtime-validated.

The runner deliberately uses one worker. Sequential execution keeps aggregation and checkpoints predictable and leaves `/admin` responsive. `--workers 1` is accepted; other values fail clearly.

## Reports and interpretation

Artifacts are ignored by Git under `.fustify/reports/studies/`: `latest.json`, `history/<run-id>.json`, and `checkpoints/<run-id>.json`. Reports use dedicated schema version 1. Writes use same-directory temporary files and atomic rename. Completed history retains the newest 20 reports; active checkpoints are never removed by retention.

Hard failures include engine errors and invariant failures. At 30 or more
matches per configuration, cap rates of at least 5%, stalemate rates of at
least 5%, normal-victory rates below 80%, and p95 reaching the configured turn
cap warn. Seat differences of at least 8 percentage points also warn. Findings
are associations, not claims of causation.

Primary seat summaries are separated by player count and purpose, with equal
baselines of 25%, 20%, and 16.67% for 4, 5, and 6 seats. They report sample
count, baseline difference, and a two-sided 95% Wilson interval. The mixed
aggregate remains available but is explicitly labeled limited.

The earlier 6,000-match v1 broad study remains valid engine evidence (5,722
victories, 85 stalemates, 193 turn caps, and no command caps, engine errors, or
invariant failures). Because small/unusual worlds materially shaped it, it is
not the final product-balance study. The next manual run is:

```bash
pnpm study:balance --preset thorough --dry-run
pnpm study:balance --preset thorough
```

Successful full traces are not retained. Engine failures preserve reproduction descriptors, and verbose reproduction produces a focused single-match trace on demand.
