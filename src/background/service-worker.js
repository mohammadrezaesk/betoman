import { MSG, MIN_MANUAL_REFRESH_MS } from "../shared/constants.js";
import {
  initDefaultsOnInstall,
  getPrefs,
  setRatesCache,
  getRatesCache,
  deleteSitePattern,
  setTabState,
  getTabState,
} from "../shared/storage.js";
import { getEffectiveRates } from "../shared/rates.js";
import { fetchNavasanFromPrefs } from "./navasan.js";

let lastManualRefresh = 0;

async function refreshRatesIfNeeded(force = false) {
  const prefs = await getPrefs();
  if (!prefs.useNavasan) return null;

  const cache = await getRatesCache();
  const age = Date.now() - (cache?.fetchedAt || 0);
  const stale = age >= prefs.refreshIntervalMs;
  const cachedApi =
    cache?.source === "navasan" || cache?.source === "bonbast";

  if (!force && !stale && cachedApi && !cache?.error) {
    return cache;
  }

  try {
    const rates = await fetchNavasanFromPrefs();
    const newCache = {
      rates,
      fetchedAt: Date.now(),
      source: "navasan",
      error: null,
    };
    await setRatesCache(newCache);
    await broadcastRatesUpdated();
    return newCache;
  } catch (err) {
    const newCache = {
      rates: cache?.rates || {},
      fetchedAt: cache?.fetchedAt || Date.now(),
      source: "navasan",
      error: err.message || String(err),
    };
    await setRatesCache(newCache);
    return newCache;
  }
}

async function broadcastRatesUpdated() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: MSG.RATES_UPDATED });
    } catch {
      // Tab may not have content script
    }
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await initDefaultsOnInstall();
  await refreshRatesIfNeeded(true);
});

chrome.runtime.onStartup.addListener(() => {
  refreshRatesIfNeeded(false);
});

chrome.alarms.create("refreshRates", { periodInMinutes: 60 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "refreshRates") {
    refreshRatesIfNeeded(false);
  }
});

function isRestrictedUrl(url) {
  if (!url) return true;
  return (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:") ||
    url.startsWith("https://chrome.google.com/webstore")
  );
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: MSG.PING });
    return true;
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["src/content/inject-bootstrap.js"],
      });
      await new Promise((r) => setTimeout(r, 180));
      await chrome.tabs.sendMessage(tabId, { type: MSG.PING });
      return true;
    } catch {
      return false;
    }
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id || isRestrictedUrl(tab.url)) return;
  const ready = await ensureContentScript(tab.id);
  if (!ready) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: MSG.TOGGLE_PANEL });
  } catch {
    /* tab may not allow injection */
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message.type) {
      case MSG.GET_RATES: {
        const effective = await getEffectiveRates();
        const prefs = await getPrefs();
        sendResponse({
          ok: true,
          rates: effective.rates,
          source: effective.source,
          fetchedAt: effective.fetchedAt,
          error: effective.error,
          warning: effective.warning,
          label: prefs.label,
          currencyNames: prefs.currencyNames || {},
        });
        break;
      }

      case MSG.REFRESH_RATES: {
        const now = Date.now();
        if (now - lastManualRefresh < MIN_MANUAL_REFRESH_MS) {
          sendResponse({ ok: false, error: "Please wait before refreshing again" });
          return;
        }
        lastManualRefresh = now;
        const cache = await refreshRatesIfNeeded(true);
        const effective = await getEffectiveRates();
        sendResponse({
          ok: true,
          cache,
          rates: effective.rates,
          source: effective.source,
          error: effective.error,
        });
        break;
      }

      case MSG.GET_NAVASAN_HISTORY: {
        const cache = await getRatesCache();
        const fromApi =
          cache?.source === "navasan" || cache?.source === "bonbast";
        sendResponse({
          ok: true,
          rates: fromApi ? cache?.rates || {} : {},
          fetchedAt: fromApi ? cache?.fetchedAt ?? null : null,
          error: fromApi ? cache?.error ?? null : null,
        });
        break;
      }

      case MSG.TEST_NAVASAN: {
        try {
          const rates = await fetchNavasanFromPrefs();
          const fetchedAt = Date.now();
          const newCache = {
            rates,
            fetchedAt,
            source: "navasan",
            error: null,
          };
          await setRatesCache(newCache);
          sendResponse({ ok: true, rates, count: Object.keys(rates).length, fetchedAt });
        } catch (err) {
          sendResponse({ ok: false, error: err.message || String(err) });
        }
        break;
      }

      case MSG.GET_TAB_STATE: {
        const tabId = message.tabId ?? sender.tab?.id;
        if (!tabId) {
          sendResponse({ ok: false });
          return;
        }
        const state = await getTabState(tabId);
        sendResponse({ ok: true, ...state });
        break;
      }

      case MSG.SET_TAB_ACTIVE: {
        const tabId = message.tabId ?? sender.tab?.id;
        if (tabId) {
          await setTabState(tabId, { active: message.active });
        }
        sendResponse({ ok: true });
        break;
      }

      case MSG.FORGET_SITE_PATTERN: {
        if (message.origin) {
          await deleteSitePattern(message.origin);
        }
        sendResponse({ ok: true });
        break;
      }

      case MSG.OPEN_OPTIONS:
        chrome.runtime.openOptionsPage();
        sendResponse({ ok: true });
        break;

      default:
        sendResponse({ ok: false });
    }
  })();
  return true;
});
