import { test } from "node:test";
import assert from "node:assert/strict";
import { createDefaultConfig } from "../src/shared/config-schema.js";
import { createPage, loadContentScript } from "./helpers.mjs";

async function setup({ pathname, hostname } = {}) {
  const page = createPage({ pathname, hostname });
  const rail = [page.element("Info"), page.element("Settings")];
  const script = await loadContentScript(createDefaultConfig(), page, { rail });
  return { page, script };
}

test("matched hotkeys call preventDefault synchronously", async () => {
  const { script } = await setup();
  assert.equal(script.press("Digit2", "2"), true);
});

test("hotkeys use the physical key, so a Russian layout works", async () => {
  const { script } = await setup();
  assert.equal(script.press("KeyE", "у"), true, "Alt+E reported as 'у'");
  assert.equal(script.press("KeyS", "ы"), true, "Alt+S reported as 'ы'");
});

test("unbound keys and AltGr (Ctrl+Alt) are not intercepted", async () => {
  const { script } = await setup();
  assert.equal(script.press("KeyQ", "й"), false);
  assert.equal(script.press("Digit2", "2", { ctrlKey: true }), false);
  assert.equal(script.press("KeyE", "e", { altKey: false }), false, "plain letters are ignored");
});

test("a held key is swallowed but does not repeat the action", async () => {
  const { page, script } = await setup();
  assert.equal(script.press("Digit1", "1", { repeat: true }), true);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(page.clicks, []);
});

test("hotkeys are scoped to their hosts", async () => {
  const { script } = await setup({ hostname: "example.com" });
  assert.equal(script.press("Digit1", "1"), false);
  const sub = await setup({ hostname: "evilapp.abacum.io" });
  assert.equal(sub.script.press("Digit1", "1"), false, "suffix match needs a dot boundary");
});

test("Alt+E and Alt+A only fire on model pages", async () => {
  const model = await setup({ pathname: "/app/modules/6158/edit" });
  assert.equal(model.script.press("KeyE", "e"), true);
  assert.equal(model.script.press("KeyA", "a"), true);
  const modulesRoot = await setup({ pathname: "/app/modules" });
  assert.equal(modulesRoot.script.press("KeyA", "a"), true);

  for (const pathname of ["/app/datasets/8439/manager", "/app/dimensions/1a13", "/app/versions"]) {
    const other = await setup({ pathname });
    assert.equal(other.script.press("KeyE", "e"), false, `Alt+E on ${pathname}`);
    assert.equal(other.script.press("KeyA", "a"), false, `Alt+A on ${pathname}`);
    assert.equal(other.script.press("KeyS", "s"), true, `Alt+S on ${pathname}`);
    assert.equal(other.script.press("Digit1", "1"), true, `Alt+1 on ${pathname}`);
  }
});
