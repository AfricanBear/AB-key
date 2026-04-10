# Opera Smoke Test Checklist

## Test Environment

- Browser: Opera (Chromium-based, MV3 compatible build).
- Extension mode: Developer mode, unpacked load.

## Functional Checks

- [ ] Extension loads without manifest errors.
- [ ] Background service worker is running.
- [ ] Options page opens and saves config (`chrome.storage.local` persistence).
- [ ] Command shortcut triggers worker dispatch.
- [ ] Content script receives action message and executes click.
- [ ] Dynamic retry flow works for delayed rendering targets.
- [ ] Error paths are visible (`ElementNotFound`, `OverlayBlocked`).

## Manual Steps

1. Open `opera://extensions` and load unpacked project root.
2. Confirm no install/runtime errors in the extension details page.
3. Visit supported host and trigger:
   - single-step action (for example `alt+1`),
   - multi-step action (for example `alt+a`),
   - delayed target action.
4. Restart Opera and verify settings persist.
5. Re-open extension and re-run one action.

## Result Log

- Validation scripts: pass (`scripts/validate.ps1`).
- Packaging scripts: pass with Opera target (`scripts/package.ps1 -Target opera`).
- Manual browser checks: pending user-run verification in local Opera profile.
