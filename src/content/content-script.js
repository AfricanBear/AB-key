(function () {
  const ErrorCode = Object.freeze({
    ElementNotFound: "ElementNotFound",
    AmbiguousMatch: "AmbiguousMatch",
    ElementNotInteractable: "ElementNotInteractable",
    OverlayBlocked: "OverlayBlocked",
    TimeoutExceeded: "TimeoutExceeded",
    RuntimeFailure: "RuntimeFailure"
  });
  const CONFIG_KEY = "mv3ClickAutomation.config";
  const DEBUG_OUTLINE_ATTR = "data-ab-key-debug";

  function normalizeText(value, caseSensitive) {
    const normalized = (value || "").replace(/\s+/g, " ").trim();
    return caseSensitive ? normalized : normalized.toLocaleLowerCase();
  }

  function getAriaLabel(element) {
    return element.getAttribute("aria-label") || element.getAttribute("aria-labelledby") || "";
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
        const flags = caseSensitive ? "" : "i";
        return new RegExp(criteria.value, flags).test(haystack);
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

  function dedupe(elements) {
    return [...new Set(elements)];
  }

  function collectCandidates(locatorProfile) {
    const candidates = [];
    const selectorCandidates = locatorProfile.selectorCandidates || [];
    for (const selector of selectorCandidates) {
      try {
        const nodes = Array.from(document.querySelectorAll(selector));
        for (const node of nodes) candidates.push({ element: node, strategyTag: "css" });
      } catch {
        // Ignore malformed selectors and continue fallback chain.
      }
    }
    const broadPool = Array.from(document.querySelectorAll("button, a, [role='button'], [role='menuitem'], input, div, span"));
    for (const node of broadPool) {
      if (matchesText(node, locatorProfile.textCriteria)) candidates.push({ element: node, strategyTag: "text" });
      if (matchesAria(node, locatorProfile.ariaCriteria)) candidates.push({ element: node, strategyTag: "aria" });
    }
    return dedupe(candidates.map((c) => c.element)).map((element) => ({
      element,
      score: scoreCandidate(element, locatorProfile, "hybrid")
    }));
  }

  function selectBestCandidate(locatorProfile) {
    const scored = collectCandidates(locatorProfile).sort((a, b) => b.score - a.score);
    if (!scored.length) return null;
    if (typeof locatorProfile.indexHint === "number" && scored[locatorProfile.indexHint]) return scored[locatorProfile.indexHint];
    return scored[0];
  }

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
    element.scrollIntoView({ block: "center", inline: "center" });
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

  function normalizeHotkey(event) {
    const parts = [];
    if (event.ctrlKey) parts.push("ctrl");
    if (event.altKey) parts.push("alt");
    if (event.shiftKey) parts.push("shift");
    if (event.metaKey) parts.push("meta");
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase();
    if (!["control", "alt", "shift", "meta"].includes(key)) {
      parts.push(key);
    }
    return parts.join("+");
  }

  function runPreActions(preActions) {
    for (const action of preActions || []) {
      if (action?.type === "blurActiveElement" && document.activeElement && typeof document.activeElement.blur === "function") {
        document.activeElement.blur();
      }
    }
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitForMutationOrDelay(intervalMs, useMutationObserver) {
    if (!useMutationObserver) {
      await wait(intervalMs);
      return;
    }
    await new Promise((resolve) => {
      let resolved = false;
      const timer = setTimeout(() => {
        resolved = true;
        observer.disconnect();
        resolve();
      }, intervalMs);
      const observer = new MutationObserver(() => {
        if (resolved) return;
        clearTimeout(timer);
        observer.disconnect();
        resolve();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    });
  }

  async function executeAction(payload) {
    const started = performance.now();
    const config = await chrome.storage.local.get(CONFIG_KEY);
    const diagnosticsEnabled = Boolean(config?.[CONFIG_KEY]?.diagnosticsEnabled);
    const profile = payload.locatorProfile || {};
    const policy = payload.executionPolicy || {};
    runPreActions(policy.preActions);
    const steps = policy.steps?.length ? policy.steps : [{ locatorProfile: profile }];
    const retry = policy.retryPolicy || {};
    const attempts = Math.max(1, retry.attempts || 1);
    const intervalMs = Math.max(50, retry.intervalMs || 200);
    const timeoutMs = Math.max(intervalMs, policy.timeoutMs || 1500);
    const deadline = Date.now() + timeoutMs;
    let lastError = null;

    for (const step of steps) {
      let stepCompleted = false;
      for (let i = 0; i < attempts; i += 1) {
        const candidate = selectBestCandidate(step.locatorProfile || profile);
        if (candidate?.element) {
          if (diagnosticsEnabled) showDebugOutline(candidate.element);
          const clickResult = clickElement(candidate.element);
          if (clickResult.ok) {
            stepCompleted = true;
            break;
          }
          lastError = clickResult.error;
        } else {
          lastError = { code: ErrorCode.ElementNotFound, message: "No matching element found." };
        }
        if (Date.now() >= deadline) {
          break;
        }
        await waitForMutationOrDelay(intervalMs, Boolean(retry.useMutationObserver));
      }
      if (!stepCompleted) {
        return {
          ok: false,
          error: lastError || { code: ErrorCode.TimeoutExceeded, message: "Action timed out before a match was found." },
          elapsedMs: Math.round(performance.now() - started)
        };
      }
    }

    return {
      ok: true,
      elapsedMs: Math.round(performance.now() - started)
    };
  }

  async function executeActionById(actionId) {
    const configData = await chrome.storage.local.get(CONFIG_KEY);
    const config = configData?.[CONFIG_KEY];
    if (!config?.actions?.length) return;
    const action = config.actions.find((item) => item.actionId === actionId && item.enabled);
    if (!action) return;
    await executeAction({
      actionId: action.actionId,
      locatorProfile: action.locatorProfile,
      executionPolicy: action.executionPolicy
    });
  }

  async function handleCustomHotkeys(event) {
    const hotkey = normalizeHotkey(event);
    const host = window.location.hostname;
    const configData = await chrome.storage.local.get(CONFIG_KEY);
    const config = configData?.[CONFIG_KEY];
    if (!config?.hotkeys?.length) return;
    const binding = config.hotkeys.find((item) => {
      if (item.key !== hotkey) return false;
      const allowed = item.hosts || ["*"];
      if (allowed.includes("*")) return true;
      return allowed.some((entry) => host.endsWith(entry));
    });
    if (!binding) return;
    event.preventDefault();
    await executeActionById(binding.actionId);
  }

  window.addEventListener("keydown", (event) => {
    handleCustomHotkeys(event).catch(() => {
      // Errors are surfaced by runtime response for command path.
    });
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "EXECUTE_ACTION") return false;
    executeAction(message.payload)
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({
          ok: false,
          error: {
            code: ErrorCode.RuntimeFailure,
            message: error.message || "Unexpected execution failure."
          }
        });
      });
    return true;
  });
})();
