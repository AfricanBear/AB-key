# Architecture

## Module Boundaries

- `src/background/service-worker.js`: command listener, action dispatch, global logging.
- `src/background/config-store.js`: read-through cache, schema migration, safe updates.
- `src/background/hotkey-orchestrator.js`: command to action resolution and host gating.
- `src/content/content-script.js`: selector engine, dynamic wait logic, click executor.
- `src/shared/config-schema.js`: versioned config schema and migration.
- `src/shared/errors.js`: unified error taxonomy.
- `src/shared/logger.js`: structured log persistence with correlation IDs.

## Message Contracts

- Worker -> Content:
  - `EXECUTE_ACTION` with payload:
    - `actionId`
    - `locatorProfile`
    - `executionPolicy`
- Content -> Worker response:
  - success: `{ ok: true, elapsedMs, matchedScore }`
  - failure: `{ ok: false, error: { code, message, details? }, elapsedMs }`

## Selector Strategy Pipeline

1. Explicit CSS selectors.
2. Aria matching (`aria-label`, `aria-labelledby`, `role`).
3. Text matching (contains/exact/regex).
4. Hybrid confidence scoring and deterministic selection.

## Dynamic Content Handling

- Bounded retry loop with timeout.
- Optional `MutationObserver`-backed wait between attempts.
- Re-query per attempt to survive DOM refreshes and hydration cycles.

## Extensibility Points

- Add new strategy by extending candidate collection and score model in `content-script.js`.
- Add new command bindings in config and `manifest.json`.
- Add post-click validation handlers in execution policy.
