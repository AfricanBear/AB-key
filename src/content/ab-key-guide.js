// AB-key guide: short tips next to the Abacum buttons that AB-key adds hotkeys or features to.
//
// - Steps live in ab-key-guide-steps.js (globalThis.AbKeyGuideSteps).
// - On every Abacum page the guide looks for steps that were not shown yet and whose button is
//   on screen, and shows them as one short tour (Back / Next, × skips the rest). A step whose
//   button is not there yet (another page, a closed panel) waits for a later visit.
// - Config flags (Options → Guide): guideEnabled (default on) and guideOnlyNew (default off:
//   only steps shipped after the version the user started with, see src/shared/guide-state.js).
// - "Seen" state: chrome.storage.local["abKey.guide"], not the config.
// - Replay: the ? button of the A+B key panel (AB_KEY_GUIDE_REPLAY) shows every step of the
//   current page again, whatever the flags and the seen state.
// - The tip is drawn in a closed shadow root so Abacum's CSS cannot reach it; it never takes
//   focus and handles no keys.
//
// Classic content script: no imports.
(function () {
  "use strict";

  if (globalThis.AbKeyGuide) return;

  const CONFIG_KEY = "mv3ClickAutomation.config"; // keep in sync with src/shared/config-schema.js
  const GUIDE_KEY = "abKey.guide"; // keep in sync with src/shared/guide-state.js
  const REPLAY_MESSAGE = "AB_KEY_GUIDE_REPLAY";
  const HOST_ID = "ab-key-guide";
  const FIRST_CHECK_MS = 1500;
  const CHECK_MS = 2000;
  const FOLLOW_MS = 400;
  const GAP_PX = 10;
  const MARGIN_PX = 8;
  // Abacum dialogs and menus: a tip is not opened over them.
  const BUSY_SELECTOR = ".MuiDialog-root, .MuiPopover-root, .MuiMenu-root, #ab-key-panel-root";

  // ---------------------------------------------------------------------------
  // Pure helpers (exported for tests)
  // ---------------------------------------------------------------------------

  function compareVersions(a, b) {
    const left = String(a || "0").split(".").map((part) => Number.parseInt(part, 10) || 0);
    const right = String(b || "0").split(".").map((part) => Number.parseInt(part, 10) || 0);
    for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
      const diff = (left[index] || 0) - (right[index] || 0);
      if (diff) return diff < 0 ? -1 : 1;
    }
    return 0;
  }

  function pageOf(pathname) {
    if (/^\/app\/modules\/[^/]+/.test(pathname || "")) return "model";
    if (/^\/app\/datasets\/[^/]+/.test(pathname || "")) return "dataset";
    return "other";
  }

  function formatKey(key) {
    return String(key)
      .split("+")
      .map((part) => (part.length === 1 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)))
      .join("+");
  }

  function hostMatches(hosts, hostname) {
    const allowed = hosts || ["*"];
    if (allowed.includes("*")) return true;
    return allowed.some((entry) => hostname === entry || hostname.endsWith(`.${entry}`));
  }

  /** Formatted hotkey of an action in the config, or null when unbound or disabled. */
  function hotkeyOf(config, actionId, hostname) {
    const action = (config?.actions || []).find((item) => item.actionId === actionId);
    if (!action || action.enabled === false) return null;
    const binding = (config?.hotkeys || []).find((item) => item.actionId === actionId && hostMatches(item.hosts, hostname));
    return binding ? formatKey(binding.key) : null;
  }

  /** ["Alt+1", "Alt+2", "Alt+3"] → "Alt+1–3"; anything else is joined with commas. */
  function joinKeys(keys) {
    if (keys.length > 2) {
      const split = keys.map((key) => {
        const at = key.lastIndexOf("+");
        return { prefix: key.slice(0, at + 1), last: key.slice(at + 1) };
      });
      const numbers = split.map((item) => Number(item.last));
      const consecutive = numbers.every((n, index) => /^\d$/.test(split[index].last) && (index === 0 || n === numbers[index - 1] + 1));
      if (consecutive && split.every((item) => item.prefix === split[0].prefix)) {
        return `${split[0].prefix}${split[0].last}–${split[split.length - 1].last}`;
      }
    }
    return keys.join(", ");
  }

  /**
   * What a step shows with this config: { keys, lines }, or null when it has hotkeys and none of
   * them is bound.
   */
  function resolveStep(step, config, hostname) {
    const keys = (step.keys || []).map((actionId) => hotkeyOf(config, actionId, hostname)).filter(Boolean);
    if (step.keys?.length && !keys.length) return null;
    const lines = (step.lines || [])
      .map((line) => ({ ...line, key: hotkeyOf(config, line.actionId, hostname) }))
      .filter((line) => line.key);
    if (step.lines?.length && !lines.length) return null;
    return { keys: keys.length ? joinKeys(keys) : "", lines };
  }

  /** Newest `since` of a step and its lines. */
  function newestSince(step) {
    return (step.lines || []).reduce((max, line) => (line.since && compareVersions(line.since, max) > 0 ? line.since : max), step.since);
  }

  /**
   * Steps to show now, in order. Pure.
   * mode "auto": guide on, steps not seen yet (and newer than the baseline with "only new");
   * mode "replay": every step of the page, flags and seen state ignored.
   * anchorOf(step) returns the step's element on screen or null; steps without an anchor
   * function (the welcome card) never start a tour on their own.
   */
  function pickSteps({ steps, config, state, hostname, pathname, mode = "auto", anchorOf }) {
    const page = pageOf(pathname);
    const auto = mode === "auto";
    if (auto && config?.guideEnabled === false) return [];
    const seen = new Set(state?.seen || []);
    const onlyNew = auto && config?.guideOnlyNew === true;
    const baseline = state?.baseline || "0.0.0";
    const picked = [];
    for (const step of steps) {
      if (step.page !== "any" && step.page !== page) continue;
      if (step.flag && config?.[step.flag] === false) continue;
      if (auto && seen.has(step.id)) continue;
      if (onlyNew && compareVersions(newestSince(step), baseline) <= 0) continue;
      const resolved = resolveStep(step, config, hostname);
      if (!resolved) continue;
      const element = step.anchor ? anchorOf(step) : null;
      if (step.anchor && !element) continue;
      picked.push({ step, element, ...resolved, isNew: compareVersions(newestSince(step), baseline) > 0 });
    }
    if (!picked.some((item) => item.step.anchor)) return mode === "replay" ? picked : [];
    return picked;
  }

  /** Whether auto mode may still have something to show (keeps the periodic check alive). */
  function hasPending({ steps, config, state, hostname }) {
    if (config?.guideEnabled === false) return false;
    const seen = new Set(state?.seen || []);
    const onlyNew = config?.guideOnlyNew === true;
    const baseline = state?.baseline || "0.0.0";
    return steps.some(
      (step) =>
        step.anchor &&
        !seen.has(step.id) &&
        !(step.flag && config?.[step.flag] === false) &&
        !(onlyNew && compareVersions(newestSince(step), baseline) <= 0) &&
        resolveStep(step, config, hostname)
    );
  }

  /**
   * Where to put a tip of `size` next to `anchor` (DOMRect-like) in a viewport. Pure.
   * Tries below, above, right, left; the first side where the tip fits wins; it is centred on
   * the anchor and clamped to the viewport. No anchor: the centre of the viewport.
   */
  function placeTip(anchor, size, viewport, gap = GAP_PX, margin = MARGIN_PX) {
    const clamp = (value, min, max) => Math.max(min, Math.min(value, Math.max(min, max)));
    if (!anchor) {
      return {
        side: "center",
        left: Math.round(clamp((viewport.width - size.width) / 2, margin, viewport.width - size.width - margin)),
        top: Math.round(clamp((viewport.height - size.height) / 3, margin, viewport.height - size.height - margin))
      };
    }
    const centerX = anchor.left + anchor.width / 2 - size.width / 2;
    const centerY = anchor.top + anchor.height / 2 - size.height / 2;
    const options = [
      { side: "bottom", left: centerX, top: anchor.bottom + gap, fits: anchor.bottom + gap + size.height <= viewport.height - margin },
      { side: "top", left: centerX, top: anchor.top - gap - size.height, fits: anchor.top - gap - size.height >= margin },
      { side: "right", left: anchor.right + gap, top: centerY, fits: anchor.right + gap + size.width <= viewport.width - margin },
      { side: "left", left: anchor.left - gap - size.width, top: centerY, fits: anchor.left - gap - size.width >= margin }
    ];
    const chosen = options.find((option) => option.fits) || options[0];
    return {
      side: chosen.side,
      left: Math.round(clamp(chosen.left, margin, viewport.width - size.width - margin)),
      top: Math.round(clamp(chosen.top, margin, viewport.height - size.height - margin))
    };
  }

  const api = { compareVersions, pageOf, formatKey, hotkeyOf, joinKeys, resolveStep, pickSteps, hasPending, placeTip };
  globalThis.AbKeyGuide = api;

  if (typeof document === "undefined" || !globalThis.chrome?.storage?.local) return;

  // ---------------------------------------------------------------------------
  // Page side
  // ---------------------------------------------------------------------------

  const CSS = `
:host { all: initial; }
.ring {
  position: fixed; z-index: 2147483000; pointer-events: none; border-radius: 6px;
  box-shadow: 0 0 0 2px #7c4dff, 0 0 0 6px rgba(124, 77, 255, 0.25);
  transition: left .12s, top .12s, width .12s, height .12s;
}
.tip {
  position: fixed; z-index: 2147483001; box-sizing: border-box; width: 300px;
  background: #fff; color: #1f1f29; border-radius: 10px; padding: 14px 16px 12px;
  box-shadow: 0 8px 28px rgba(20, 16, 48, 0.22), 0 0 0 1px rgba(20, 16, 48, 0.08);
  font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
}
.head { display: flex; align-items: flex-start; gap: 8px; }
.title { flex: 1; margin: 0; font-size: 14px; font-weight: 600; }
.badge {
  display: inline-block; margin-left: 6px; padding: 1px 6px; border-radius: 8px;
  background: #ede7ff; color: #5b2fd6; font-size: 11px; font-weight: 600; vertical-align: 1px;
}
.close {
  border: 0; background: none; color: #77778a; font-size: 18px; line-height: 1;
  padding: 0 2px; cursor: pointer;
}
.close:hover { color: #1f1f29; }
kbd {
  display: inline-block; padding: 1px 6px; border-radius: 4px; background: #f1f0f7;
  border: 1px solid #dcdae8; font: 600 12px/1.5 ui-monospace, Consolas, monospace; color: #3b3355;
}
.keys { margin: 6px 0 0; }
.text { margin: 6px 0 0; color: #3c3c4a; }
.lines { margin: 8px 0 0; padding: 0; list-style: none; display: grid; gap: 4px; }
.lines li { display: flex; align-items: center; gap: 8px; }
.lines kbd { min-width: 46px; text-align: center; }
.foot { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
.off {
  border: 0; background: none; padding: 0; color: #77778a; font: inherit; font-size: 12px;
  text-decoration: underline; cursor: pointer;
}
.off:hover { color: #1f1f29; }
.count { flex: 1; text-align: right; color: #77778a; font-size: 12px; }
.btn {
  border: 1px solid #d6d3e4; background: #fff; color: #1f1f29; border-radius: 6px;
  padding: 4px 12px; font: inherit; font-weight: 600; cursor: pointer;
}
.btn:hover { background: #f6f5fb; }
.btn.primary { background: #5b2fd6; border-color: #5b2fd6; color: #fff; }
.btn.primary:hover { background: #4a22bd; }
`;

  let config = null;
  let state = { seen: [], baseline: null };
  let tour = null; // { items, index, mode }
  let host = null;
  let shadow = null;
  let checkTimer = null;
  let firstTimer = null;
  let followTimer = null;

  const steps = () => globalThis.AbKeyGuideSteps || [];
  const version = () => chrome.runtime?.getManifest?.().version || "0.0.0";

  function anchorOf(step) {
    try {
      return step.anchor?.() || null;
    } catch {
      return null;
    }
  }

  function inViewport(element) {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
  }

  async function loadAll() {
    const stored = await chrome.storage.local.get([CONFIG_KEY, GUIDE_KEY]);
    config = stored[CONFIG_KEY] || {};
    const saved = stored[GUIDE_KEY] || {};
    state = { seen: Array.isArray(saved.seen) ? saved.seen : [], baseline: saved.baseline || version() };
  }

  async function markSeen(ids) {
    const fresh = ids.filter((id) => !state.seen.includes(id));
    if (!fresh.length) return;
    state = { ...state, seen: [...state.seen, ...fresh] };
    try {
      const stored = await chrome.storage.local.get(GUIDE_KEY);
      const saved = stored[GUIDE_KEY] || {};
      const seen = Array.from(new Set([...(Array.isArray(saved.seen) ? saved.seen : []), ...state.seen]));
      await chrome.storage.local.set({ [GUIDE_KEY]: { ...saved, baseline: saved.baseline || state.baseline, seen } });
    } catch {
      // extension reloaded: the page keeps working, the step may show again
    }
  }

  async function turnOff() {
    close();
    config = { ...config, guideEnabled: false };
    try {
      const stored = await chrome.storage.local.get(CONFIG_KEY);
      if (stored[CONFIG_KEY]) await chrome.storage.local.set({ [CONFIG_KEY]: { ...stored[CONFIG_KEY], guideEnabled: false } });
    } catch {
      // not saved; tips stay off on this page
    }
    schedule();
  }

  // --- Drawing ---------------------------------------------------------------

  function ensureHost() {
    if (host?.isConnected) return;
    host = document.createElement("div");
    host.id = HOST_ID;
    shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = CSS;
    shadow.appendChild(style);
    document.documentElement.appendChild(host);
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function render() {
    if (!tour) return;
    const item = tour.items[tour.index];
    ensureHost();
    for (const node of Array.from(shadow.childNodes)) if (node.tagName !== "STYLE") node.remove();

    const tip = el("div", "tip");
    tip.setAttribute("role", "dialog");
    tip.setAttribute("aria-label", "AB-key tip");
    const head = el("div", "head");
    const title = el("p", "title", item.step.title);
    if (item.isNew && tour.mode === "auto") title.appendChild(el("span", "badge", "New"));
    const closeButton = el("button", "close", "×");
    closeButton.type = "button";
    closeButton.title = tour.mode === "auto" ? "Skip the tips of this page" : "Close";
    closeButton.addEventListener("click", skipAll);
    head.append(title, closeButton);
    tip.appendChild(head);

    if (item.keys) {
      const keys = el("p", "keys");
      keys.appendChild(el("kbd", "", item.keys));
      tip.appendChild(keys);
    }
    if (item.step.text) tip.appendChild(el("p", "text", item.step.text));
    if (item.lines.length) {
      const list = el("ul", "lines");
      for (const line of item.lines) {
        const row = el("li");
        row.append(el("kbd", "", line.key), el("span", "", line.text));
        list.appendChild(row);
      }
      tip.appendChild(list);
    }

    const foot = el("div", "foot");
    if (tour.mode === "auto") {
      const off = el("button", "off", "Turn off tips");
      off.type = "button";
      off.title = "Options → Guide turns them on again";
      off.addEventListener("click", turnOff);
      foot.appendChild(off);
    }
    foot.appendChild(el("span", "count", `${tour.index + 1} / ${tour.items.length}`));
    if (tour.index > 0) {
      const back = el("button", "btn", "Back");
      back.type = "button";
      back.addEventListener("click", () => go(-1));
      foot.appendChild(back);
    }
    const last = tour.index === tour.items.length - 1;
    const next = el("button", "btn primary", last ? "Done" : "Next");
    next.type = "button";
    next.addEventListener("click", () => (last ? close() : go(1)));
    foot.appendChild(next);
    tip.appendChild(foot);

    const ring = el("div", "ring");
    ring.hidden = !item.element;
    shadow.append(ring, tip);
    position();
    if (tour.mode === "auto") markSeen([item.step.id]);
  }

  function position() {
    if (!tour || !shadow) return;
    const item = tour.items[tour.index];
    const tip = shadow.querySelector(".tip");
    const ring = shadow.querySelector(".ring");
    if (!tip) return;
    let rect = null;
    if (item.element) {
      if (!item.element.isConnected || !inViewport(item.element)) {
        // The button is gone (page changed, panel closed): look for it again, else move on.
        const again = anchorOf(item.step);
        if (!again || !inViewport(again)) {
          dropCurrent();
          return;
        }
        item.element = again;
      }
      rect = item.element.getBoundingClientRect();
      Object.assign(ring.style, {
        left: `${rect.left - 3}px`,
        top: `${rect.top - 3}px`,
        width: `${rect.width + 6}px`,
        height: `${rect.height + 6}px`
      });
    }
    const size = tip.getBoundingClientRect();
    const place = placeTip(rect, { width: size.width, height: size.height }, { width: innerWidth, height: innerHeight });
    tip.style.left = `${place.left}px`;
    tip.style.top = `${place.top}px`;
  }

  function dropCurrent() {
    tour.items.splice(tour.index, 1);
    if (!tour.items.some((item) => item.element)) {
      close();
      return;
    }
    tour.index = Math.min(tour.index, tour.items.length - 1);
    render();
  }

  function go(delta) {
    if (!tour) return;
    tour.index = Math.max(0, Math.min(tour.items.length - 1, tour.index + delta));
    render();
  }

  function skipAll() {
    if (tour?.mode === "auto") markSeen(tour.items.map((item) => item.step.id));
    close();
  }

  function close() {
    tour = null;
    clearInterval(followTimer);
    followTimer = null;
    removeEventListener("scroll", position, true);
    removeEventListener("resize", position);
    host?.remove();
    host = null;
    shadow = null;
    schedule();
  }

  function open(items, mode) {
    if (!items.length) return;
    tour = { items, index: 0, mode };
    stopChecks();
    addEventListener("scroll", position, true);
    addEventListener("resize", position);
    // Anchors move without scroll events (grid re-renders, panels sliding in).
    followTimer = setInterval(position, FOLLOW_MS);
    render();
  }

  // --- When to show ----------------------------------------------------------

  function pick(mode) {
    return pickSteps({
      steps: steps(),
      config,
      state,
      hostname: location.hostname,
      pathname: location.pathname,
      mode,
      anchorOf: (step) => {
        const element = anchorOf(step);
        return element && inViewport(element) ? element : null;
      }
    });
  }

  function check() {
    if (tour || !config || document.hidden) return;
    if (document.querySelector(BUSY_SELECTOR)) return;
    const items = pick("auto");
    if (items.length) open(items, "auto");
    else if (!hasPending({ steps: steps(), config, state, hostname: location.hostname })) stopChecks();
  }

  function stopChecks() {
    clearInterval(checkTimer);
    clearTimeout(firstTimer);
    checkTimer = null;
    firstTimer = null;
  }

  /** Periodic check only while something may still be shown. */
  function schedule() {
    if (tour) return;
    if (!config || !hasPending({ steps: steps(), config, state, hostname: location.hostname })) {
      stopChecks();
      return;
    }
    if (!firstTimer && !checkTimer) firstTimer = setTimeout(check, FIRST_CHECK_MS);
    if (!checkTimer) checkTimer = setInterval(check, CHECK_MS);
  }

  async function replay() {
    if (!config) await loadAll();
    if (tour) close();
    // Always has the welcome card, so even a page without tips says where they come from.
    const items = pick("replay");
    open(items, "replay");
    return items.length;
  }

  api.replay = replay;

  chrome.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
    if (message?.type !== REPLAY_MESSAGE) return false;
    replay().then(
      (count) => sendResponse({ ok: true, count }),
      () => sendResponse({ ok: false })
    );
    return true;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[CONFIG_KEY]) {
      config = changes[CONFIG_KEY].newValue || {};
      if (config.guideEnabled === false && tour?.mode === "auto") close();
    }
    if (changes[GUIDE_KEY]) {
      const saved = changes[GUIDE_KEY].newValue || {};
      state = { seen: Array.isArray(saved.seen) ? saved.seen : [], baseline: saved.baseline || state.baseline };
    }
    if (changes[CONFIG_KEY] || changes[GUIDE_KEY]) schedule();
  });

  loadAll().then(schedule, () => {});
})();
