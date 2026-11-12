import { CONFIG_KEY, createDefaultConfig, migrateConfig, validateConfigShape } from "../shared/config-schema.js";
import { ErrorCode, ExtensionError } from "../shared/errors.js";

let cache = null;

// Options page writes chrome.storage directly: drop the cache so commands use fresh config.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[CONFIG_KEY]) cache = null;
});

export async function getConfig() {
  if (cache) return cache;
  const data = await chrome.storage.local.get(CONFIG_KEY);
  const stored = data[CONFIG_KEY];
  const config = migrateConfig(stored);
  if (!stored || stored.configVersion !== config.configVersion) {
    await chrome.storage.local.set({ [CONFIG_KEY]: config });
  }
  cache = config;
  return cache;
}

export async function saveConfig(nextConfig) {
  validateConfigShape(nextConfig);
  cache = nextConfig;
  await chrome.storage.local.set({ [CONFIG_KEY]: nextConfig });
  return cache;
}

export async function updateConfig(mutator) {
  const current = await getConfig();
  const draft = structuredClone(current);
  const updated = mutator(draft) || draft;
  try {
    return await saveConfig(updated);
  } catch (error) {
    cache = current;
    throw new ExtensionError(ErrorCode.InvalidConfig, "Config update failed and was rolled back.", { cause: error.message });
  }
}

export async function resetConfig() {
  cache = createDefaultConfig();
  await chrome.storage.local.set({ [CONFIG_KEY]: cache });
  return cache;
}
