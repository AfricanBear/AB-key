// Model Save after deleting a never-saved variable — page-world part.
//
// Abacum bug: create a variable ("+" → Create variable), delete it before it was ever saved, then
// Save the model. Abacum puts the deleted row's temporary client key (like "0eqLj9i5oc-valid")
// into variables_deleted of the save request (PUT /modelling/<model id>). The backend does not
// know that key and rejects the whole save with 400 CANNOT_DELETE_VARIABLE ("Variable marked for
// deletion does not exist or could not be found"); every later Save fails until a reload, which
// loses all unsaved edits.
//
// When enabled, this script drops temporary keys from variables_deleted just before that request
// is sent. Real variables are sent by their code (T_MD_XXXX) and are never touched; when nothing
// is dropped, the original body goes out byte for byte. Only the narrow "-valid" key pattern is
// removed: an allow-list of "real" ids would silently skip real deletions.
//
// Runs in the MAIN world ("world": "MAIN" in the manifest): Abacum sends the save with
// XMLHttpRequest, and the isolated world has its own XMLHttpRequest. No chrome.* here: the
// isolated script abacum-model-save-fix.js mirrors config.unsavedVariableDeleteFixEnabled into the
// ENABLED_ATTR attribute on <html>, which both worlds see.
(function () {
  "use strict";

  if (globalThis.AbKeyModelSaveFixMain) return;

  const ENABLED_ATTR = "data-ab-key-save-fix"; // keep in sync with abacum-model-save-fix.js
  const SAVE_PATH = /\/modelling\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?(?:[?#]|$)/i;
  const TEMPORARY_KEY = /^[A-Za-z0-9]+-valid$/;

  const isTemporaryKey = (key) => typeof key === "string" && TEMPORARY_KEY.test(key);
  const isSaveRequest = (method, url) => String(method).toUpperCase() === "PUT" && SAVE_PATH.test(String(url));

  /** The body to send instead, or null to send the original one. */
  function cleanBody(body) {
    if (typeof body !== "string") return null;
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      return null;
    }
    const deleted = data && Array.isArray(data.variables_deleted) ? data.variables_deleted : null;
    if (!deleted || !deleted.some(isTemporaryKey)) return null;
    data.variables_deleted = deleted.filter((key) => !isTemporaryKey(key));
    return JSON.stringify(data);
  }

  const proto = XMLHttpRequest.prototype;
  const originalOpen = proto.open;
  const originalSend = proto.send;

  proto.open = function (method, url) {
    this.__abKeySaveRequest = isSaveRequest(method, url);
    return originalOpen.apply(this, arguments);
  };

  proto.send = function (body) {
    if (this.__abKeySaveRequest && document.documentElement.getAttribute(ENABLED_ATTR) === "on") {
      const cleaned = cleanBody(body);
      if (cleaned !== null) return originalSend.call(this, cleaned);
    }
    return originalSend.apply(this, arguments);
  };

  globalThis.AbKeyModelSaveFixMain = { ENABLED_ATTR, isTemporaryKey, isSaveRequest, cleanBody };
})();
