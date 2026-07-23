import { NAVASAN_CURRENCY_KEYS } from "../shared/currencies.js";
import { getPrefs } from "../shared/storage.js";

const API_BASES = [
  "https://api.navasan.tech",
  "http://api.navasan.tech",
];

/**
 * Navasan latest rates: GET /latest/?api_key=…
 * Each item is { value, change, timestamp, date } (values in Toman).
 * @see https://www.navasan.net/api/webserviceguide/
 * @param {string} apiKey
 */
export async function fetchNavasanRates(apiKey) {
  if (!apiKey?.trim()) {
    throw new Error("Navasan API key is required");
  }

  const key = apiKey.trim();
  let lastError = null;

  for (const base of API_BASES) {
    const url = `${base}/latest/?api_key=${encodeURIComponent(key)}`;
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        let message = `Navasan HTTP ${response.status}`;
        try {
          const err = await response.json();
          if (err?.message) message = String(err.message);
        } catch {
          /* ignore */
        }
        lastError = new Error(message);
        if (response.status === 401 || response.status === 400 || response.status === 422) {
          throw lastError;
        }
        continue;
      }

      const data = await response.json();
      if (data?.message) {
        throw new Error(String(data.message));
      }

      return parseNavasanResponse(data);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("Could not reach Navasan API");
}

/**
 * @param {Record<string, { value?: string | number } | string | number>} data
 * @returns {Record<string, number>}
 */
export function parseNavasanResponse(data) {
  const rates = {};

  for (const [code, itemKey] of Object.entries(NAVASAN_CURRENCY_KEYS)) {
    if (!itemKey) continue;
    const entry = data[itemKey];
    const raw = entry && typeof entry === "object" ? entry.value : entry;
    if (raw == null || raw === "") continue;
    const value = Number(String(raw).replace(/,/g, ""));
    if (Number.isFinite(value) && value > 0) {
      rates[code] = value;
    }
  }

  if (!Object.keys(rates).length) {
    throw new Error("No currency rates in Navasan response");
  }

  return rates;
}

export async function fetchNavasanFromPrefs() {
  const prefs = await getPrefs();
  return fetchNavasanRates(prefs.navasanApiKey);
}
