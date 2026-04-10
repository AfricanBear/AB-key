import { ExtensionError, ErrorCode } from "../shared/errors.js";

export function resolveActionForCommand(config, command) {
  const actionId = config.commandBindings[command];
  if (!actionId) {
    throw new ExtensionError(ErrorCode.InvalidConfig, `No action binding found for command ${command}.`);
  }
  const action = config.actions.find((item) => item.actionId === actionId && item.enabled);
  if (!action) {
    throw new ExtensionError(ErrorCode.InvalidConfig, `Bound action ${actionId} is missing or disabled.`);
  }
  return action;
}

export function canRunOnHost(action, host) {
  const hosts = action.scope?.hosts || ["*"];
  if (hosts.includes("*")) return true;
  return hosts.some((allowed) => host.endsWith(allowed));
}
