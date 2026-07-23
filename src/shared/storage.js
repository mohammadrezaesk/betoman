import { STORAGE_KEYS, DEFAULT_PREFS } from "./constants.js";

function storageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}

function storageSet(data) {
  return new Promise((resolve) => {
    chrome.storage.local.set(data, resolve);
  });
}

function sessionGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.session.get(keys, resolve);
  });
}

function sessionSet(data) {
  return new Promise((resolve) => {
    chrome.storage.session.set(data, resolve);
  });
}

function migratePrefs(prefs) {
  if (prefs.useNavasan == null && prefs.useBonbast != null) {
    prefs.useNavasan = prefs.useBonbast;
  }
  if (!prefs.navasanApiKey && prefs.bonbastKey) {
    prefs.navasanApiKey = prefs.bonbastKey;
  }
  return prefs;
}

export async function getPrefs() {
  const data = await storageGet(STORAGE_KEYS.PREFS);
  return migratePrefs({ ...DEFAULT_PREFS, ...data[STORAGE_KEYS.PREFS] });
}

export async function setPrefs(prefs) {
  const current = await getPrefs();
  await storageSet({ [STORAGE_KEYS.PREFS]: { ...current, ...prefs } });
}

export async function getRatesCache() {
  const data = await storageGet(STORAGE_KEYS.RATES_CACHE);
  return data[STORAGE_KEYS.RATES_CACHE] || null;
}

export async function setRatesCache(cache) {
  await storageSet({ [STORAGE_KEYS.RATES_CACHE]: cache });
}

export async function getSitePatterns() {
  const data = await storageGet(STORAGE_KEYS.SITE_PATTERNS);
  return data[STORAGE_KEYS.SITE_PATTERNS] || {};
}

export async function getSitePattern(origin) {
  const patterns = await getSitePatterns();
  return patterns[origin] || null;
}

export async function setSitePattern(origin, pattern) {
  const patterns = await getSitePatterns();
  patterns[origin] = pattern;
  await storageSet({ [STORAGE_KEYS.SITE_PATTERNS]: patterns });
}

export async function deleteSitePattern(origin) {
  const patterns = await getSitePatterns();
  delete patterns[origin];
  await storageSet({ [STORAGE_KEYS.SITE_PATTERNS]: patterns });
}

export async function getTabStates() {
  const data = await sessionGet(STORAGE_KEYS.TAB_STATES);
  return data[STORAGE_KEYS.TAB_STATES] || {};
}

export async function getTabState(tabId) {
  const states = await getTabStates();
  return states[String(tabId)] || { active: false };
}

export async function setTabState(tabId, state) {
  const states = await getTabStates();
  states[String(tabId)] = { ...states[String(tabId)], ...state };
  await sessionSet({ [STORAGE_KEYS.TAB_STATES]: states });
}

export async function initDefaultsOnInstall() {
  const data = await storageGet(STORAGE_KEYS.PREFS);
  if (!data[STORAGE_KEYS.PREFS]) {
    await storageSet({ [STORAGE_KEYS.PREFS]: DEFAULT_PREFS });
  }
}

export function parseManualRateInput(value) {
  if (typeof value === "number") return value;
  const cleaned = String(value).replace(/,/g, "").trim();
  const num = Number(cleaned);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}
