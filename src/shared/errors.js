export const ErrorCode = Object.freeze({
  ElementNotFound: "ElementNotFound",
  AmbiguousMatch: "AmbiguousMatch",
  ElementNotInteractable: "ElementNotInteractable",
  OverlayBlocked: "OverlayBlocked",
  TimeoutExceeded: "TimeoutExceeded",
  PermissionDenied: "PermissionDenied",
  InvalidConfig: "InvalidConfig",
  RuntimeFailure: "RuntimeFailure"
});

export class ExtensionError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ExtensionError";
    this.code = code;
    this.details = details;
  }
}
