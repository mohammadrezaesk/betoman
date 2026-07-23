import { decodeEntities } from "./currencies.js";
import { parsePrice, isPlausiblePrice, normalizeWhitespace } from "./parse-price.js";

const HTML_ATTR = "data-betoman-html";
const HIDDEN_ATTR = "data-betoman-hidden-display";

function collectTextNodes(root) {
  const nodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    if (walker.currentNode.textContent?.trim()) nodes.push(walker.currentNode);
  }
  return nodes;
}

function getDigitLeaves(root) {
  return [...root.querySelectorAll("*")].filter((el) => {
    if (el.childElementCount > 0) return false;
    return /\d/.test(el.textContent || "");
  });
}

function hidePricePart(el) {
  if (!el?.style) return;
  if (!el.hasAttribute(HIDDEN_ATTR)) {
    el.setAttribute(HIDDEN_ATTR, el.style.display || "");
  }
  el.style.display = "none";
}

function unhidePriceParts(root) {
  if (!root?.querySelectorAll) return;
  root.querySelectorAll(`[${HIDDEN_ATTR}]`).forEach((el) => {
    el.style.display = el.getAttribute(HIDDEN_ATTR) || "";
    el.removeAttribute(HIDDEN_ATTR);
  });
}

function ensureHtmlSnapshot(el) {
  if (!el.hasAttribute(HTML_ATTR)) {
    el.setAttribute(HTML_ATTR, el.innerHTML);
  }
}

/**
 * Replace price inside a container that has child elements (split $ / amount spans).
 * Keeps DOM + styles; only swaps text in the main amount node and hides symbol siblings.
 * @param {Element} el
 * @param {string} newText
 */
function replaceStructuredPriceText(el, newText) {
  ensureHtmlSnapshot(el);

  const digitLeaves = getDigitLeaves(el);
  const allLeaves = [...el.querySelectorAll("*")].filter((n) => n.childElementCount === 0);

  if (digitLeaves.length >= 1) {
    const primary =
      digitLeaves.length === 1
        ? digitLeaves[0]
        : digitLeaves.reduce((best, cur) =>
            (cur.textContent || "").length > (best.textContent || "").length ? cur : best,
          );

    replaceLeafText(primary, newText);

    for (const leaf of allLeaves) {
      if (leaf === primary) continue;
      const t = (leaf.textContent || "").trim();
      const isPricePart =
        /^[\$€£¥₩฿₺₹+\-\s]*$/.test(t) || /^[\d\s,.]+$/.test(t);
      if (!isPricePart) continue;
      leaf.textContent = "";
      hidePricePart(leaf);
    }

    for (const node of collectTextNodes(el)) {
      if (primary.contains(node)) continue;
      node.textContent = "";
    }

    return true;
  }

  const textNodes = collectTextNodes(el);
  if (textNodes.length) {
    textNodes[0].textContent = newText;
    for (let i = 1; i < textNodes.length; i++) {
      textNodes[i].textContent = "";
    }
    return true;
  }

  return false;
}

/**
 * Text from a leaf element only (no descendant aggregation).
 * @param {Element} el
 */
export function getLeafText(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return "";
  return (el.textContent || "").trim();
}

/**
 * Combined visible text for split-price containers.
 * @param {Element} el
 */
export function getCompositeText(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return "";
  return normalizeWhitespace(decodeEntities(el.innerText || el.textContent || ""));
}

/**
 * True when element has no element children (price text lives here).
 * @param {Element} el
 */
export function isPriceLeaf(el) {
  return el?.nodeType === Node.ELEMENT_NODE && el.childElementCount === 0;
}

/**
 * Resolve to the element whose text should be replaced (never a multi-price container).
 * @param {Element} el
 */
export function toPriceLeaf(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;

  if (isPriceLeaf(el)) {
    const text = getLeafText(el);
    return text && parsePrice(text) ? el : null;
  }

  const leaves = [...el.querySelectorAll("*")].filter(isPriceLeaf);
  const priceLeaves = leaves.filter((node) => {
    const text = getLeafText(node);
    if (!text) return false;
    const parsed = parsePrice(text);
    return parsed && isPlausiblePrice(parsed.amount, parsed.currency);
  });

  if (priceLeaves.length === 1) return priceLeaves[0];
  return null;
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
  let bestDepth = -1;

  for (const { el, depth } of collectPriceTargetCandidates(fromEl)) {
    const composite = el.childElementCount > 0;
    const text = composite ? getCompositeText(el) : getLeafText(el);
    if (!text || text.length > 80) continue;

    let parsed = parsePrice(text, hints);
    if (!parsed) parsed = parsePrice(text);
    if (!parsed || !isPlausiblePrice(parsed.amount, parsed.currency)) continue;

    const hasDigits = /\d/.test(text);
    const bestHasDigits = best ? /\d/.test(best.text) : false;

    if (
      !best ||
      (hasDigits && !bestHasDigits) ||
      (hasDigits === bestHasDigits && text.length < bestLen) ||
      (hasDigits === bestHasDigits && text.length === bestLen && depth > bestDepth) ||
      (hasDigits === bestHasDigits &&
        text.length === bestLen &&
        depth === bestDepth &&
        best?.composite &&
        !composite)
    ) {
      bestLen = text.length;
      bestDepth = depth;
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
 * Best price element under cursor — handles stretched links and card overlays.
 * @param {number} x
 * @param {number} y
 * @returns {Element | null}
 */
export function resolvePriceTargetAtPoint(x, y) {
  const stack = document.elementsFromPoint(x, y).filter((el) => !isBetomanUiElement(el));
  if (!stack.length) return null;

  let bestEl = null;
  let bestArea = Infinity;

  function consider(el) {
    const target = resolvePriceTarget(el);
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
      const target = resolvePriceTarget(el);
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

  return bestEl || stack[0];
}

/**
 * @param {{ el: Element, composite: boolean }} target
 */
export function getPriceTargetText(target) {
  if (!target?.el) return "";
  return target.composite ? getCompositeText(target.el) : getLeafText(target.el);
}

/**
 * Replace visible price text without breaking restore for split DOM.
 * @param {Element} el
 * @param {string} newText
 * @param {boolean} [composite]
 */
export function replacePriceTargetText(el, newText, composite = false) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;

  if (isPriceLeaf(el)) {
    return replaceLeafText(el, newText);
  }

  if (composite || el.childElementCount > 0) {
    return replaceStructuredPriceText(el, newText);
  }

  return replaceLeafText(el, newText);
}

/**
 * @param {Element} el
 * @param {string} original
 * @param {boolean} [composite]
 */
export function restorePriceTargetText(el, original, composite = false) {
  if (!el) return;

  unhidePriceParts(el);

  if (el.hasAttribute(HTML_ATTR)) {
    el.innerHTML = el.getAttribute(HTML_ATTR);
    el.removeAttribute(HTML_ATTR);
    return;
  }

  if (isPriceLeaf(el)) {
    replaceLeafText(el, original);
    return;
  }

  const textNodes = collectTextNodes(el);
  if (textNodes.length) {
    textNodes[0].textContent = original;
    for (let i = 1; i < textNodes.length; i++) {
      textNodes[i].textContent = "";
    }
  }
}

/**
 * Replace visible price text without touching element structure or styles.
 * @param {Element} el — must be a price leaf
 * @param {string} newText
 */
export function replaceLeafText(el, newText) {
  if (!isPriceLeaf(el)) return false;

  const textNodes = [];
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
      textNodes.push(child);
    }
  }

  if (!textNodes.length) {
    el.appendChild(document.createTextNode(newText));
    return true;
  }

  textNodes[0].textContent = newText;
  for (let i = 1; i < textNodes.length; i++) {
    textNodes[i].textContent = "";
  }
  return true;
}

/** Back-compat alias used by pattern learning. */
export function resolvePriceElement(pickedEl) {
  return resolvePriceTarget(pickedEl)?.el ?? pickedEl;
}
