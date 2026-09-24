import { detectCurrency } from "./currencies.js";

const ISO_RE = /^[A-Z]{3}$/;

const CURRENCY_META_SELECTORS = [
  'meta[itemprop="priceCurrency"]',
  '[itemprop="priceCurrency"]',
  'meta[property="product:price:currency"]',
  'meta[property="og:price:currency"]',
  "[data-currency]",
  "[data-currency-code]",
];

/** Currency drawn by CSS: `.price::before { content: "$" }`. */
function pseudoCurrency(el) {
  for (const pseudo of ["::before", "::after"]) {
    const content = getComputedStyle(el, pseudo).content;
    if (!content || content === "none" || content === "normal") continue;
    const text = content.replace(/^["']|["']$/g, "");
    const found = detectCurrency(`${text} 1`);
    if (found) return found.code;
  }
  return null;
}

/**
 * Currency drawn with CSS pseudo-content on, inside or just above `near`.
 * @param {Element | null} near
 * @returns {string | null} ISO code
 */
export function detectPseudoCurrency(near) {
  if (!near) return null;
  const around = [near, ...near.querySelectorAll("*")].slice(0, 30);
  for (let p = near.parentElement, i = 0; p && i < 3; p = p.parentElement, i++) around.push(p);
  for (const el of around) {
    const code = pseudoCurrency(el);
    if (code) return code;
  }
  return null;
}

/**
 * @param {Document} [doc]
 * @returns {string | null} ISO code from schema.org / Open Graph / JSON-LD
 */
export function detectPageCurrency(doc = document) {
  for (const selector of CURRENCY_META_SELECTORS) {
    for (const el of doc.querySelectorAll(selector)) {
      const value = (
        el.getAttribute("content") ||
        el.getAttribute("data-currency") ||
        el.getAttribute("data-currency-code") ||
        el.textContent ||
        ""
      )
        .trim()
        .toUpperCase();
      if (ISO_RE.test(value)) return value;
    }
  }

  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    const m = /"priceCurrency"\s*:\s*"([A-Za-z]{3})"/.exec(script.textContent || "");
    if (m) return m[1].toUpperCase();
  }

  return null;
}
