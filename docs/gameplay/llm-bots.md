# LLM bots and model benchmarking

Status: design proposal; not implemented.

This document records the agreed high-level direction for introducing
large-language-model controllers to Fustify. The feature has two goals:

1. Give humans stronger and more interesting opponents than the current
   heuristic bot.
2. Support model-versus-model tournaments for benchmarking, product research,
   exploit discovery, and entertainment.

## Summary

Introduce a shared `llm-bot` controller for two staged experiences:

1. Reproducible CLI tournaments with private `/admin` analysis.
2. Admin-only local games against the same controllers.

Keep `gameReducer` authoritative. Models receive public board information and
legal options, produce versioned phase strategies, and a deterministic executor
converts those strategies into individually validated commands.

Use configurable OpenAI-compatible endpoints. OpenRouter is the initial
gateway; locally or remotely hosted compatible endpoints can replace it without
changing game logic. Do not introduce Cloudflare Agents or multiplayer LLM
seats in v1.

## Core architecture

- Extend controller configuration with `llm-bot` and a non-secret
  `controllerProfileId`. Migrate local saves to the next schema version while
  preserving existing human and heuristic seats.
- Refactor interactive and headless runners to resolve controllers through a
  common registry instead of hard-coding `heuristicController`.
- Keep model profiles as versioned repository configuration containing model
  ID, endpoint reference, prompt version, sampling/output limits, timeout,
  benchmark track, and capability flags. Resolve base URLs and API keys only
  from server or CLI environment variables.
- Implement one OpenAI-compatible Chat Completions transport using `fetch`,
  Zod response validation, abortable timeouts, bounded retry for transient
  failures, and normalized usage, latency, and cost metadata.
  - OpenRouter profiles may use strict JSON Schema structured output and require
    providers that support the requested parameters. See the OpenRouter
    documentation for
    [structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs)
    and
    [provider routing](https://openrouter.ai/docs/guides/routing/provider-selection).
  - Normalize the token and cost fields documented by OpenRouter's
    [usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting).
  - Compatible endpoints without structured-output support use the same JSON
    contract through prompt instructions followed by strict local validation.
- Add `POST /api/llm/plan` to the droplet API:
  - Require a valid Supabase JWT and the existing `admin` role.
  - Accept only a validated observation, legal-action catalog, safe profile ID,
    and bounded structured memory. Never accept browser-supplied prompts,
    endpoints, models, or credentials.
  - Build prompts server-side, limit body size and concurrent requests, enforce
    profile timeouts, and return the validated plan plus safe usage metadata.
- Exclude player-supplied names and arbitrary prose from the strategic prompt.
  Use canonical IDs and structured board data so names cannot become prompt
  instructions.

## Planning and execution contract

- Add a versioned `LlmPhasePlan` containing:
  - A short plain-text spectator intent with strict length limits and no
    Markdown or URLs.
  - Bounded structured memory: posture and a small ranked objective list, not
    chain-of-thought or full conversation history.
  - Phase-specific directives using canonical territory or action IDs.
- Call the model when entering reinforcement, attack, or fortification. Replan
  during attack after a capture or elimination, or when no directive remains
  applicable.
- Let the deterministic executor:
  - Apply the selected legal reinforcement action.
  - Follow ranked attack edges while army-reserve, advantage, and attempt-limit
    conditions remain satisfied.
  - Select maximum legal attack dice unless the plan specifies a lower legal
    limit.
  - Convert the plan's minimum, balanced, or maximum capture posture into a
    legal capture move.
  - Apply the chosen legal fortification or skip.
- Revalidate every emitted command against `getLegalGameCommands` and then
  through `gameReducer`.
- On timeout, invalid schema, unavailable endpoint, or unusable plan, record the
  failure and use the existing deterministic safe fallback. Never loop
  indefinitely or accept model-authored state changes.
- Treat bot memory as noncanonical transient controller state. A resumed
  interactive save replans from the current board; benchmark artifacts retain
  the original transcript.
- Display concise strategic intent alongside factual action summaries. Never
  request, store, or present hidden chain-of-thought.

## Benchmarking and research

- Generalize headless matches to accept a controller profile per seat,
  including mixed heuristic and LLM tables.
- Add a capped tournament CLI with explicit match count, concurrency,
  request/token limits, and maximum dollar budget. Default concurrency is one;
  a run must fail closed when its explicit budget is exhausted.
- Maintain four separately labeled result tracks:
  - Standardized mirrored 1v1 duels.
  - Tuned-profile mirrored 1v1 duels.
  - Standardized 4–5 seat free-for-alls.
  - Tuned-profile 4–5 seat free-for-alls.
- Duel matrices use identical worlds, assignments, match seeds, and swapped
  seats. Free-for-alls rotate seats and controller streams across identical
  boards.
- Do not combine duel and free-for-all results into one rating. Report paired
  duel results separately from free-for-all win share, placement or elimination
  order, and seat-adjusted confidence intervals.
- Create a versioned private tournament artifact containing:
  - Fustify commit, generator, and rules versions.
  - Endpoint label, exact model/profile/prompt/executor versions, sampling
    settings, and routing policy.
  - Outcomes, matchup matrices, uncertainty, turns, captures, continent
    control, eliminations, stalemates, and caps.
  - Latency, token usage, reported or estimated cost, invalid plans, retries,
    replans, and fallbacks.
  - Canonical command traces and reproduction descriptors.
  - Full prompts and responses for benchmark runs only.
- Distinguish:
  - Deterministic engine replay from recorded commands.
  - Transcript reproduction from stored requests and responses.
  - Fresh reruns, which are new nondeterministic samples.
- Extend the private development `/admin` dashboard with tournament summaries,
  matchup views, operational metrics, and links to stored traces. Do not publish
  results or upload research artifacts to Supabase in v1.
- Retain only metrics, canonical actions, and concise intent for interactive
  games. Do not retain full interactive prompts or responses.

## Testing and rollout

- Unit-test profile validation, prompt construction, phase-plan schemas,
  structured-memory bounds, deterministic execution, illegal directives,
  fallbacks, timeouts, usage normalization, and save migration.
- Mock OpenRouter and generic compatible endpoints for structured-output
  success, unsupported features, malformed JSON, rate limits, transient
  failures, and missing usage or cost fields.
- Test the API for admin-only authorization, request limits, profile
  allowlisting, secret non-disclosure, arbitrary endpoint rejection, and
  cancellation.
- Run headless mixed-controller tests with scripted fake LLM responses so CI
  remains offline and deterministic. Verify reducer validation and invariants
  after every command.
- Verify recorded-command replay without contacting a model and confirm existing
  heuristic reproduction behavior remains unchanged.
- Add setup and admin visual scenarios plus Playwright coverage for selecting an
  LLM profile, thinking/error/fallback states, concise intent, responsive
  layout, focus, and unavailable access.
- Run the required gameplay, bot, persistence, simulation stress, Playwright,
  visual-review, and full verification-report workflows before handoff.
- Stage delivery as:
  1. Controller registry, plan/executor contract, fake transport, and report
     schemas.
  2. OpenRouter-backed CLI tournaments and private admin analysis.
  3. Admin-only interactive local play.
  4. Evaluate cost, latency, model quality, and abuse controls before
     considering allowlisted users, public leaderboards, live spectating,
     durable remote jobs, or authoritative multiplayer bots.

## Assumptions

- OpenRouter is the initial endpoint, but no OpenRouter-specific SDK enters core
  controller code.
- Repository profiles contain no secrets, and model identifiers are treated as
  opaque versioned configuration.
- Standardized tracks use identical prompts and inference budgets. Tuned tracks
  may vary prompt and sampling settings but must record them.
- Human-versus-LLM access is admin-only in v1.
- LLM tournaments run as explicit CLI research jobs, not inside normal web
  requests.
- Existing rules, combat determinism, multiplayer authority, and heuristic
  semantics remain unchanged.
