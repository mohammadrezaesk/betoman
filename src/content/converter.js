import {
  parsePrice,
  isSkippableElement,
  isPlausiblePrice,
  hasSingleNumber,
} from "../shared/parse-price.js";
import { formatToman } from "../shared/format.js";
import { ensurePeydaStyles } from "../shared/peyda-styles.js";
import {
  getLeafText,
  getCompositeText,
  toPriceLeaf,
  readSiteText,
  hasConversionRecord,
  replacePriceTargetText,
  restorePriceTargetText,
} from "../shared/text-node.js";
import { querySelectorAllDeep } from "../shared/dom-deep.js";
import { findMatchingElements } from "./pattern.js";

const DATA_ATTR = "data-betoman";
const ORIGINAL_ATTR = "data-betoman-original";
const COMPOSITE_ATTR = "data-betoman-composite";
const ERROR_ATTR = "data-betoman-error";

/**
 * Everything converted in this context — shadow-DOM elements included, which
 * document.querySelectorAll can't find on undo.
 * @type {Set<Element>}
 */
const converted = new Set();

/**
 * The confirm dialog lets people say "the $ on this site means CAD". That
 * override remaps the currency learned from the picked price only — an
 * explicit "€5" elsewhere on the page is still euros.
 */
function conversionCurrency(pattern, parsed) {
  const learned = pattern.hints?.currency;
  if (pattern.currency && (!learned || parsed.currency === learned)) return pattern.currency;
  return parsed.currency;
}

function getTargetText(el, composite) {
  return composite ? getCompositeText(el) : getLeafText(el);
}

function parseForPattern(text, pattern) {
  if (!text) return null;
  const parsed = parsePrice(text, pattern.hints) || parsePrice(text);
  return parsed && isPlausiblePrice(parsed.amount, parsed.currency) ? parsed : null;
}

/**
 * @param {Element} el
 * @param {string} originalText — what the site shows (stored for reconvert / fallback undo)
 * @param {object} parsed
 * @param {boolean} composite
 */
function writeConversion(el, originalText, parsed, rates, pattern, label, composite) {
  const currency = conversionCurrency(pattern, parsed);
  const rate = rates[currency];
  if (!rate) {
    el.setAttribute(ERROR_ATTR, `No rate for ${currency}`);
    return false;
  }

  replacePriceTargetText(el, formatToman(parsed.amount * rate, label), composite, pattern.hints);
  el.setAttribute(ORIGINAL_ATTR, originalText);
  el.setAttribute(DATA_ATTR, "1");
  if (composite) el.setAttribute(COMPOSITE_ATTR, "1");
  el.removeAttribute(ERROR_ATTR);
  converted.add(el);
  return true;
}

/**
 * Re-convert when the site updates an already-converted price (variant
 * switch, quantity change, React re-render of one text node).
 * @param {Element} el
 * @param {Record<string, number>} rates
 * @param {object} pattern
 * @param {string} label
 */
export function syncConvertedElement(el, rates, pattern, label = "تومان") {
  if (!el?.hasAttribute(DATA_ATTR)) return false;

  const composite = el.hasAttribute(COMPOSITE_ATTR);
  const siteText = readSiteText(el, composite);
  // No record → converted by an earlier extension context; we can't tell our
  // text from the site's, so leave it.
  if (siteText == null) return false;
  if (siteText === el.getAttribute(ORIGINAL_ATTR)) return false;

  const parsed = parseForPattern(siteText, pattern);
  if (!parsed) {
    // The site replaced the price with something else ("Sold out") — step aside.
    restoreElement(el);
    return false;
  }

  ensurePeydaStyles();
  return writeConversion(el, siteText, parsed, rates, pattern, label, composite);
}

/**
 * @param {Element} el
 * @param {Record<string, number>} rates
 * @param {object} pattern
 * @param {string} label
 */
export function convertElement(el, rates, pattern, label = "تومان") {
  const composite = !!pattern.composite;
  const target = composite ? el : toPriceLeaf(el, pattern.hints) || el;
  if (!target || isSkippableElement(target) || target.hasAttribute(DATA_ATTR)) return false;
  if (target.querySelector(`[${DATA_ATTR}]`)) return false;

  const text = getTargetText(target, composite);
  if (!text || text.length > 80) return false;
  if (composite && !hasSingleNumber(text)) return false;

  const parsed = parseForPattern(text, pattern);
  if (!parsed) return false;

  ensurePeydaStyles();
  return writeConversion(target, text, parsed, rates, pattern, label, composite);
}

export function restoreElement(el) {
  if (!el) return;
  converted.delete(el);
  if (!el.hasAttribute(DATA_ATTR)) return;

  restorePriceTargetText(el, hasConversionRecord(el) ? null : el.getAttribute(ORIGINAL_ATTR));
  el.removeAttribute(DATA_ATTR);
  el.removeAttribute(ORIGINAL_ATTR);
  el.removeAttribute(COMPOSITE_ATTR);
  el.removeAttribute(ERROR_ATTR);
}

export function restoreAll() {
  for (const el of [...converted]) restoreElement(el);
  converted.clear();
  // Leftovers from a previous extension context (update / reload).
  querySelectorAllDeep(`[${DATA_ATTR}]`).forEach(restoreElement);
  querySelectorAllDeep(`[${ERROR_ATTR}]`).forEach((el) => el.removeAttribute(ERROR_ATTR));
}

function pruneDisconnected() {
  for (const el of converted) {
    if (!el.isConnected) converted.delete(el);
  }
}

/** Converted elements in, under or around the mutated roots. */
function convertedNear(roots) {
  const out = new Set();
  for (const root of roots) {
    if (root.nodeType !== Node.ELEMENT_NODE || !root.isConnected) continue;
    const up = root.closest(`[${DATA_ATTR}]`);
    if (up) out.add(up);
    for (const el of converted) {
      if (root.contains(el)) out.add(el);
    }
  }
  return out;
}

/**
 * @param {object} pattern
 * @param {Record<string, number>} rates
 * @param {string} label
 * @param {Element[]} [rootElements] — limit work to these mutated subtrees
 */
export function convertAll(pattern, rates, label = "تومان", rootElements = null) {
  pruneDisconnected();

  const roots = rootElements?.length ? rootElements : null;
  const toSync = roots ? convertedNear(roots) : [...converted];
  for (const el of toSync) {
    syncConvertedElement(el, rates, pattern, label);
  }

  let count = 0;
  for (const el of findMatchingElements(pattern.selector, pattern, roots)) {
    if (convertElement(el, rates, pattern, label)) count++;
  }
  return count;
}

/**
 * Re-price everything already converted (rates changed).
 * @param {object} pattern
 * @param {Record<string, number>} rates
 * @param {string} label
 */
export function reconvertAll(pattern, rates, label = "تومان") {
  pruneDisconnected();
  let count = 0;

  for (const el of [...converted]) {
    const original = el.getAttribute(ORIGINAL_ATTR);
    const parsed = parseForPattern(original, pattern);
    if (!parsed) continue;
    const composite = el.hasAttribute(COMPOSITE_ATTR);
    if (writeConversion(el, original, parsed, rates, pattern, label, composite)) count++;
  }

  return count;
}

export function countMatchCandidates(pattern) {
  return findMatchingElements(pattern.selector, pattern).length;
}
