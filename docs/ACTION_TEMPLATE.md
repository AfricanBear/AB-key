# Action Template

Use this snippet to add new automation tasks without touching core runtime code.

```json
{
  "actionId": "action.example",
  "label": "Click Approve",
  "enabled": true,
  "scope": {
    "hosts": ["example.com"]
  },
  "locatorProfile": {
    "selectorCandidates": [
      "button[data-testid='approve']",
      "button.approve"
    ],
    "textCriteria": {
      "mode": "contains",
      "value": "Approve",
      "caseSensitive": false
    },
    "ariaCriteria": {
      "label": "Approve",
      "role": "button",
      "caseSensitive": false
    },
    "indexHint": 0
  },
  "executionPolicy": {
    "timeoutMs": 3000,
    "retryPolicy": {
      "attempts": 8,
      "intervalMs": 200,
      "useMutationObserver": true
    },
    "postClickValidation": {
      "strategy": "none"
    }
  }
}
```

## Toolbar rail actions (Abacum Alt+1–5)

Rail actions use a positional locator instead of selectors/text/aria. Position is 1-based, top to bottom;
the AI agent button is not counted. There is no fallback to a page-wide search.

```json
"locatorProfile": { "toolbarRail": { "position": 3 } }
```
