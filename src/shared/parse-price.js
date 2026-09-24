import { decodeEntities, detectCurrency } from "./currencies.js";

const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "SVG",
  "INPUT",
  "TEXTAREA",
  "SELECT",
  "OPTION",
]);

const PRICE_BOUNDS = {
  default: { min: 0.01, max: 10_000_000 },
  USD: { min: 0.01, max: 500_000 },
  EUR: { min: 0.01, max: 500_000 },
  GBP: { min: 0.01, max: 500_000 },
  JPY: { min: 1, max: 50_000_000 },
  KRW: { min: 1, max: 1_000_000_000 },
  IDR: { min: 1, max: 10_000_000_000 },
  VND: { min: 1, max: 10_000_000_000 },
  IQD: { min: 1, max: 1_000_000_000 },
};

export function normalizeWhitespace(text) {
  return text
    .replace(/[    ​-‏⁦-⁩؜]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Persian / Arabic-Indic digits and separators → ASCII, typographic quotes → '. */
export function normalizeDigits(text) {
  return text
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/٫/g, ".")
    .replace(/٬/g, ",")
    .replace(/[’ʼ]/g, "'");
}

export function normalizePriceText(text) {
  return normalizeWhitespace(normalizeDigits(decodeEntities(text)));
}

/**
 * A number as written in a price: grouped ("1,299.99", "1.234,56", "2 000",
 * "2'000") or plain ("29.99", "1,5", "2000").
 */
const NUMBER_RE =
  /\d{1,3}([,.' ])\d{3}(?:\1\d{3})*(?:[.,]\d{1,2})?(?!\d)|\d+(?:[.,]\d+)?/g;

/** Text that is only a number (plus separators / sign / wrappers), no words. */
const NUMBER_ONLY_RE = /^[-+–(\[]?\s*\d[\d\s.,']*(?:[.,]-{1,2})?\s*[)\]]?\*?$/;

/**
 * @param {string} rawNumber
 * @param {{ thousandSeparator?: string | null, decimalSeparator?: string | null }} hints
 */
export function parseAmount(rawNumber, hints = {}) {
  let s = normalizeDigits(String(rawNumber)).trim();
  if (!s) return null;

  // Spaces and apostrophes are only ever thousands separators.
  s = s.replace(/[\s'  ]/g, "");

  const dots = (s.match(/\./g) || []).length;
  const commas = (s.match(/,/g) || []).length;

  if (dots && commas) {
    // Whichever comes last is the decimal separator.
    const dec = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
    const thou = dec === "," ? "." : ",";
    s = s.split(thou).join("").replace(dec, ".");
  } else if (dots + commas > 1) {
    // "1.234.567" / "1,234,567" — a repeated separator is grouping.
    s = s.replace(/[.,]/g, "");
  } else if (dots + commas === 1) {
    const sep = dots ? "." : ",";
    const [intPart, frac] = s.split(sep);
    let isDecimal;
    if (frac.length !== 3) {
      // "29.99", "1,5", "29.-" — can't be thousands grouping.
      isDecimal = true;
    } else if (hints.thousandSeparator === sep) {
      isDecimal = false;
    } else if (hints.decimalSeparator === sep) {
      isDecimal = true;
    } else {
      // "1,299" / "1.299" — grouping, unless the integer part is 0 ("0.500").
      isDecimal = /^0*$/.test(intPart);
    }
    s = isDecimal ? `${intPart}.${frac}` : intPart + frac;
  }

  s = s.replace(/[^\d.]/g, "");
  if (!s || s === ".") return null;
  const num = Number(s);
  return Number.isFinite(num) ? num : null;
}

/**
 * Pick the number that sits next to the currency token ("2 for $10" → "10").
 * @param {string} text
 * @param {{ matchStart: number, matchEnd: number }} currencyMatch
 * @returns {{ raw: string, index: number } | null}
 */
function extractNumberPortion(text, currencyMatch) {
  const hasToken = currencyMatch.matchEnd > currencyMatch.matchStart;
  let best = null;
  let bestDist = Infinity;

  NUMBER_RE.lastIndex = 0;
  let m;
  while ((m = NUMBER_RE.exec(text)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    if (!hasToken) return { raw: m[0], index: start };
    if (start < currencyMatch.matchEnd && end > currencyMatch.matchStart) continue;

    const dist =
      end <= currencyMatch.matchStart
        ? currencyMatch.matchStart - end
        : start - currencyMatch.matchEnd;
    if (dist < bestDist) {
      best = { raw: m[0], index: start };
      bestDist = dist;
    }
  }

  // A symbol far away from every number isn't this price's currency.
  if (bestDist > 4) return null;
  return best;
}

/**
 * @param {string} text
 * @param {object} [hints]
 * @returns {{ amount: number, currency: string, raw: string, confidence: number, currencyPosition: string } | null}
 */
export function parsePrice(text, hints = {}) {
  if (!text || typeof text !== "string") return null;

  const normalized = normalizePriceText(text);
  if (!normalized || !/\d/.test(normalized)) return null;

  const preferred = hints.currency || null;
  let currencyInfo = detectCurrency(normalized, preferred);

  if (!currencyInfo && preferred) {
    // No symbol in the text (the site draws it with CSS, an icon, or a sibling
    // we didn't select). Accept a bare number only — never "4.5 stars" or "Save 20%".
    if (!NUMBER_ONLY_RE.test(normalized)) return null;
    currencyInfo = { code: preferred, matchStart: 0, matchEnd: 0, raw: "" };
  }

  if (!currencyInfo) return null;

  const number = extractNumberPortion(normalized, currencyInfo);
  if (!number) return null;

  const amount = parseAmount(number.raw, hints);
  if (amount === null) return null;

  if (!isPlausiblePrice(amount, currencyInfo.code)) return null;

  const isPrefix = currencyInfo.raw ? currencyInfo.matchStart < number.index : true;

  return {
    amount,
    currency: currencyInfo.code,
    raw: normalized,
    confidence: currencyInfo.raw ? 1 : 0.8,
    currencyPosition: isPrefix ? "prefix" : "suffix",
  };
}

/**
 * Where the price sits inside `text` (indices into the original string), so a
 * caller can swap just "$29.99" in "From $29.99 / mo" and keep the words.
 * @param {string} text
 * @param {object} [hints]
 * @returns {{ start: number, end: number } | null}
 */
export function locatePrice(text, hints = {}) {
  if (!text) return null;
  // Same-length normalisation only, so indices stay valid for `text`.
  const flat = normalizeDigits(text).replace(/[\u00A0\u202F\u2009\u2007]/g, " ");
  if (!parsePrice(text, hints)) return null;

  const currencyInfo = detectCurrency(flat, hints.currency);
  if (!currencyInfo) {
    NUMBER_RE.lastIndex = 0;
    const m = NUMBER_RE.exec(flat);
    return m ? { start: m.index, end: m.index + m[0].length } : null;
  }

  const number = extractNumberPortion(flat, currencyInfo);
  if (!number) return null;
  return {
    start: Math.min(currencyInfo.matchStart, number.index),
    end: Math.max(currencyInfo.matchEnd, number.index + number.raw.length),
  };
}

/**
 * @param {string} text
 * @param {string | null} [fallbackCurrency] — used when the text has no symbol
 * @returns {object | null}
 */
export function learnFromSample(text, fallbackCurrency = null) {
  let parsed = parsePrice(text);
  if (!parsed && fallbackCurrency) parsed = parsePrice(text, { currency: fallbackCurrency });
  if (!parsed) return null;

  const normalized = normalizePriceText(text);
  const thousandSeparator = inferThousandSeparator(normalized);
  const decimalSeparator = inferDecimalSeparator(normalized, thousandSeparator);

  return {
    currency: parsed.currency,
    currencyPosition: parsed.currencyPosition || "prefix",
    thousandSeparator,
    decimalSeparator,
    loosePattern: buildLoosePattern(parsed.currency),
  };
}

function inferThousandSeparator(text) {
  if (/\d{1,3}(?:,\d{3})+(?:\.\d+)?/.test(text)) return ",";
  if (/\d{1,3}(?:\.\d{3})+(?:,\d+)?/.test(text)) return ".";
  if (/\d{1,3}(?: \d{3})+/.test(text)) return " ";
  if (/\d{1,3}(?:'\d{3})+/.test(text)) return "'";
  return null;
}

function inferDecimalSeparator(text, thousandSep) {
  if (thousandSep === "," && /\d\.\d{1,2}(?:\D|$)/.test(text)) return ".";
  if (thousandSep === "." && /\d,\d{1,2}(?:\D|$)/.test(text)) return ",";
  if (/\d+\.\d{1,2}(?:\D|$)/.test(text) && thousandSep !== ".") return ".";
  if (/\d+,\d{1,2}(?:\D|$)/.test(text) && thousandSep !== ",") return ",";
  return null;
}

export function buildLoosePattern(currency) {
  return `price:${currency}`;
}

/**
 * Whether `text` holds exactly one number. Split-price containers qualify
 * ("$29.99"); a card showing "Was $39.99 Now $29.99" or "4.5 ★ $29" does not —
 * its prices must be picked one by one.
 */
export function hasSingleNumber(text) {
  NUMBER_RE.lastIndex = 0;
  return (normalizePriceText(text).match(NUMBER_RE) || []).length === 1;
}

export function isPlausiblePrice(amount, currency) {
  const bounds = PRICE_BOUNDS[currency] || PRICE_BOUNDS.default;
  return amount >= bounds.min && amount <= bounds.max;
}

export function isSkippableElement(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return true;
  if (SKIP_TAGS.has(el.tagName)) return true;
  if (el.isContentEditable) return true;
  if (el.closest("[data-betoman]")) return true;
  return false;
}
