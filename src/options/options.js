import { CONFIG_KEY, migrateConfig, validateConfigShape } from "../shared/config-schema.js";
import { diffForm } from "./dirty-state.js";

const configText = document.getElementById("configJson");
const statusEl = document.getElementById("status");
const diagnosticsToggle = document.getElementById("diagnosticsEnabled");
const abacumTabTitleToggle = document.getElementById("abacumTabTitleEnabled");
const lightThemeNavToggle = document.getElementById("lightThemeNavEnabled");
const darkerModelValuesToggle = document.getElementById("darkerModelValuesEnabled");
const datasetSelectionSumToggle = document.getElementById("datasetSelectionSumEnabled");
const datasetPinColumnsToggle = document.getElementById("datasetPinColumnsEnabled");
const datasetTwoRowHeaderToggle = document.getElementById("datasetTwoRowHeaderEnabled");
const formulaWordDeleteToggle = document.getElementById("formulaWordDeleteEnabled");
const datasetTransformLinkToggle = document.getElementById("datasetTransformLinkEnabled");
const unsavedVariableDeleteFixToggle = document.getElementById("unsavedVariableDeleteFixEnabled");
const modelDimensionsToggle = document.getElementById("modelDimensionsEnabled");
const DATASET_COLUMNS_KEY = "abKey.datasetColumns"; // keep in sync with src/content/abacum-dataset-columns.js
const brandLogo = document.getElementById("brandLogo");
const saveBtn = document.getElementById("saveBtn");
const featureToggles = [...document.querySelectorAll('.feature-group input[type="checkbox"]')];

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

for (const input of featureToggles) input.addEventListener("change", refreshDirty);
configText.addEventListener("input", refreshDirty);

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
  statusEl.classList.remove("is-error", "is-info");
  if (isError) {
    statusEl.classList.add("is-error");
  } else if (message.includes("imported") || message.includes("Review")) {
    statusEl.classList.add("is-info");
  }
}

async function loadConfig() {
  const raw = await chrome.storage.local.get(CONFIG_KEY);
  const config = migrateConfig(raw[CONFIG_KEY]);
  diagnosticsToggle.checked = Boolean(config.diagnosticsEnabled);
  abacumTabTitleToggle.checked = config.abacumTabTitleEnabled !== false;
  lightThemeNavToggle.checked = Boolean(config.lightThemeNavEnabled);
  darkerModelValuesToggle.checked = config.darkerModelValuesEnabled !== false;
  datasetSelectionSumToggle.checked = config.datasetSelectionSumEnabled !== false;
  datasetPinColumnsToggle.checked = config.datasetPinColumnsEnabled !== false;
  datasetTwoRowHeaderToggle.checked = config.datasetTwoRowHeaderEnabled !== false;
  formulaWordDeleteToggle.checked = config.formulaWordDeleteEnabled !== false;
  datasetTransformLinkToggle.checked = config.datasetTransformLinkEnabled !== false;
  unsavedVariableDeleteFixToggle.checked = config.unsavedVariableDeleteFixEnabled !== false;
  modelDimensionsToggle.checked = config.modelDimensionsEnabled !== false;
  configText.value = JSON.stringify(config, null, 2);
  takeBaseline();
  setStatus("Configuration loaded.");
}

async function saveConfig() {
  try {
    const parsed = JSON.parse(configText.value);
    parsed.diagnosticsEnabled = diagnosticsToggle.checked;
    parsed.abacumTabTitleEnabled = abacumTabTitleToggle.checked;
    parsed.lightThemeNavEnabled = lightThemeNavToggle.checked;
    parsed.darkerModelValuesEnabled = darkerModelValuesToggle.checked;
    parsed.datasetSelectionSumEnabled = datasetSelectionSumToggle.checked;
    parsed.datasetPinColumnsEnabled = datasetPinColumnsToggle.checked;
    parsed.datasetTwoRowHeaderEnabled = datasetTwoRowHeaderToggle.checked;
    parsed.formulaWordDeleteEnabled = formulaWordDeleteToggle.checked;
    parsed.datasetTransformLinkEnabled = datasetTransformLinkToggle.checked;
    parsed.unsavedVariableDeleteFixEnabled = unsavedVariableDeleteFixToggle.checked;
    parsed.modelDimensionsEnabled = modelDimensionsToggle.checked;
    const migrated = migrateConfig(parsed);
    validateConfigShape(migrated);
    await chrome.storage.local.set({ [CONFIG_KEY]: migrated });
    configText.value = JSON.stringify(migrated, null, 2);
    takeBaseline();
    setStatus("Configuration saved.");
  } catch (error) {
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
    refreshDirty();
    setStatus("Configuration imported. Review and click Save.");
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

document.getElementById("resetDatasetColumnsBtn").addEventListener("click", () =>
  resetDatasetColumns().catch((error) => setStatus(`Reset failed: ${error.message}`, true))
);
document.getElementById("reloadBtn").addEventListener("click", loadConfig);
saveBtn.addEventListener("click", saveConfig);
document.getElementById("exportBtn").addEventListener("click", exportConfig);
document.getElementById("importBtn").addEventListener("click", importConfig);

loadConfig().catch((error) => setStatus(`Failed to load configuration: ${error.message}`, true));
