/**
 * Fallback loader for tabs that opened before the extension was installed/updated.
 * Primary load path: manifest content_scripts entry (type: module).
 */
(async function betomanInjectBootstrap() {
  if (globalThis.__betomanContentLoaded) return;

  try {
    const url = chrome.runtime.getURL("src/content/content.js");
    await import(url);
  } catch (err) {
    console.error("[Betoman] Failed to load content module:", err);
    console.error(
      "[Betoman] Reload the extension at chrome://extensions, then refresh this tab.",
    );
  }
})();
