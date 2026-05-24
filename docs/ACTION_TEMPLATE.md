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
    "toolbarIndex": {
      "containerSelectors": [
        ".MuiDrawer-root .MuiGrid-container",
        ".MuiGrid-root.MuiGrid-container.css-1c87emg"
      ],
      "childIndex": 1
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
