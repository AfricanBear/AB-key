# Test and Rollout Plan

## Unit Tests

- Config migration:
  - missing config -> defaults.
  - old config version -> migrated config.
  - malformed action entries -> rejected.
- Selector scoring:
  - visibility and clickability impacts rank.
  - text and aria criteria increase confidence.

## Integration Tests

- Command dispatch from service worker reaches active tab content script.
- Content script returns structured success and error payloads.
- Config updates in options page persist and are used by command execution.

## End-to-End Manual Scenarios

- Static page target by CSS selector.
- Dynamic page target rendered after keypress.
- Aria-only icon button.
- Multiple matching elements with index hint.
- Overlay-blocked element yields `OverlayBlocked`.

## Performance Gates

- P50 latency <= 150 ms when target exists immediately.
- P95 latency <= 1000 ms in dynamic mode.
- No observer leak after repeated 100 hotkey executions.

## Rollout

1. Internal alpha (single user profile).
2. Beta with expanded action packs.
3. Production package after two stable beta cycles.

## Operational Readiness

- Log review checklist for failed actions.
- Known limitations:
  - no iframe traversal.
  - Shadow DOM deep querying not yet specialized.
