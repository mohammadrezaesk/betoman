import {
  parsePrice,
  isSkippableElement,
  isPlausiblePrice,
} from "../shared/parse-price.js";
import { formatToman } from "../shared/format.js";
import { ensurePeydaStyles } from "../shared/peyda-styles.js";
import {
  getLeafText,
  getCompositeText,
  toPriceLeaf,
  replacePriceTargetText,
  restorePriceTargetText,
} from "../shared/text-node.js";
import { findMatchingElements } from "./pattern.js";

const DATA_ATTR = "data-betoman";
const ORIGINAL_ATTR = "data-betoman-original";
const COMPOSITE_ATTR = "data-betoman-composite";

function conversionCurrency(pattern, parsed) {
  return pattern.currency || parsed.currency;
}

function getTargetText(el, composite) {
  return composite ? getCompositeText(el) : getLeafText(el);
}

/** @param {Element} fromEl @param {object} pattern */
function findNearbyForeignPrice(fromEl, pattern) {
  let container = fromEl.parentElement;

  for (let depth = 0; container && depth < 4; depth++, container = container.parentElement) {
    for (const node of container.children) {
      if (node.nodeType !== Node.ELEMENT_NODE || node === fromEl) continue;
      if (node.hasAttribute(DATA_ATTR)) continue;

      const composite = node.childElementCount > 0;
      const text = composite ? getCompositeText(node) : getLeafText(node);
      if (!text || text.length > 40) continue;

      let parsed = parsePrice(text, pattern.hints);
      if (!parsed) parsed = parsePrice(text);
      if (!parsed || !isPlausiblePrice(parsed.amount, parsed.currency)) continue;

      return { text, parsed };
    }
  }

  return null;
}

/**
 * Re-convert when the site updates an already-converted price (e.g. variant hover).
 * @param {Element} el
 * @param {Record<string, number>} rates
 * @param {object} pattern
 * @param {string} label
 */
export function syncConvertedElement(el, rates, pattern, label = "تومان") {
  if (!el?.hasAttribute(DATA_ATTR)) return false;

  ensurePeydaStyles();
  const composite = el.hasAttribute(COMPOSITE_ATTR);

  const knownOriginal = el.getAttribute(ORIGINAL_ATTR);

  const currentDisplayed = getTargetText(el, composite);
  if (!currentDisplayed) return false;

  if (currentDisplayed.includes(label)) return false;

  if (currentDisplayed === knownOriginal) return false;

  let parsed = parsePrice(currentDisplayed, pattern.hints);
  if (!parsed) parsed = parsePrice(currentDisplayed);
  if (!parsed || !isPlausiblePrice(parsed.amount, parsed.currency)) {
    const nearby = findNearbyForeignPrice(el, pattern);
    if (!nearby) return false;
    parsed = nearby.parsed;
  }

  const rate = rates[conversionCurrency(pattern, parsed)];
  if (!rate) return false;

  const tomanText = formatToman(parsed.amount * rate, label);

  if (currentDisplayed === tomanText) return false;

  el.setAttribute(ORIGINAL_ATTR, currentDisplayed);
  replacePriceTargetText(el, tomanText, composite);
  return true;
}

/** @param {Element[]} roots */
export function syncConvertedPricesInRoots(roots, pattern, rates, label = "تومان") {
  if (!roots?.length) return 0;

  const seen = new Set();
  let synced = 0;

  for (const root of roots) {
    if (root.nodeType !== Node.ELEMENT_NODE) continue;

    const batch = root.hasAttribute(DATA_ATTR)
      ? [root, ...root.querySelectorAll(`[${DATA_ATTR}]`)]
      : [...root.querySelectorAll(`[${DATA_ATTR}]`)];

    for (const el of batch) {
      if (seen.has(el)) continue;
      seen.add(el);
      const currentText = getTargetText(el, el.hasAttribute(COMPOSITE_ATTR));
      if (currentText?.includes(label)) continue;
      if (syncConvertedElement(el, rates, pattern, label)) synced++;
    }
  }

  return synced;
}

/**
 * @param {Element} el
 * @param {Record<string, number>} rates
 * @param {object} pattern
 * @param {string} label
 */
export function convertElement(el, rates, pattern, label = "تومان") {
  ensurePeydaStyles();
  const composite = el.hasAttribute(COMPOSITE_ATTR) || !!pattern.composite;
  const target = composite ? el : toPriceLeaf(el) || el;
  if (!target || isSkippableElement(target) || target.hasAttribute(DATA_ATTR)) return false;

  const text = getTargetText(target, composite);
  if (!text) return false;

  let parsed = parsePrice(text, pattern.hints);
  if (!parsed) parsed = parsePrice(text);
  if (!parsed) return false;

  const rate = rates[conversionCurrency(pattern, parsed)];
  if (!rate) {
    target.setAttribute("data-betoman-error", `No rate for ${conversionCurrency(pattern, parsed)}`);
    return false;
  }

  const toman = parsed.amount * rate;
  target.setAttribute(ORIGINAL_ATTR, text);
  target.setAttribute(DATA_ATTR, "1");
  if (composite) target.setAttribute(COMPOSITE_ATTR, "1");
  target.removeAttribute("data-betoman-error");
  replacePriceTargetText(target, formatToman(toman, label), composite);
  return true;
}

export function restoreElement(el) {
  if (!el?.hasAttribute(DATA_ATTR)) return;

  const original = el.getAttribute(ORIGINAL_ATTR);
  if (original == null) return;

  const composite = el.hasAttribute(COMPOSITE_ATTR);
  restorePriceTargetText(el, original, composite);
  el.removeAttribute(DATA_ATTR);
  el.removeAttribute(ORIGINAL_ATTR);
  el.removeAttribute(COMPOSITE_ATTR);
  el.removeAttribute("data-betoman-error");
}

export function restoreAll() {
  document.querySelectorAll(`[${DATA_ATTR}]`).forEach(restoreElement);
}

/**
 * @param {object} pattern
 * @param {Record<string, number>} rates
 * @param {string} label
 * @param {Element[]} [rootElements]
 */
export function convertAll(pattern, rates, label = "تومان", rootElements = null) {
  let elements;

  if (rootElements?.length) {
    syncConvertedPricesInRoots(rootElements, pattern, rates, label);

    const seen = new Set();
    elements = [];
    for (const root of rootElements) {
      if (root.nodeType !== Node.ELEMENT_NODE) continue;
      const batch =
        root.matches?.(pattern.selector)
          ? [root, ...root.querySelectorAll(pattern.selector)]
          : [...root.querySelectorAll(pattern.selector)];
      for (const el of batch) {
        const target = pattern.composite ? el : toPriceLeaf(el);
        if (target && !seen.has(target)) {
          seen.add(target);
          elements.push(target);
        }
      }
    }
    elements = elements.filter((target) => {
      if (target.hasAttribute(DATA_ATTR)) return false;
      const text = getTargetText(target, !!pattern.composite);
      let parsed = parsePrice(text, pattern.hints);
      if (!parsed) parsed = parsePrice(text);
      return parsed && isPlausiblePrice(parsed.amount, parsed.currency);
    });
  } else {
    document.querySelectorAll(`[${DATA_ATTR}]`).forEach((el) => {
      syncConvertedElement(el, rates, pattern, label);
    });
    elements = findMatchingElements(pattern.selector, pattern);
  }

  let converted = 0;
  for (const el of elements) {
    if (convertElement(el, rates, pattern, label)) converted++;
  }
  return converted;
}

/**
 * @param {object} pattern
 * @param {Record<string, number>} rates
 * @param {string} label
 */
export function reconvertAll(pattern, rates, label = "تومان") {
  const elements = document.querySelectorAll(`[${DATA_ATTR}]`);
  let converted = 0;

  for (const el of elements) {
    const original = el.getAttribute(ORIGINAL_ATTR);
    if (!original) continue;

    let parsed = parsePrice(original, pattern.hints);
    if (!parsed) parsed = parsePrice(original);
    if (!parsed) continue;

    const rate = rates[conversionCurrency(pattern, parsed)];
    if (!rate) continue;

    const composite = el.hasAttribute(COMPOSITE_ATTR);
    replacePriceTargetText(el, formatToman(parsed.amount * rate, label), composite);
    converted++;
  }

  return converted;
}

export function countMatchCandidates(pattern) {
  return findMatchingElements(pattern.selector, pattern).length;
}
