import { stripCurrencyTokens } from "./currencies.js";
import {
  parsePrice,
  isPlausiblePrice,
  normalizePriceText,
  normalizeDigits,
  locatePrice,
  hasSingleNumber,
} from "./parse-price.js";
import { elementsFromPointDeep } from "./dom-deep.js";

/** Legacy (≤ 0.1.9) snapshot attributes — only read to undo old conversions. */
const LEGACY_HTML_ATTR = "data-betoman-html";
const LEGACY_HIDDEN_ATTR = "data-betoman-hidden-display";

const NON_CONTENT_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"]);

/** Split-cents markup: `$29<sup>99</sup>`, `<span class="a-price-fraction">99</span>`. */
const FRACTION_CLASS_RE = /fraction|cents?\b|decimal|minor|\bsup\b/i;

/**
 * What we changed in each converted element, so undo puts back exactly the
 * text nodes we touched — and leaves alone any the site re-rendered since.
 * @type {WeakMap<Element, { parts: Map<Text, { original: string, written: string, appended?: boolean }> }>}
 */
const records = new WeakMap();

function textNodesIn(root) {
  const nodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      for (let p = node.parentElement; p && p !== root.parentElement; p = p.parentElement) {
        if (NON_CONTENT_TAGS.has(p.tagName)) return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  while (walker.nextNode()) nodes.push(walker.currentNode);
  return nodes;
}

/**
 * Rendered but not visible: `.sr-only`, `.visually-hidden`, Amazon's
 * `.a-offscreen`. `display:none` returns false — the element may be shown
 * later (tabs, carousels) and should still be converted.
 * @param {Element} el
 */
export function isScreenReaderOnly(el) {
  if (!el?.isConnected || !el.getClientRects().length) return false;

  const rect = el.getBoundingClientRect();
  if (rect.width <= 1 || rect.height <= 1) return true;

  const style = getComputedStyle(el);
  if (style.visibility === "hidden") return true;
  if (/^rect\((?:0|1)px,? (?:0|1)px,? (?:0|1)px,? (?:0|1)px\)$/.test(style.clip)) return true;
  if (/inset\(50%\)/.test(style.clipPath || "")) return true;
  if (
    (style.position === "absolute" || style.position === "fixed") &&
    (rect.right + scrollX < 0 || rect.bottom + scrollY < 0)
  ) {
    return true;
  }
  return false;
}

/** @param {Text} node @param {Element} container @param {Map<Element, boolean>} cache */
function isHiddenWithin(node, container, cache) {
  for (let el = node.parentElement; el && el !== container; el = el.parentElement) {
    if (!cache.has(el)) cache.set(el, isScreenReaderOnly(el));
    if (cache.get(el)) return true;
  }
  return false;
}

function isFractionNode(node, container) {
  for (let el = node.parentElement; el && el !== container; el = el.parentElement) {
    if (el.tagName === "SUP") return true;
    const cls = typeof el.className === "string" ? el.className : "";
    if (FRACTION_CLASS_RE.test(cls)) return true;
  }
  return false;
}

/**
 * @param {Element} el
 * @param {boolean} composite
 * @param {(node: Text) => string} valueOf
 */
function buildText(el, composite, valueOf) {
  if (!composite) {
    return normalizePriceText(textNodesIn(el).map(valueOf).join(""));
  }

  const hiddenCache = new Map();
  let out = "";
  for (const node of textNodesIn(el)) {
    if (isHiddenWithin(node, el, hiddenCache)) continue;
    const value = valueOf(node);
    // "$29" + <sup>99</sup> reads as 2999 without a decimal point.
    if (
      /^\s*\d{2}\s*$/.test(value) &&
      /\d\s*$/.test(out) &&
      !/[.,]\d{0,2}\s*$/.test(out) &&
      isFractionNode(node, el)
    ) {
      out = out.replace(/\s+$/, "") + ".";
    }
    out += value;
  }
  return normalizePriceText(out);
}

const currentValue = (node) => node.nodeValue || "";

/**
 * Text from a leaf element only (no descendant aggregation).
 * @param {Element} el
 */
export function getLeafText(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return "";
  return buildText(el, false, currentValue);
}

/**
 * Combined visible text for split-price containers.
 * @param {Element} el
 */
export function getCompositeText(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return "";
  return buildText(el, true, currentValue);
}

/**
 * The text the site would be showing right now if we hadn't converted `el`:
 * our untouched writes map back to their originals, anything the site
 * re-rendered since shows its new value. Null when `el` has no live record.
 * @param {Element} el
 * @param {boolean} composite
 */
export function readSiteText(el, composite) {
  const record = records.get(el);
  if (!record) return null;
  return buildText(el, composite, (node) => {
    const part = record.parts.get(node);
    if (part && node.nodeValue === part.written) return part.original;
    return node.nodeValue || "";
  });
}

/**
 * True when element has no element children (price text lives here).
 * @param {Element} el
 */
export function isPriceLeaf(el) {
  return el?.nodeType === Node.ELEMENT_NODE && el.childElementCount === 0;
}

function parsesAsPrice(text, hints) {
  if (!text) return false;
  const parsed = parsePrice(text, hints);
  return !!parsed && isPlausiblePrice(parsed.amount, parsed.currency);
}

/**
 * Resolve to the element whose text should be replaced (never a multi-price container).
 * @param {Element} el
 * @param {object} [hints]
 */
export function toPriceLeaf(el, hints = {}) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;

  if (isPriceLeaf(el)) {
    return parsesAsPrice(getLeafText(el), hints) && !isScreenReaderOnly(el) ? el : null;
  }

  let found = null;
  for (const node of el.querySelectorAll("*")) {
    if (!isPriceLeaf(node) || !parsesAsPrice(getLeafText(node), hints)) continue;
    // An off-screen copy (".a-offscreen $29.99") is not the price people see.
    if (isScreenReaderOnly(node)) continue;
    if (found) return null;
    found = node;
  }
  return found;
}

/**
 * Find the smallest element whose text parses as a price (leaf or split DOM).
 * @param {Element} fromEl
 * @param {object} [hints]
 * @returns {{ el: Element, composite: boolean, text: string } | null}
 */
export function resolvePriceTarget(fromEl, hints = {}) {
  if (!fromEl || fromEl.nodeType !== Node.ELEMENT_NODE) return null;

  let best = null;
  let bestLen = Infinity;

  for (const { el } of collectPriceTargetCandidates(fromEl)) {
    if (el === document.body || el === document.documentElement) continue;
    const composite = el.childElementCount > 0;
    const text = composite ? getCompositeText(el) : getLeafText(el);
    if (!text || text.length > 80) continue;
    if (composite && !hasSingleNumber(text)) continue;

    let parsed = parsePrice(text, hints);
    if (!parsed) parsed = parsePrice(text);
    if (!parsed || !isPlausiblePrice(parsed.amount, parsed.currency)) continue;
    if (isScreenReaderOnly(el)) continue;

    // Same text → the innermost element (the card link around a price reads
    // "$29.99" too, but converting it would hit the whole card).
    if (
      !best ||
      text.length < bestLen ||
      (text.length === bestLen && best.el.contains(el)) ||
      (text.length === bestLen && best.composite && !composite && !el.contains(best.el))
    ) {
      bestLen = text.length;
      best = { el, composite, text };
    }
  }

  return best;
}

/** @param {Element} fromEl */
function collectPriceTargetCandidates(fromEl) {
  const out = [];
  const seen = new Set();

  function add(el, depth) {
    if (!el || seen.has(el) || el.nodeType !== Node.ELEMENT_NODE) return;
    seen.add(el);
    out.push({ el, depth });
  }

  add(fromEl, 0);

  let node = fromEl.parentElement;
  for (let depth = 1; node && depth <= 8; depth++, node = node.parentElement) {
    add(node, depth);
  }

  if (fromEl.querySelectorAll) {
    let checked = 0;
    for (const el of fromEl.querySelectorAll("*")) {
      if (checked++ > 100) break;
      if (el.childElementCount > 20) continue;
      add(el, 0);
    }
  }

  return out;
}

const BETOMAN_UI_SELECTOR =
  "#betoman-picker-overlay, #betoman-confirm-dialog, #betoman-panel-root";

function isBetomanUiElement(el) {
  return !!el?.closest?.(BETOMAN_UI_SELECTOR);
}

function pointInRect(x, y, rect) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/**
 * Best price element under cursor — handles stretched links, card overlays
 * and open shadow roots.
 * @param {number} x
 * @param {number} y
 * @param {object} [hints] — e.g. { currency } when the site shows bare numbers
 * @returns {Element | null} null when no price is under the point
 */
export function resolvePriceTargetAtPoint(x, y, hints = {}) {
  const stack = elementsFromPointDeep(x, y).filter((el) => !isBetomanUiElement(el));
  if (!stack.length) return null;

  let bestEl = null;
  let bestArea = Infinity;

  function consider(el) {
    const target = resolvePriceTarget(el, hints);
    if (!target?.el) return;
    const rect = target.el.getBoundingClientRect();
    if (!pointInRect(x, y, rect)) return;
    const area = rect.width * rect.height;
    if (area < bestArea) {
      bestArea = area;
      bestEl = target.el;
    }
  }

  for (const el of stack) {
    consider(el);
  }

  if (bestEl) return bestEl;

  const searchRoots = new Set();
  for (const el of stack.slice(0, 6)) {
    searchRoots.add(el);
    let node = el.parentElement;
    for (let i = 0; node && i < 3; i++, node = node.parentElement) {
      searchRoots.add(node);
    }
  }

  for (const root of searchRoots) {
    if (!root?.querySelectorAll) continue;
    let scanned = 0;
    for (const el of root.querySelectorAll("*")) {
      if (scanned++ > 250) break;
      if (el.childElementCount > 40) continue;
      const target = resolvePriceTarget(el, hints);
      if (!target?.el) continue;
      const rect = target.el.getBoundingClientRect();
      if (!pointInRect(x, y, rect)) continue;
      const area = rect.width * rect.height;
      if (area < bestArea) {
        bestArea = area;
        bestEl = target.el;
      }
    }
  }

  return bestEl;
}

/**
 * @param {{ el: Element, composite: boolean }} target
 */
export function getPriceTargetText(target) {
  if (!target?.el) return "";
  return target.composite ? getCompositeText(target.el) : getLeafText(target.el);
}

/** Symbols, digits, separators, currency codes — nothing a reader needs once converted. */
function isPricePartText(text) {
  const rest = stripCurrencyTokens(normalizeDigits(text));
  return /^[\s\d.,'\-–+*()]*$/.test(rest);
}

function digitCount(text) {
  return (normalizeDigits(text).match(/\d/g) || []).length;
}

/**
 * Show `newText` in place of the price inside `el`. Only text nodes change —
 * element structure, listeners and framework bindings stay intact.
 * @param {Element} el
 * @param {string} newText
 * @param {boolean} [composite]
 * @param {object} [hints]
 */
export function replacePriceTargetText(el, newText, composite = false, hints = {}) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;

  restorePriceTargetText(el);

  const parts = new Map();
  const write = (node, value) => {
    if (node.nodeValue === value) return;
    parts.set(node, { original: node.nodeValue, written: value });
    node.nodeValue = value;
  };

  const nodes = textNodesIn(el).filter((n) => n.nodeValue.trim());
  if (!nodes.length) {
    const node = document.createTextNode(newText);
    el.appendChild(node);
    parts.set(node, { original: "", written: newText, appended: true });
    records.set(el, { parts });
    return true;
  }

  const hiddenCache = new Map();
  const hidden = (n) => composite && isHiddenWithin(n, el, hiddenCache);
  const withDigits = nodes.filter((n) => digitCount(n.nodeValue) > 0);
  const visibleDigits = withDigits.filter((n) => !hidden(n));
  const pool = visibleDigits.length ? visibleDigits : withDigits;
  const primary = pool.length
    ? pool.reduce((best, n) => (digitCount(n.nodeValue) > digitCount(best.nodeValue) ? n : best))
    : nodes[0];

  // In the primary node swap only the price itself: "From $29.99 / mo" keeps "From" and "/ mo".
  const value = primary.nodeValue;
  const span = locatePrice(value, hints) || numberSpan(value);
  if (span) {
    write(primary, value.slice(0, span.start) + newText + value.slice(span.end));
  } else {
    const lead = value.match(/^\s*/)[0];
    const trail = value.match(/\s*$/)[0];
    write(primary, lead + newText + trail);
  }

  for (const node of nodes) {
    if (node === primary) continue;
    if (hidden(node) && digitCount(node.nodeValue)) {
      // Keep screen-reader copies (".sr-only $29.99") in sync with what's shown.
      write(node, newText);
    } else if (isPricePartText(node.nodeValue)) {
      write(node, "");
    }
  }

  records.set(el, { parts });
  return true;
}

function numberSpan(text) {
  const m = /\d[\d.,'\s  ]*\d|\d/.exec(normalizeDigits(text));
  return m ? { start: m.index, end: m.index + m[0].length } : null;
}

/**
 * Undo a conversion. Text nodes still showing what we wrote get their
 * original back; nodes the site has re-rendered since are left alone.
 * @param {Element} el
 * @param {string | null} [fallbackOriginal] — for elements converted by an
 *   earlier extension context (no in-memory record)
 * @returns {boolean} whether anything was restored
 */
export function restorePriceTargetText(el, fallbackOriginal = null) {
  if (!el) return false;

  const record = records.get(el);
  if (record) {
    records.delete(el);
    for (const [node, part] of record.parts) {
      if (node.nodeValue !== part.written) continue;
      if (part.appended) node.remove();
      else node.nodeValue = part.original;
    }
    return true;
  }

  // Legacy snapshot from an older version / a previous extension context.
  el.querySelectorAll?.(`[${LEGACY_HIDDEN_ATTR}]`).forEach((part) => {
    part.style.display = part.getAttribute(LEGACY_HIDDEN_ATTR) || "";
    part.removeAttribute(LEGACY_HIDDEN_ATTR);
  });
  if (el.hasAttribute(LEGACY_HTML_ATTR)) {
    el.innerHTML = el.getAttribute(LEGACY_HTML_ATTR);
    el.removeAttribute(LEGACY_HTML_ATTR);
    return true;
  }
  if (fallbackOriginal != null) {
    const nodes = textNodesIn(el).filter((n) => n.nodeValue.trim());
    if (nodes.length) {
      nodes[0].nodeValue = fallbackOriginal;
      for (let i = 1; i < nodes.length; i++) nodes[i].nodeValue = "";
    } else {
      el.textContent = fallbackOriginal;
    }
    return true;
  }
  return false;
}

/** Whether this context holds an undo record for `el`. */
export function hasConversionRecord(el) {
  return records.has(el);
}

/** Back-compat alias used by pattern learning. */
export function resolvePriceElement(pickedEl) {
  return resolvePriceTarget(pickedEl)?.el ?? pickedEl;
}
