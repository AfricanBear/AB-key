import { CONFIG_KEY, lintConfig, migrateConfig, validateConfigShape } from "../shared/config-schema.js";
import { flagsFromText, setFlagInText } from "./config-form.js";
import { diffForm } from "./dirty-state.js";
import { GUIDE_KEY } from "../shared/guide-state.js";

const configText = document.getElementById("configJson");
const statusEl = document.getElementById("status");
const DATASET_COLUMNS_KEY = "abKey.datasetColumns"; // keep in sync with src/content/abacum-dataset-columns.js
const brandLogo = document.getElementById("brandLogo");
const saveBtn = document.getElementById("saveBtn");
// Each feature toggle's id is the config flag it shows (e.g. "diagnosticsEnabled").
const featureToggles = [...document.querySelectorAll('.feature-group input[type="checkbox"]')];
const flagIds = featureToggles.map((input) => input.id);

// --- Unsaved changes: compare the form with the last loaded/saved state ---
let baseline = null;

function readForm() {
  return {
    toggles: Object.fromEntries(featureToggles.map((input) => [input.id, input.checked])),
    json: configText.value
  };
}

function takeBaseline() {
  baseline = readForm();
  refreshDirty();
}

function refreshDirty() {
  const diff = diffForm(baseline, readForm());
  for (const input of featureToggles) {
    input.closest(".toggle-row")?.classList.toggle("is-dirty", diff.toggles.includes(input.id));
  }
  configText.classList.toggle("is-dirty", diff.json);
  saveBtn.classList.toggle("has-changes", diff.count > 0);
  saveBtn.title = diff.count ? `${diff.count} unsaved change${diff.count === 1 ? "" : "s"}` : "";
}

// --- Toggles <-> JSON: the JSON is what Save stores; toggles are a view of its flags ---

function showFlags(text) {
  const flags = flagsFromText(text, flagIds);
  if (!flags) return false;
  for (const input of featureToggles) input.checked = flags[input.id];
  return true;
}

for (const input of featureToggles) {
  input.addEventListener("change", () => {
    const next = setFlagInText(configText.value, input.id, input.checked);
    if (next === null) {
      input.checked = !input.checked;
      configDetails.open = true;
      setStatus("Fix the JSON below first: toggles write into it.", true);
      return;
    }
    configText.value = next;
    refreshDirty();
  });
}

configText.addEventListener("input", () => {
  showFlags(configText.value); // half-typed JSON leaves the toggles as they are
  refreshDirty();
});

// --- Advanced → Configuration: collapsed by default, remembered in this browser ---
const configDetails = document.getElementById("configDetails");
const CONFIG_OPEN_KEY = "abKey.options.configOpen";

try {
  configDetails.open = localStorage.getItem(CONFIG_OPEN_KEY) === "1";
} catch {
  // Storage unavailable: stay collapsed.
}
configDetails.addEventListener("toggle", () => {
  try {
    localStorage.setItem(CONFIG_OPEN_KEY, configDetails.open ? "1" : "0");
  } catch {
    // Not remembered; nothing else depends on it.
  }
});

// Closing or reloading the tab with unsaved changes shows the browser's "Leave site?" dialog.
window.addEventListener("beforeunload", (event) => {
  if (diffForm(baseline, readForm()).count) event.preventDefault();
});

// Extension version from manifest.json, next to the title.
const appVersion = document.getElementById("appVersion");
if (appVersion) appVersion.textContent = `v${chrome.runtime.getManifest().version}`;

if (brandLogo) {
  brandLogo.src = chrome.runtime.getURL("assets/icons/ab-key.png");
}

const lightNavPreviewDefault = document.getElementById("lightNavPreviewDefault");
const lightNavPreviewLight = document.getElementById("lightNavPreviewLight");
if (lightNavPreviewDefault) {
  lightNavPreviewDefault.src = chrome.runtime.getURL("assets/options/light-nav-default.png");
  lightNavPreviewDefault.alt = "Default nav icon";
}
if (lightNavPreviewLight) {
  lightNavPreviewLight.src = chrome.runtime.getURL("assets/options/light-nav-light.png");
  lightNavPreviewLight.alt = "Light theme nav icon";
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.remove("is-error", "is-info", "is-warn");
  if (isError) {
    statusEl.classList.add("is-error");
  } else if (message.includes("imported") || message.includes("Review")) {
    statusEl.classList.add("is-info");
  }
}

function setWarnings(message, warnings) {
  statusEl.textContent = [message, ...warnings.map((warning) => `⚠ ${warning}`)].join("\n");
  statusEl.classList.remove("is-error", "is-info");
  statusEl.classList.add("is-warn");
}

async function loadConfig() {
  const raw = await chrome.storage.local.get(CONFIG_KEY);
  const config = migrateConfig(raw[CONFIG_KEY]);
  configText.value = JSON.stringify(config, null, 2);
  showFlags(configText.value);
  takeBaseline();
  setStatus("Configuration loaded.");
}

async function saveConfig() {
  try {
    const migrated = migrateConfig(JSON.parse(configText.value));
    validateConfigShape(migrated);
    await chrome.storage.local.set({ [CONFIG_KEY]: migrated });
    configText.value = JSON.stringify(migrated, null, 2);
    showFlags(configText.value);
    takeBaseline();
    const warnings = lintConfig(migrated);
    if (warnings.length) setWarnings("Configuration saved, but some hotkeys will not work:", warnings);
    else setStatus("Configuration saved.");
  } catch (error) {
    configDetails.open = true; // the problem is in the JSON: show it
    setStatus(`Save failed: ${error.message}`, true);
  }
}

function exportConfig() {
  const blob = new Blob([configText.value], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "AB-key-config.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

function importConfig() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    const text = await file.text();
    configText.value = text;
    const shown = showFlags(text);
    refreshDirty();
    if (shown) setStatus("Configuration imported. Toggles show its flags. Review and click Save.");
    else setStatus("Imported file is not a valid configuration. Fix the JSON or click Reload.", true);
  });
  input.click();
}

async function resetDatasetColumns() {
  const data = await chrome.storage.local.get(DATASET_COLUMNS_KEY);
  const count = Object.keys(data[DATASET_COLUMNS_KEY] || {}).length;
  if (!count) {
    setStatus("No pinned columns or widths are stored.");
    return;
  }
  if (!confirm(`Forget pinned columns and widths for ${count} dataset${count === 1 ? "" : "s"}?`)) return;
  await chrome.storage.local.remove(DATASET_COLUMNS_KEY);
  setStatus("Pinned columns and widths were reset. Widths return to defaults when the Viewer is reopened.");
}

// Forget which guide tips were shown; the version the user started with stays.
async function resetGuide() {
  const data = await chrome.storage.local.get(GUIDE_KEY);
  const saved = data[GUIDE_KEY] || {};
  await chrome.storage.local.set({ [GUIDE_KEY]: { ...saved, seen: [] } });
  setStatus("Tips will show again on Abacum pages (if Show tips is on and saved).");
}

document.getElementById("resetGuideBtn").addEventListener("click", () =>
  resetGuide().catch((error) => setStatus(`Reset failed: ${error.message}`, true))
);
document.getElementById("resetDatasetColumnsBtn").addEventListener("click", () =>
  resetDatasetColumns().catch((error) => setStatus(`Reset failed: ${error.message}`, true))
);
document.getElementById("reloadBtn").addEventListener("click", loadConfig);
saveBtn.addEventListener("click", saveConfig);
document.getElementById("exportBtn").addEventListener("click", exportConfig);
document.getElementById("importBtn").addEventListener("click", importConfig);

loadConfig().catch((error) => setStatus(`Failed to load configuration: ${error.message}`, true));
