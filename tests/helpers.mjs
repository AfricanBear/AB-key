// Shared helpers for AB-key tests (node --test, no dependencies).
//
// The content script is a classic browser script. Tests run it inside a node:vm context with a
// small fake DOM: selectors map to lists of fake elements, and clicks are recorded per page.
import fs from "node:fs";
import vm from "node:vm";

const CONTENT_SCRIPT = fs.readFileSync(new URL("../src/content/content-script.js", import.meta.url), "utf8");
export const CONFIG_KEY = "mv3ClickAutomation.config";
// The selector the content script uses for its broad text/aria search (see collectCandidates).
const BROAD_POOL_SELECTOR = "button, a, [role='button'], [role='menuitem'], input, div, span";

/** Default config of v0.5.0 (schema v1), taken from src/shared/config-schema.js at d8892c5. */
export function loadV1Config() {
  return JSON.parse(fs.readFileSync(new URL("./fixtures/config-v1.json", import.meta.url), "utf8"));
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A fake page. `dom` maps a CSS selector (exactly as the content script queries it) to elements.
 * The key "*" answers the broad text/aria search; any other unknown selector finds nothing.
 */
export function createPage({ hostname = "app.abacum.io", pathname = "/app/modules/m1/edit", dom = {}, tooltips = [] } = {}) {
  const clicks = [];

  function element(name, { text = name, role = null, covered = false, disabled = false, visible = true } = {}) {
    const rect = visible
      ? { top: 10, left: 10, width: 30, height: 30, bottom: 40, right: 40 }
      : { top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 };
    return {
      name,
      tagName: "BUTTON",
      textContent: text,
      innerText: text,
      disabled,
      style: {},
      isConnected: true,
      click: () => clicks.push(name),
      // Right-click menus (Alt+R / Alt+C) are opened with a contextmenu event.
      dispatchEvent: (event) => clicks.push(`${event.type}:${name}`),
      getBoundingClientRect: () => rect,
      getAttribute: (attr) => (attr === "role" ? role : null),
      setAttribute() {},
      removeAttribute() {},
      // hitTest: elementFromPoint() returns null, so contains(null) decides "covered or not"
      contains: () => !covered,
      matches: () => true,
      closest() {
        return this;
      }
    };
  }

  return { hostname, pathname, dom, tooltips, clicks, element };
}

/** A fake MUI tooltip (.MuiTooltip-popper[role=tooltip] > .MuiTooltip-tooltip) with the given text. */
export function createTooltip(text) {
  const children = [];
  const inner = {
    get textContent() {
      return text + children.map((child) => child.textContent).join("");
    },
    querySelector: (selector) =>
      selector.includes("data-ab-key-hotkey-hint") ? children.find((child) => child.attrs["data-ab-key-hotkey-hint"]) || null : null,
    appendChild: (child) => children.push(child),
    children
  };
  const popper = { querySelector: (selector) => (selector === ".MuiTooltip-tooltip" ? inner : null) };
  return { popper, inner };
}

/**
 * Runs src/content/content-script.js against a fake page.
 * `rail` is an array of fake elements used as the right toolbar rail (top to bottom).
 * `nav` is an array of fake elements used as the left navigation links after Library.
 */
export async function loadContentScript(config, page, { rail = [], nav = [] } = {}) {
  const listeners = {};
  const document = {
    addEventListener: (type, fn) => {
      listeners[`document:${type}`] = fn;
    },
    querySelectorAll: (selector) => {
      if (selector === "[role='tooltip']") return page.tooltips.map((tooltip) => tooltip.popper);
      if (selector === BROAD_POOL_SELECTOR) return page.dom["*"] || [];
      return page.dom[selector] || [];
    },
    querySelector: () => null,
    elementFromPoint: () => null,
    createElement: () => ({
      attrs: {},
      style: {},
      textContent: "",
      setAttribute(key, value) {
        this.attrs[key] = value;
      }
    }),
    documentElement: {},
    activeElement: null
  };
  const ctx = {
    console: { ...console, warn() {}, debug() {} },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    performance,
    Promise,
    chrome: {
      storage: {
        local: { get: async () => ({ [CONFIG_KEY]: config }) },
        onChanged: { addListener() {} }
      },
      runtime: { onMessage: { addListener() {} } }
    },
    window: {
      location: { hostname: page.hostname, pathname: page.pathname },
      innerWidth: 2000,
      innerHeight: 1000,
      addEventListener: (type, fn) => {
        listeners[`window:${type}`] = fn;
      },
      getComputedStyle: () => ({ visibility: "visible", display: "block", pointerEvents: "auto" })
    },
    document,
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    MouseEvent: class {
      constructor(type, init = {}) {
        this.type = type;
        Object.assign(this, init);
      }
    },
    AbKeySidebarNav: {
      getLink: (position) => ({ element: nav[position - 1] || null, position, total: nav.length }),
      listLinks: () => nav.map((link) => ({ link, button: link, name: link.name, label: link.name })),
      describe: () => nav.map((link, index) => ({ position: index + 1, label: link.name }))
    },
    AbKeyToolbarRail: {
      listButtons: () => ({ buttons: rail, source: "testid" }),
      getButton: (position) => ({ element: rail[position - 1] || null, source: "testid", total: rail.length }),
      labelOf: (button) => button.name
    }
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(CONTENT_SCRIPT, ctx, { filename: "content-script.js" });
  await sleep(20); // initial config load from chrome.storage

  return {
    /** Simulates Alt+<key>. Returns true if the content script called preventDefault. */
    press(code, key, modifiers = {}) {
      let prevented = false;
      listeners["window:keydown"]({
        code,
        key,
        altKey: true,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
        repeat: false,
        isComposing: false,
        ...modifiers,
        preventDefault() {
          prevented = true;
        }
      });
      return prevented;
    },
    hover(target) {
      listeners["document:pointerover"]({ target });
    }
  };
}
