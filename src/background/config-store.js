import { CONFIG_KEY, DEFAULT_CONFIG, migrateConfig, validateConfigShape } from "../shared/config-schema.js";
import { ErrorCode, ExtensionError } from "../shared/errors.js";

let cache = null;

export async function getConfig() {
  if (cache) return cache;
  const data = await chrome.storage.local.get(CONFIG_KEY);
  const config = migrateConfig(data[CONFIG_KEY]);
  cache = config;
  await chrome.storage.local.set({ [CONFIG_KEY]: config });
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
  cache = { ...DEFAULT_CONFIG };
  await chrome.storage.local.set({ [CONFIG_KEY]: cache });
  return cache;
}
