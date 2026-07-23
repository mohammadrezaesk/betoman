/** Default manual rates for new installs (Toman per unit). */
export const DEFAULT_MANUAL_RATES = {
  USD: 85000,
  EUR: 92000,
  GBP: 105000,
  AED: 23200,
  SAR: 22600,
  TRY: 2400,
};

/** Built-in currencies — code and Persian name are fixed; only rate is editable. */
export const BUILTIN_CURRENCY_NAMES = {
  USD: "دلار آمریکا",
  EUR: "یورو",
  GBP: "پوند انگلیس",
  AED: "درهم امارات",
  SAR: "ریال عربستان",
  TRY: "لیر ترکیه",
};

export const BUILTIN_CURRENCY_CODES = Object.keys(BUILTIN_CURRENCY_NAMES);

/** @deprecated use BUILTIN_CURRENCY_CODES */
export const DEFAULT_MANUAL_CURRENCIES = BUILTIN_CURRENCY_CODES;

export function isBuiltinCurrency(code) {
  return BUILTIN_CURRENCY_CODES.includes(code);
}

/**
 * @param {string} code
 * @param {Record<string, string>} [customNames]
 */
export function getCurrencyDisplayName(code, customNames = {}) {
  return BUILTIN_CURRENCY_NAMES[code] || customNames[code] || code;
}

/** Common currencies offered in the pick confirm dialog (ordered). */
export const PICKER_CURRENCY_CODES = [
  "USD",
  "EUR",
  "GBP",
  "AED",
  "SAR",
  "TRY",
  "CAD",
  "AUD",
  "CHF",
  "CNY",
  "JPY",
  "INR",
  "QAR",
  "KWD",
  "SGD",
  "HKD",
  "RUB",
  "THB",
  "SEK",
  "NOK",
  "DKK",
  "BHD",
  "OMR",
  "IQD",
  "AFN",
  "AMD",
  "AZN",
  "MYR",
  "NZD",
  "KRW",
];

/** Currency symbols and codes → ISO 4217. Longer matches first. */
export const CURRENCY_ENTRIES = [
  { pattern: /\bUS\s*\$\b/gi, code: "USD" },
  { pattern: /\bU\.S\.\s*\$\b/gi, code: "USD" },
  { pattern: /\bAU\s*\$\b/gi, code: "AUD" },
  { pattern: /\bA\s*\$\b/gi, code: "AUD" },
  { pattern: /\bCA\s*\$\b/gi, code: "CAD" },
  { pattern: /\bC\s*\$\b/gi, code: "CAD" },
  { pattern: /\bNZ\s*\$\b/gi, code: "NZD" },
  { pattern: /\bUS\$\b/gi, code: "USD" },
  { pattern: /\bUSD\b/gi, code: "USD" },
  { pattern: /\bEUR\b/gi, code: "EUR" },
  { pattern: /\bGBP\b/gi, code: "GBP" },
  { pattern: /\bCAD\b/gi, code: "CAD" },
  { pattern: /\bAUD\b/gi, code: "AUD" },
  { pattern: /\bNZD\b/gi, code: "NZD" },
  { pattern: /\bJPY\b/gi, code: "JPY" },
  { pattern: /\bCNY\b/gi, code: "CNY" },
  { pattern: /\bINR\b/gi, code: "INR" },
  { pattern: /\bKRW\b/gi, code: "KRW" },
  { pattern: /\bTRY\b/gi, code: "TRY" },
  { pattern: /\bTL\b/gi, code: "TRY" },
  { pattern: /\bAED\b/gi, code: "AED" },
  { pattern: /\bSAR\b/gi, code: "SAR" },
  { pattern: /\bCHF\b/gi, code: "CHF" },
  { pattern: /\bSEK\b/gi, code: "SEK" },
  { pattern: /\bNOK\b/gi, code: "NOK" },
  { pattern: /\bDKK\b/gi, code: "DKK" },
  { pattern: /\bRUB\b/gi, code: "RUB" },
  { pattern: /\bTHB\b/gi, code: "THB" },
  { pattern: /\bSGD\b/gi, code: "SGD" },
  { pattern: /\bHKD\b/gi, code: "HKD" },
  { pattern: /\bMYR\b/gi, code: "MYR" },
  { pattern: /\bQAR\b/gi, code: "QAR" },
  { pattern: /\bKWD\b/gi, code: "KWD" },
  { pattern: /\bBHD\b/gi, code: "BHD" },
  { pattern: /\bOMR\b/gi, code: "OMR" },
  { pattern: /\bIQD\b/gi, code: "IQD" },
  { pattern: /\bAFN\b/gi, code: "AFN" },
  { pattern: /\bAMD\b/gi, code: "AMD" },
  { pattern: /\bAZN\b/gi, code: "AZN" },
  { pattern: /د\.إ/g, code: "AED" },
  { pattern: /ر\.س/g, code: "SAR" },
  { pattern: /€/g, code: "EUR" },
  { pattern: /£/g, code: "GBP" },
  { pattern: /₹/g, code: "INR" },
  { pattern: /₩/g, code: "KRW" },
  { pattern: /₺/g, code: "TRY" },
  { pattern: /¥/g, code: "JPY" },
  { pattern: /\$/g, code: "USD" },
];

const ENTITY_MAP = {
  "&dollar;": "$",
  "&#36;": "$",
  "&euro;": "€",
  "&#8364;": "€",
  "&pound;": "£",
  "&#163;": "£",
  "&yen;": "¥",
  "&#165;": "¥",
};

export function decodeEntities(text) {
  let out = text;
  for (const [entity, char] of Object.entries(ENTITY_MAP)) {
    out = out.split(entity).join(char);
  }
  return out;
}

/**
 * @param {string} text
 * @param {string} [preferredCode]
 * @returns {{ code: string, matchStart: number, matchEnd: number, raw: string } | null}
 */
export function detectCurrency(text, preferredCode) {
  const normalized = decodeEntities(text);
  let best = null;

  for (const { pattern, code } of CURRENCY_ENTRIES) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(normalized)) !== null) {
      const candidate = {
        code,
        matchStart: match.index,
        matchEnd: match.index + match[0].length,
        raw: match[0],
      };
      if (preferredCode && code === preferredCode) return candidate;
      if (!best || match[0].length > best.raw.length) best = candidate;
    }
  }

  return best;
}

/** Navasan symbol → ISO code (latest endpoint, sell/free-market where applicable). */
export const NAVASAN_CURRENCY_KEYS = {
  USD: "usd_sell",
  EUR: "eur",
  GBP: "gbp",
  CAD: "cad",
  AUD: "aud",
  CHF: "chf",
  SEK: "sek",
  NOK: "nok",
  DKK: "dkk",
  JPY: "jpy",
  CNY: "cny",
  TRY: "try",
  AED: "aed",
  SAR: "sar",
  INR: "inr",
  KRW: "krw",
  RUB: "rub",
  THB: "thb",
  SGD: "sgd",
  HKD: "hkd",
  MYR: "myr",
  QAR: "qar",
  KWD: "kwd",
  BHD: "bhd",
  OMR: "omr",
  IQD: "iqd",
  AFN: "afn",
  AMD: "amd",
  AZN: "azn",
};
