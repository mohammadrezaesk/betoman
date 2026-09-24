import { MSG, CHECKOUT_BLOCKLIST, DEBUG } from "../shared/constants.js";
import { fa } from "../shared/i18n/fa.js";
import { getSitePattern, setSitePattern } from "../shared/storage.js";
import { convertAll, restoreAll, reconvertAll } from "./converter.js";
import {
  startPicker,
  stopPicker,
  showConfirmDialog,
  learnPatternFromElement,
  countMatchCandidates,
} from "./picker.js";
import { createBetomanPanel } from "./panel.js";
import { createDomObserver, watchSpaNavigation } from "./observer.js";
import { ensurePeydaStyles } from "../shared/peyda-styles.js";

if (globalThis.__betomanContentLoaded) {
  // Module may be imported twice (manifest + bootstrap inject)
} else {
  globalThis.__betomanContentLoaded = true;
  initBetomanContent();
}

function initBetomanContent() {
  ensurePeydaStyles();
  let active = false;
  let pattern = null;
  let rates = {};
  let label = "تومان";
  let domObserver = null;
  let pickerCleanup = null;

  function log(...args) {
    if (DEBUG) console.log("[Betoman]", ...args);
  }

  function isCheckoutUrl() {
    const path = location.pathname + location.search;
    return CHECKOUT_BLOCKLIST.some((re) => re.test(path));
  }

  /** False once the extension is reloaded/updated and this script is orphaned. */
  function extensionAlive() {
    return !!chrome.runtime?.id;
  }

  async function fetchRates() {
    if (!extensionAlive()) return null;
    const response = await chrome.runtime.sendMessage({ type: MSG.GET_RATES });
    if (response?.ok) {
      rates = response.rates;
      label = response.label || "تومان";
      return response;
    }
    return null;
  }

  /** Run DOM edits without our own writes coming back as mutations. */
  function silently(fn) {
    return domObserver ? domObserver.runSilently(fn) : fn();
  }

  let ratesLoaded = false;

  async function applyConversion(rootElements = null) {
    if (!active || !pattern || isCheckoutUrl()) return 0;

    try {
      // Mutation batches reuse cached rates; RATES_UPDATED refreshes them.
      if (!rootElements || !ratesLoaded) {
        ratesLoaded = !!(await fetchRates());
      }
    } catch (err) {
      if (!extensionAlive()) {
        stopObserver();
        return 0;
      }
      throw err;
    }

    // Turned off (or navigated to checkout) while waiting for rates.
    if (!active || !pattern || isCheckoutUrl()) return 0;

    const currentPattern = pattern;
    const count = silently(() => convertAll(currentPattern, rates, label, rootElements));
    log(`Converted ${count} prices`);
    if (!rootElements) panel.refresh();
    return count;
  }

  function startObserver() {
    domObserver?.stop();
    domObserver = createDomObserver({
      onMutations: (roots) => {
        if (active && pattern) {
          applyConversion(roots).catch((err) => console.error("[Betoman]", err));
        }
      },
    });
    domObserver.start();
  }

  function stopObserver() {
    domObserver?.stop();
    domObserver = null;
  }

  async function activateWithPattern(newPattern) {
    pattern = newPattern;
    active = true;
    startObserver();
    await applyConversion();
  }

  async function deactivate() {
    active = false;
    stopPicker();
    pickerCleanup?.();
    pickerCleanup = null;
    stopObserver();
    restoreAll();
    panel.refresh();
  }

  /** Re-enable on reload when this tab was left on (state lives in the service worker). */
  async function restoreTabState() {
    try {
      const state = await chrome.runtime.sendMessage({ type: MSG.GET_TAB_STATE });
      // Only sites with a saved pattern come back on; others stay off.
      if (state?.ok && state.active && !active) {
        await tryAutoApplySavedPattern();
        panel.refresh();
      }
    } catch {
      /* service worker unavailable — stay off */
    }
  }

  async function tryAutoApplySavedPattern() {
    if (isCheckoutUrl()) return;

    const saved = await getSitePattern(location.origin);
    if (saved?.enabled && saved.selector && saved.hints) {
      pattern = saved;
      active = true;
      startObserver();
      await applyConversion();
    }
  }

  async function handlePick(element, context = {}) {
    const learned = learnPatternFromElement(element, context.fallbackCurrency);
    if (!learned) {
      alert(fa.alerts.noPrice);
      panel.show();
      return;
    }

    const count = countMatchCandidates(learned);
    if (count === 0) {
      alert(fa.alerts.noMatches);
      panel.show();
      return;
    }

    const confirmedPattern = await showConfirmDialog({
      pickedEl: element,
      pattern: learned,
      warnFew: count === 1,
    });
    if (!confirmedPattern) {
      panel.show();
      return;
    }

    await setSitePattern(location.origin, confirmedPattern);
    await activateWithPattern(confirmedPattern);
    panel.show();
  }

  function startPickMode() {
    stopPicker();
    pickerCleanup = startPicker(
      (el, context) => handlePick(el, context),
      () => {
        pickerCleanup = null;
        panel.show();
      },
    );
  }

  function handleSpaNavigation() {
    if (!active) return;
    if (isCheckoutUrl()) {
      silently(() => restoreAll());
      return;
    }
    if (pattern) {
      requestAnimationFrame(() => applyConversion());
    }
  }

  const panel = createBetomanPanel({
    getState: () => ({
      active,
      hasPattern: !!pattern,
      origin: location.origin,
      conversionCurrency: pattern?.currency || null,
    }),

    setActive: async (on) => {
      if (on) {
        active = true;
        if (pattern) {
          startObserver();
          await applyConversion();
        } else {
          await tryAutoApplySavedPattern();
        }
      } else {
        await deactivate();
      }
      await chrome.runtime.sendMessage({
        type: MSG.SET_TAB_ACTIVE,
        active: on,
      });
    },

    startPick: () => {
      if (isCheckoutUrl()) {
        panel.show();
        panel.refresh();
        return;
      }
      active = true;
      fetchRates().then(() => startPickMode());
    },

    forgetSite: async () => {
      await chrome.runtime.sendMessage({
        type: MSG.FORGET_SITE_PATTERN,
        origin: location.origin,
      });
      pattern = null;
      await deactivate();
    },
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    (async () => {
      try {
        switch (message.type) {
          case MSG.PING:
            sendResponse({ ok: true });
            break;

          case MSG.TOGGLE_PANEL:
            panel.toggle();
            sendResponse({ ok: true, open: panel.isOpen() });
            break;

          case MSG.GET_TAB_STATE:
            sendResponse({ ok: true, active, hasPattern: !!pattern, origin: location.origin });
            break;

          case MSG.SET_TAB_ACTIVE:
            if (message.active) {
              active = true;
              if (pattern) {
                startObserver();
                await applyConversion();
              } else {
                await tryAutoApplySavedPattern();
              }
            } else {
              await deactivate();
            }
            panel.refresh();
            sendResponse({ ok: true, active });
            break;

          case MSG.ACTIVATE_PICKER:
            if (isCheckoutUrl()) {
              sendResponse({ ok: false, error: fa.errors.checkout });
              return;
            }
            active = true;
            await fetchRates();
            panel.hide();
            startPickMode();
            sendResponse({ ok: true });
            break;

          case MSG.RESTORE_PAGE:
          case MSG.DEACTIVATE:
            await deactivate();
            sendResponse({ ok: true });
            break;

          case MSG.APPLY_PATTERN:
            if (message.pattern) {
              await activateWithPattern(message.pattern);
            }
            sendResponse({ ok: true });
            break;

          case MSG.FORGET_SITE_PATTERN:
            if (message.origin === location.origin || !message.origin) {
              pattern = null;
              await deactivate();
            }
            panel.refresh();
            sendResponse({ ok: true });
            break;

          case MSG.RATES_UPDATED:
            if (active && pattern) {
              await fetchRates();
              requestAnimationFrame(() => {
                if (active && pattern && !isCheckoutUrl()) {
                  silently(() => reconvertAll(pattern, rates, label));
                }
              });
            }
            panel.refresh();
            sendResponse({ ok: true });
            break;

          default:
            sendResponse({ ok: false });
        }
      } catch (err) {
        console.error("[Betoman]", err);
        sendResponse({ ok: false, error: String(err) });
      }
    })();
    return true;
  });

  watchSpaNavigation(handleSpaNavigation);

  // A previous copy of this script (before an extension reload/update) may
  // have left converted prices behind; put them back before starting fresh.
  restoreAll();
  restoreTabState();
}
