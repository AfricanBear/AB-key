// AB-key content script: hotkey listener + click engine.
// Classic script (Chrome does not support ES-module content scripts in the manifest).
// Depends on src/content/toolbar-rail.js, loaded before this file.
(function () {
  "use strict";

  if (globalThis.__abKeyContentScriptReady) return;
  globalThis.__abKeyContentScriptReady = true;

  // Keep in sync with CONFIG_KEY in src/shared/config-schema.js.
  const CONFIG_KEY = "mv3ClickAutomation.config";

  const ErrorCode = Object.freeze({
    ElementNotFound: "ElementNotFound",
    AmbiguousMatch: "AmbiguousMatch",
    ElementNotInteractable: "ElementNotInteractable",
    OverlayBlocked: "OverlayBlocked",
    TimeoutExceeded: "TimeoutExceeded",
    RuntimeFailure: "RuntimeFailure"
  });

  const DEBUG_OUTLINE_ATTR = "data-ab-key-debug";
  const DEBUG_PREFIX = "[AB-key]";
  const MIN_RETRY_WAIT_MS = 50;

  // ---------------------------------------------------------------------------
  // Config cache (read once, refreshed on storage change — no storage read per keypress)
  // ---------------------------------------------------------------------------

  let config = null;

  function loadConfig() {
    return chrome.storage.local
      .get(CONFIG_KEY)
      .then((data) => {
        config = data?.[CONFIG_KEY] || null;
      })
      .catch(() => {
        config = null;
      });
  }

  const configReady = loadConfig();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[CONFIG_KEY]) return;
    config = changes[CONFIG_KEY].newValue || null;
  });

  // ---------------------------------------------------------------------------
  // Logging
  // ---------------------------------------------------------------------------

  function debugLog(enabled, message, details) {
    if (!enabled) return;
    if (details !== undefined) console.debug(DEBUG_PREFIX, message, details);
    else console.debug(DEBUG_PREFIX, message);
  }

  function warnLog(message, details) {
    if (details !== undefined) console.warn(DEBUG_PREFIX, message, details);
    else console.warn(DEBUG_PREFIX, message);
  }

  // ---------------------------------------------------------------------------
  // Generic matching engine (selectors / text / aria)
  // ---------------------------------------------------------------------------

  function normalizeText(value, caseSensitive) {
    const normalized = (value || "").replace(/\s+/g, " ").trim();
    return caseSensitive ? normalized : normalized.toLocaleLowerCase();
  }

  function getAriaLabel(element) {
    return element.getAttribute("aria-label") || element.getAttribute("aria-labelledby") || "";
  }

  function describeElement(element) {
    if (!element) return null;
    const tag = element.tagName?.toLowerCase() || "unknown";
    const aria = getAriaLabel(element);
    const text = normalizeText(element.innerText || element.textContent || "", false).slice(0, 80);
    return {
      tag,
      aria,
      text,
      testId: element.getAttribute("data-testid") || "",
      className: typeof element.className === "string" ? element.className : ""
    };
  }

  function matchesText(element, criteria) {
    if (!criteria || !criteria.value) return false;
    const caseSensitive = Boolean(criteria.caseSensitive);
    const haystack = normalizeText(element.innerText || element.textContent || "", caseSensitive);
    const needle = normalizeText(criteria.value, caseSensitive);
    if (!needle) return false;
    if (criteria.mode === "exact") return haystack === needle;
    if (criteria.mode === "regex") {
      try {
        return new RegExp(criteria.value, caseSensitive ? "" : "i").test(haystack);
      } catch {
        return false;
      }
    }
    return haystack.includes(needle);
  }

  function matchesAria(element, criteria) {
    if (!criteria) return false;
    const caseSensitive = Boolean(criteria.caseSensitive);
    const ariaLabel = normalizeText(getAriaLabel(element), caseSensitive);
    const role = normalizeText(element.getAttribute("role") || "", caseSensitive);
    const targetLabel = normalizeText(criteria.label || "", caseSensitive);
    const targetRole = normalizeText(criteria.role || "", caseSensitive);
    if (targetRole && role !== targetRole) return false;
    if (!targetLabel) return Boolean(targetRole);
    return ariaLabel.includes(targetLabel);
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      style.pointerEvents !== "none"
    );
  }

  function isDisabled(element) {
    return Boolean(element.disabled || element.getAttribute("aria-disabled") === "true");
  }

  function isClickableTag(element) {
    const tag = element.tagName.toLowerCase();
    if (["button", "a", "input", "summary", "label"].includes(tag)) return true;
    const role = element.getAttribute("role");
    return role === "button" || role === "menuitem" || role === "link";
  }

  function isInViewport(rect) {
    return rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth;
  }

  function hitTest(element) {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
    const topEl = document.elementFromPoint(x, y);
    return topEl === element || element.contains(topEl);
  }

  function scoreCandidate(element, profile, strategyTag) {
    let score = 0;
    if (isVisible(element)) score += 25;
    if (!isDisabled(element)) score += 15;
    if (isClickableTag(element)) score += 20;
    if (matchesText(element, profile.textCriteria)) score += 25;
    if (matchesAria(element, profile.ariaCriteria)) score += 25;
    if (strategyTag === "css") score += 10;
    return score;
  }

  function collectCandidates(locatorProfile) {
    const raw = [];
    for (const selector of locatorProfile.selectorCandidates || []) {
      try {
        for (const node of document.querySelectorAll(selector)) raw.push({ element: node, strategyTag: "css" });
      } catch {
        // Ignore malformed selectors and continue the fallback chain.
      }
    }
    const broadPool = document.querySelectorAll("button, a, [role='button'], [role='menuitem'], input, div, span");
    for (const node of broadPool) {
      if (matchesText(node, locatorProfile.textCriteria)) raw.push({ element: node, strategyTag: "text" });
      else if (matchesAria(node, locatorProfile.ariaCriteria)) raw.push({ element: node, strategyTag: "aria" });
    }
    const firstTag = new Map();
    for (const c of raw) if (!firstTag.has(c.element)) firstTag.set(c.element, c.strategyTag);
    return Array.from(firstTag, ([element, strategyTag]) => ({
      element,
      strategyTag,
      score: scoreCandidate(element, locatorProfile, strategyTag)
    }));
  }

  // ---------------------------------------------------------------------------
  // Candidate selection
  // ---------------------------------------------------------------------------

  function selectRailCandidate(locatorProfile) {
    const rail = globalThis.AbKeyToolbarRail;
    const position = Number(locatorProfile.toolbarRail.position);
    if (!rail || !Number.isInteger(position) || position < 1) {
      return { candidate: null, railInfo: { position, source: rail ? "invalid-position" : "rail-script-missing" } };
    }
    const found = rail.getButton(position);
    const railInfo = { position, source: found.source, total: found.total };
    if (!found.element) return { candidate: null, railInfo };
    return {
      candidate: { element: found.element, score: 1000, strategyTag: `rail-${found.source}` },
      railInfo
    };
  }

  function selectBestCandidate(locatorProfile) {
    // Toolbar rail is positional only: never fall back to a page-wide search,
    // otherwise Alt+N could click an unrelated button with a similar label.
    if (locatorProfile?.toolbarRail) return selectRailCandidate(locatorProfile);

    const scored = collectCandidates(locatorProfile).sort((a, b) => b.score - a.score);
    if (!scored.length) return { candidate: null };
    if (typeof locatorProfile.indexHint === "number" && scored[locatorProfile.indexHint]) {
      return { candidate: scored[locatorProfile.indexHint] };
    }
    return { candidate: scored[0] };
  }

  // ---------------------------------------------------------------------------
  // Clicking
  // ---------------------------------------------------------------------------

  function clearDebugOutline() {
    const highlighted = document.querySelector(`[${DEBUG_OUTLINE_ATTR}]`);
    if (!highlighted) return;
    highlighted.style.outline = "";
    highlighted.style.outlineOffset = "";
    highlighted.removeAttribute(DEBUG_OUTLINE_ATTR);
  }

  function showDebugOutline(element) {
    clearDebugOutline();
    element.setAttribute(DEBUG_OUTLINE_ATTR, "true");
    element.style.outline = "2px solid #e91e63";
    element.style.outlineOffset = "2px";
  }

  function ensureInteractable(element) {
    // Scroll only when needed: fixed rails and toolbars must not move the page.
    if (!isInViewport(element.getBoundingClientRect())) {
      element.scrollIntoView({ block: "center", inline: "center" });
    }
    if (!isVisible(element) || isDisabled(element)) {
      return { ok: false, error: { code: ErrorCode.ElementNotInteractable, message: "Element is not visible or is disabled." } };
    }
    if (!hitTest(element)) {
      return { ok: false, error: { code: ErrorCode.OverlayBlocked, message: "Element appears to be overlaid by another node." } };
    }
    return { ok: true };
  }

  function clickElement(element) {
    const guard = ensureInteractable(element);
    if (!guard.ok) return guard;
    element.click();
    return { ok: true };
  }

  function runPreActions(preActions) {
    for (const action of preActions || []) {
      if (action?.type === "blurActiveElement" && typeof document.activeElement?.blur === "function") {
        document.activeElement.blur();
      }
    }
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Wait for a DOM change or the interval, whichever comes first — but never less than
  // MIN_RETRY_WAIT_MS. Abacum mutates the DOM constantly, so without the floor all retries
  // were burnt within a few milliseconds and timeoutMs was never honoured.
  async function waitForMutationOrDelay(intervalMs, useMutationObserver) {
    if (!useMutationObserver) {
      await wait(intervalMs);
      return;
    }
    await wait(MIN_RETRY_WAIT_MS);
    await new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        observer.disconnect();
        resolve();
      };
      const timer = setTimeout(finish, Math.max(0, intervalMs - MIN_RETRY_WAIT_MS));
      const observer = new MutationObserver(finish);
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    });
  }

  // ---------------------------------------------------------------------------
  // Action execution
  // ---------------------------------------------------------------------------

  async function executeAction(payload) {
    const started = performance.now();
    const elapsed = () => Math.round(performance.now() - started);
    await configReady;
    const diagnosticsEnabled = Boolean(config?.diagnosticsEnabled);
    const actionId = payload.actionId || "unknown";
    const profile = payload.locatorProfile || {};
    const policy = payload.executionPolicy || {};
    debugLog(diagnosticsEnabled, "Executing action", { actionId });
    runPreActions(policy.preActions);

    const steps = policy.steps?.length ? policy.steps : [{ locatorProfile: profile }];
    const retry = policy.retryPolicy || {};
    const maxAttempts = Math.max(1, retry.attempts || 1);
    const intervalMs = Math.max(MIN_RETRY_WAIT_MS, retry.intervalMs || 200);
    const timeoutMs = Math.max(intervalMs, policy.timeoutMs || 1500);
    const deadline = Date.now() + timeoutMs;
    let lastError = null;

    for (const step of steps) {
      const stepProfile = step.locatorProfile || profile;
      let stepCompleted = false;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        let selection;
        try {
          selection = selectBestCandidate(stepProfile);
        } catch (error) {
          lastError = { code: ErrorCode.RuntimeFailure, message: error.message || "Unexpected error during element lookup." };
          warnLog("Lookup threw an error", { actionId, attempt, error: lastError });
          break;
        }
        const candidate = selection.candidate;
        debugLog(diagnosticsEnabled, "Attempting match", {
          actionId,
          attempt,
          maxAttempts,
          strategy: candidate?.strategyTag || "none",
          rail: selection.railInfo || null
        });

        if (candidate?.element) {
          if (diagnosticsEnabled) showDebugOutline(candidate.element);
          const clickResult = clickElement(candidate.element);
          if (clickResult.ok) {
            debugLog(diagnosticsEnabled, "Click succeeded", {
              actionId,
              strategy: candidate.strategyTag,
              element: describeElement(candidate.element)
            });
            stepCompleted = true;
            break;
          }
          lastError = clickResult.error;
          debugLog(diagnosticsEnabled, "Click failed", {
            actionId,
            strategy: candidate.strategyTag,
            error: clickResult.error,
            element: describeElement(candidate.element)
          });
        } else {
          lastError = {
            code: ErrorCode.ElementNotFound,
            message: stepProfile.toolbarRail
              ? `No toolbar rail button at position ${stepProfile.toolbarRail.position} on this page.`
              : "No matching element found.",
            details: selection.railInfo || undefined
          };
          debugLog(diagnosticsEnabled, "No matching element found", { actionId, attempt, rail: selection.railInfo || null });
        }

        if (Date.now() >= deadline) break;
        await waitForMutationOrDelay(intervalMs, Boolean(retry.useMutationObserver));
      }

      if (!stepCompleted) {
        const error = lastError || { code: ErrorCode.TimeoutExceeded, message: "Action timed out before a match was found." };
        debugLog(diagnosticsEnabled, "Action failed", { actionId, error, elapsedMs: elapsed() });
        return { ok: false, error, elapsedMs: elapsed() };
      }
    }

    debugLog(diagnosticsEnabled, "Action completed", { actionId, elapsedMs: elapsed() });
    return { ok: true, elapsedMs: elapsed() };
  }

  // ---------------------------------------------------------------------------
  // Hotkeys
  // ---------------------------------------------------------------------------

  // Use the physical key (event.code) so hotkeys work with any keyboard layout:
  // with a Russian layout Alt+E reports event.key "у", but event.code is still "KeyE".
  function keyFromEvent(event) {
    const code = event.code || "";
    if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
    if (/^Digit[0-9]$/.test(code)) return code.slice(5);
    if (/^Numpad[0-9]$/.test(code)) return code.slice(6);
    return (event.key || "").toLowerCase();
  }

  function normalizeHotkey(event) {
    const parts = [];
    if (event.ctrlKey) parts.push("ctrl");
    if (event.altKey) parts.push("alt");
    if (event.shiftKey) parts.push("shift");
    if (event.metaKey) parts.push("meta");
    const key = keyFromEvent(event);
    if (key && !["control", "alt", "shift", "meta", "altgraph"].includes(key)) parts.push(key);
    return parts.join("+");
  }

  function hostAllowed(hosts, host) {
    const allowed = hosts || ["*"];
    if (allowed.includes("*")) return true;
    return allowed.some((entry) => host === entry || host.endsWith(`.${entry}`));
  }

  function findBinding(hotkey) {
    if (!config?.hotkeys?.length) return null;
    const host = window.location.hostname;
    return config.hotkeys.find((item) => item.key === hotkey && hostAllowed(item.hosts, host)) || null;
  }

  function findAction(actionId) {
    return config?.actions?.find((item) => item.actionId === actionId && item.enabled) || null;
  }

  function onKeyDown(event) {
    if (event.isComposing || (!event.altKey && !event.ctrlKey && !event.metaKey)) return;
    const hotkey = normalizeHotkey(event);
    const binding = findBinding(hotkey);
    if (!binding) return;
    const action = findAction(binding.actionId);
    if (!action) return;

    // Must be synchronous: calling preventDefault after an await has no effect.
    event.preventDefault();
    if (event.repeat) return;

    const diagnosticsEnabled = Boolean(config.diagnosticsEnabled);
    debugLog(diagnosticsEnabled, "Hotkey pressed", { hotkey, actionId: action.actionId });
    executeAction({
      actionId: action.actionId,
      locatorProfile: action.locatorProfile,
      executionPolicy: action.executionPolicy
    })
      .then((result) => {
        if (!result.ok) warnLog("Hotkey action failed", { hotkey, actionId: action.actionId, error: result.error });
      })
      .catch((error) => warnLog("Hotkey action crashed", { hotkey, actionId: action.actionId, message: error?.message }));
  }

  window.addEventListener("keydown", onKeyDown, true);

  // ---------------------------------------------------------------------------
  // Messages from the service worker (chrome.commands path)
  // ---------------------------------------------------------------------------

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "EXECUTE_ACTION") return false;
    executeAction(message.payload)
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({
          ok: false,
          error: { code: ErrorCode.RuntimeFailure, message: error.message || "Unexpected execution failure." }
        });
      });
    return true;
  });
})();
