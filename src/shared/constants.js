export const MSG = {
  GET_RATES: "GET_RATES",
  RATES_UPDATED: "RATES_UPDATED",
  REFRESH_RATES: "REFRESH_RATES",
  ACTIVATE_PICKER: "ACTIVATE_PICKER",
  DEACTIVATE: "DEACTIVATE",
  GET_TAB_STATE: "GET_TAB_STATE",
  SET_TAB_ACTIVE: "SET_TAB_ACTIVE",
  RESTORE_PAGE: "RESTORE_PAGE",
  APPLY_PATTERN: "APPLY_PATTERN",
  FORGET_SITE_PATTERN: "FORGET_SITE_PATTERN",
  GET_NAVASAN_HISTORY: "GET_NAVASAN_HISTORY",
  TEST_NAVASAN: "TEST_NAVASAN",
  TOGGLE_PANEL: "TOGGLE_PANEL",
  PING: "PING",
  OPEN_OPTIONS: "OPEN_OPTIONS",
};

export const STORAGE_KEYS = {
  PREFS: "prefs",
  RATES_CACHE: "ratesCache",
  SITE_PATTERNS: "sitePatterns",
  TAB_STATES: "tabStates",
};

import { DEFAULT_MANUAL_RATES } from "./currencies.js";

export const DEFAULT_PREFS = {
  useNavasan: false,
  navasanApiKey: "",
  manualRates: { ...DEFAULT_MANUAL_RATES },
  currencyNames: {},
  refreshIntervalMs: 3600000,
  label: "تومان",
};

export const CHECKOUT_BLOCKLIST = [
  /\/checkout\b/i,
  /\/cart\b/i,
  /\/payment\b/i,
  /\/basket\b/i,
];

export const OBSERVER_DEBOUNCE_MS = 100;
export const MAX_NODES_PER_TICK = 200;
export const MIN_MANUAL_REFRESH_MS = 60_000;

export const DEBUG = false;
