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
};

export function normalizeWhitespace(text) {
  return text
    .replace(/[\u00A0\u202F\u2009\u2007]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripWrappers(text) {
  return text
    .replace(/^\s*[\(\[]\s*/, "")
    .replace(/\s*[\)\]]\s*$/, "")
    .replace(/^\s*-\s*/, "")
    .trim();
}

/**
 * @param {string} rawNumber
 * @param {{ thousandSeparator?: string | null, decimalSeparator?: string | null }} hints
 */
export function parseAmount(rawNumber, hints = {}) {
  let s = rawNumber.trim();
  if (!s) return null;

  const thousandSep = hints.thousandSeparator ?? null;
  const decimalSep = hints.decimalSeparator ?? null;

  if (thousandSep && decimalSep && thousandSep !== decimalSep) {
    s = s.split(thousandSep).join("");
    if (decimalSep !== ".") {
      const lastDec = s.lastIndexOf(decimalSep);
      if (lastDec !== -1) {
        s = s.slice(0, lastDec).replace(decimalSep, "") + "." + s.slice(lastDec + 1);
      }
    }
  } else if (thousandSep && !decimalSep) {
    s = s.split(thousandSep).join("");
  } else if (!thousandSep && decimalSep && decimalSep !== ".") {
    const lastDec = s.lastIndexOf(decimalSep);
    if (lastDec !== -1) {
      s = s.slice(0, lastDec).replace(/[.,'\s]/g, "") + "." + s.slice(lastDec + 1);
    }
  } else {
    const dotCount = (s.match(/\./g) || []).length;
    const commaCount = (s.match(/,/g) || []).length;

    if (commaCount && dotCount) {
      if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
        s = s.replace(/\./g, "").replace(",", ".");
      } else {
        s = s.replace(/,/g, "");
      }
    } else if (commaCount === 1 && dotCount === 0) {
      const parts = s.split(",");
      if (parts[1]?.length === 2) {
        s = parts[0].replace(/\s/g, "") + "." + parts[1];
      } else {
        s = s.replace(/,/g, "");
      }
    } else if (dotCount === 1 && commaCount === 0) {
      const parts = s.split(".");
      if (parts[1]?.length === 3 && parts[0].length <= 3) {
        s = s.replace(/\./g, "");
      }
    } else {
      s = s.replace(/[, '\u00A0]/g, "");
    }
  }

  s = s.replace(/[^\d.]/g, "");
  const num = Number(s);
  return Number.isFinite(num) ? num : null;
}

function extractNumberPortion(text, currencyMatch) {
  const withoutCurrency = (
    text.slice(0, currencyMatch.matchStart) + text.slice(currencyMatch.matchEnd)
  ).trim();

  const cleaned = stripWrappers(withoutCurrency);
  const numberMatch = cleaned.match(/[\d][\d\s,'.\u00A0\u202F]*/);
  return numberMatch ? numberMatch[0].trim() : null;
}

/**
 * @param {string} text
 * @param {object} [hints]
 * @returns {{ amount: number, currency: string, raw: string, confidence: number } | null}
 */
export function parsePrice(text, hints = {}) {
  if (!text || typeof text !== "string") return null;

  const normalized = normalizeWhitespace(decodeEntities(text));
  if (!normalized) return null;

  const preferred = hints.currency || null;
  let currencyInfo = detectCurrency(normalized, preferred);

  if (!currencyInfo && preferred) {
    currencyInfo = { code: preferred, matchStart: 0, matchEnd: 0, raw: "" };
  }

  if (!currencyInfo) return null;

  const isPrefix = currencyInfo.matchEnd <= normalized.length / 2;
  const numberRaw = extractNumberPortion(normalized, currencyInfo);
  if (!numberRaw) return null;

  const amount = parseAmount(numberRaw, hints);
  if (amount === null) return null;

  if (!isPlausiblePrice(amount, currencyInfo.code)) return null;

  return {
    amount,
    currency: currencyInfo.code,
    raw: normalized,
    confidence: currencyInfo.raw ? 1 : 0.8,
    currencyPosition: isPrefix ? "prefix" : "suffix",
  };
}

/**
 * @param {string} text
 * @returns {object | null}
 */
export function learnFromSample(text) {
  const parsed = parsePrice(text);
  if (!parsed) return null;

  const normalized = normalizeWhitespace(decodeEntities(text));
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
  if (thousandSep === "," && /\d,\d{2}(?:\D|$)/.test(text)) return ",";
  if (thousandSep === "." && /\d\.\d{2}(?:\D|$)/.test(text)) return ".";
  if (/\d+\.\d{1,2}(?:\D|$)/.test(text) && thousandSep !== ".") return ".";
  if (/\d+,\d{1,2}(?:\D|$)/.test(text) && thousandSep !== ",") return ",";
  return null;
}

export function buildLoosePattern(currency) {
  return `price:${currency}`;
}

export function isPlausiblePrice(amount, currency) {
  const bounds = PRICE_BOUNDS[currency] || PRICE_BOUNDS.default;
  return amount >= bounds.min && amount <= bounds.max;
}

export function looksLikePrice(text, hints = {}) {
  if (!text || text.length > 80) return false;
  if (!/\d/.test(text)) return false;
  if (hints.currency && !text.toUpperCase().includes(hints.currency)) {
    const symbols = { USD: "$", EUR: "€", GBP: "£" };
    const sym = symbols[hints.currency];
    if (sym && !text.includes(sym)) return false;
  }
  return /\d/.test(text) && (detectCurrency(text, hints.currency) || hints.currency);
}

/**
 * @param {Element} el
 * @param {boolean} [leafOnly] — when true, never aggregate descendant text (for containers)
 */
export function getElementPriceText(el, leafOnly = false) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return "";

  if (isPriceLeaf(el) || leafOnly) {
    const text = (el.textContent || "").trim();
    if (text) return text;
  } else if (el.childElementCount > 0) {
    // Container: only direct text nodes, never innerText (would merge many prices)
    let direct = "";
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) direct += child.textContent;
    }
    direct = direct.trim();
    if (direct) return direct;
    return "";
  }

  const inner = (el.innerText || el.textContent || "").trim();
  if (inner) return inner;

  const aria = el.getAttribute("aria-label") || el.getAttribute("title") || "";
  return aria.trim();
}

function isPriceLeaf(el) {
  return el.childElementCount === 0;
}

export function isSkippableElement(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return true;
  if (SKIP_TAGS.has(el.tagName)) return true;
  if (el.closest("[data-betoman]")) return true;
  return false;
}
