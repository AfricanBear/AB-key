# Opera Compatibility Checklist

## Audit Summary

The extension is built on Chromium Manifest V3 APIs, which Opera supports.

## API Compatibility

- `chrome.storage.local`: supported in Opera.
- `chrome.commands`: supported in Opera; shortcut conflicts can occur with built-in browser bindings.
- `chrome.tabs.sendMessage`: supported in Opera.
- MV3 background service worker: supported in current Opera Chromium builds.

## Manifest Review

- `manifest_version: 3`: compatible.
- `background.service_worker` with `type: module`: compatible.
- `content_scripts` and `options_page`: compatible.
- Permissions (`storage`, `activeTab`, `scripting`): compatible.

## Known Opera Considerations

- Some shortcuts may conflict with Opera defaults; users should rebind in `opera://extensions/shortcuts`.
- Content scripts cannot run on browser-internal pages (for example `opera://*`, extension store pages, and other restricted URLs).
- Host permission warning text in Opera may be broad because `<all_urls>` is enabled.

## No-Change Items

- Runtime message flow between service worker and content script.
- `chrome.storage` configuration model.
- Selector engine and dynamic retry/observer logic.
