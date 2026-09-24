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

/** ISO codes recognised when written out next to a price (case-sensitive). */
const ISO_CODES = [
  "USD", "EUR", "GBP", "CAD", "AUD", "NZD", "JPY", "CNY", "RMB", "INR", "KRW",
  "TRY", "AED", "SAR", "CHF", "SEK", "NOK", "DKK", "ISK", "RUB", "THB", "SGD",
  "HKD", "TWD", "MYR", "QAR", "KWD", "BHD", "OMR", "IQD", "AFN", "AMD", "AZN",
  "GEL", "PLN", "CZK", "HUF", "RON", "BGN", "BRL", "MXN", "ZAR", "ILS", "UAH",
  "PHP", "IDR", "VND", "PKR", "EGP", "NGN",
];

/** Letters must not touch a code, but digits may ("USD29.99", "27,03TL"). */
const code = (c) => new RegExp(`(?<![A-Za-z])(?:${c})(?![A-Za-z])`, "g");
/** Dollar variants: a letter prefix glued to "$" ("CA$", "HK$", "R$"). */
const dollar = (prefix) => new RegExp(`(?<![A-Za-z])${prefix}\\s?\\$`, "g");

/**
 * Currency symbols and codes → ISO 4217.
 * `alt` lists codes an ambiguous symbol may also stand for; when the pattern
 * already knows the currency (hints.currency) and it is in `alt`, it wins.
 */
export const CURRENCY_ENTRIES = [
  { pattern: dollar("U\\.?S\\.?"), code: "USD" },
  { pattern: dollar("AU"), code: "AUD" },
  { pattern: dollar("A"), code: "AUD" },
  { pattern: dollar("CA"), code: "CAD" },
  { pattern: dollar("C"), code: "CAD" },
  { pattern: dollar("NZ"), code: "NZD" },
  { pattern: dollar("HK"), code: "HKD" },
  { pattern: dollar("S"), code: "SGD" },
  { pattern: dollar("NT"), code: "TWD" },
  { pattern: dollar("MX"), code: "MXN" },
  { pattern: dollar("R"), code: "BRL" },
  ...ISO_CODES.map((c) => ({ pattern: code(c), code: c === "RMB" ? "CNY" : c })),
  { pattern: code("TL"), code: "TRY" },
  { pattern: code("zł"), code: "PLN" },
  { pattern: code("Kč"), code: "CZK" },
  { pattern: code("Ft"), code: "HUF" },
  { pattern: code("lei"), code: "RON" },
  { pattern: code("kr\\.?"), code: "SEK", alt: ["NOK", "DKK", "ISK"] },
  { pattern: code("Fr\\."), code: "CHF" },
  { pattern: /د\.\s?إ/g, code: "AED" },
  { pattern: /ر\.\s?س/g, code: "SAR" },
  { pattern: /ر\.\s?ق/g, code: "QAR" },
  { pattern: /د\.\s?ك/g, code: "KWD" },
  { pattern: /€/g, code: "EUR" },
  { pattern: /£/g, code: "GBP" },
  { pattern: /₹/g, code: "INR" },
  { pattern: /₩/g, code: "KRW" },
  { pattern: /₺/g, code: "TRY" },
  { pattern: /₽/g, code: "RUB" },
  { pattern: /₪/g, code: "ILS" },
  { pattern: /₴/g, code: "UAH" },
  { pattern: /₱/g, code: "PHP" },
  { pattern: /₫/g, code: "VND" },
  { pattern: /₦/g, code: "NGN" },
  { pattern: /฿/g, code: "THB" },
  { pattern: /₼/g, code: "AZN" },
  { pattern: /₾/g, code: "GEL" },
  { pattern: /[¥￥]/g, code: "JPY", alt: ["CNY"] },
  { pattern: /[元円]/g, code: "CNY", alt: ["JPY"] },
  { pattern: /\$/g, code: "USD", alt: ["CAD", "AUD", "NZD", "HKD", "SGD", "TWD", "MXN"] },
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

/** Characters between a currency token and the nearest digit. */
function distanceToDigit(text, start, end) {
  let before = Infinity;
  for (let i = start - 1; i >= 0; i--) {
    if (/\d/.test(text[i])) {
      before = start - 1 - i;
      break;
    }
  }
  let after = Infinity;
  for (let i = end; i < text.length; i++) {
    if (/\d/.test(text[i])) {
      after = i - end;
      break;
    }
  }
  return Math.min(before, after);
}

/**
 * Find the currency token that belongs to the price in `text`.
 * Picks the token closest to a number, so words like "AMD Ryzen" or
 * "2 for $10" don't win just for being longer.
 * @param {string} text
 * @param {string} [preferredCode]
 * @returns {{ code: string, matchStart: number, matchEnd: number, raw: string } | null}
 */
export function detectCurrency(text, preferredCode) {
  const normalized = decodeEntities(text);
  const matches = [];

  for (const { pattern, code: iso, alt } of CURRENCY_ENTRIES) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(normalized)) !== null) {
      const resolved = preferredCode && alt?.includes(preferredCode) ? preferredCode : iso;
      matches.push({
        code: resolved,
        matchStart: match.index,
        matchEnd: match.index + match[0].length,
        raw: match[0],
      });
    }
  }

  // Drop tokens nested inside a longer one ("$" inside "CA$").
  const tokens = matches.filter(
    (m) =>
      !matches.some(
        (o) =>
          o !== m &&
          o.matchStart <= m.matchStart &&
          o.matchEnd >= m.matchEnd &&
          o.raw.length > m.raw.length,
      ),
  );
  if (!tokens.length) return null;

  const pool =
    (preferredCode && tokens.filter((t) => t.code === preferredCode).length
      ? tokens.filter((t) => t.code === preferredCode)
      : tokens);

  let best = null;
  let bestDist = Infinity;
  for (const t of pool) {
    const dist = distanceToDigit(normalized, t.matchStart, t.matchEnd);
    if (
      !best ||
      dist < bestDist ||
      (dist === bestDist && t.raw.length > best.raw.length)
    ) {
      best = t;
      bestDist = dist;
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

/** Remove every currency symbol / code from `text`. */
export function stripCurrencyTokens(text) {
  let out = decodeEntities(text);
  for (const { pattern } of CURRENCY_ENTRIES) {
    pattern.lastIndex = 0;
    out = out.replace(pattern, "");
  }
  return out;
}
