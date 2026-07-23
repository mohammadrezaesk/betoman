import { getPrefs, getRatesCache } from "./storage.js";
import { fa } from "./i18n/fa.js";

/**
 * @returns {Promise<{ rates: Record<string, number>, source: string, fetchedAt: number | null, error: string | null, warning: string | null }>}
 */
export async function getEffectiveRates() {
  const prefs = await getPrefs();
  const cache = await getRatesCache();
  const manual = prefs.manualRates || {};

  const apiCache =
    cache?.source === "navasan" || cache?.source === "bonbast";

  if (prefs.useNavasan && cache?.rates && apiCache) {
    const age = Date.now() - (cache.fetchedAt || 0);
    const fresh = age < prefs.refreshIntervalMs;
    if (fresh && !cache.error) {
      return {
        rates: { ...manual, ...cache.rates },
        source: "navasan",
        fetchedAt: cache.fetchedAt,
        error: null,
        warning: null,
      };
    }
    if (cache.rates && Object.keys(cache.rates).length) {
      return {
        rates: { ...manual, ...cache.rates },
        source: "navasan",
        fetchedAt: cache.fetchedAt,
        error: cache.error,
        warning: cache.error || !fresh ? fa.rates.cachedFallback : null,
      };
    }
    if (Object.keys(manual).length) {
      return {
        rates: manual,
        source: "manual",
        fetchedAt: null,
        error: cache?.error || fa.rates.navasanUnavailable,
        warning: fa.rates.manualFallback,
      };
    }
  }

  return {
    rates: manual,
    source: "manual",
    fetchedAt: cache?.fetchedAt ?? null,
    error: null,
    warning: null,
  };
}
