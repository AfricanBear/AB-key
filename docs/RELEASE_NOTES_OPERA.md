# Release Notes - Opera Adaptation

## Scope

This release adapts the MV3 Click Automation extension for Opera (Chromium-based) distribution and setup.

## Included Changes

- Added Opera compatibility checklist: `docs/OPERA_COMPATIBILITY.md`.
- Added Opera quick-start and troubleshooting to `README.md`.
- Updated packaging script to support Opera-labeled artifact:
  - `scripts/package.ps1 -Target opera`
  - output: `dist/AB-key-opera.zip`
- Added Opera smoke test checklist: `docs/OPERA_SMOKE_TEST.md`.

## Known Limitations

- Content scripts cannot run on restricted internal pages (`opera://*`, store pages, and other protected contexts).
- Iframe boundary behavior depends on page structure; cross-origin iframes remain constrained.
- Shortcut conflicts may require manual rebind in `opera://extensions/shortcuts`.

## Rollout Notes

- Use unpacked install first for verification.
- Promote packaged zip after smoke test completion on target workloads.
