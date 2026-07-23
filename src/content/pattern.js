import {
  learnFromSample,
  parsePrice,
  isPlausiblePrice,
  buildLoosePattern,
} from "../shared/parse-price.js";
import {
  getLeafText,
  getCompositeText,
  toPriceLeaf,
  resolvePriceTarget,
} from "../shared/text-node.js";

const DYNAMIC_CLASS_RE =
  /^(?:css-[a-z0-9]+|_[a-zA-Z0-9]+|sc-[a-zA-Z0-9]+|[a-z]{1,2}[A-Z][a-zA-Z0-9_-]{3,}|[a-f0-9]{6,})$/i;

const PRICE_CLASS_TOKENS = [
  "price",
  "Price",
  "cost",
  "Cost",
  "amount",
  "Amount",
  "money",
  "value",
  "Value",
  "fee",
  "sum",
  "total",
  "Total",
];

const STABLE_ATTRS = [
  "itemprop",
  "data-testid",
  "data-test-id",
  "data-test",
  "data-qa",
  "data-automation-id",
  "data-price",
  "data-product-price",
  "data-component-type",
];

function isStableClass(className) {
  return className && !DYNAMIC_CLASS_RE.test(className) && !/^\d/.test(className);
}

function elementSelectorPart(el, { withNth = false } = {}) {
  const tag = el.tagName.toLowerCase();

  if (el.id && !/^\d/.test(el.id) && el.id.length < 40 && !/[A-F0-9]{8,}/i.test(el.id)) {
    return `#${CSS.escape(el.id)}`;
  }

  if (el.getAttribute("itemprop") === "price") {
    return `[itemprop="price"]`;
  }

  const stableClasses = [...el.classList].filter(isStableClass).slice(0, 2);
  if (stableClasses.length) {
    return `${tag}${stableClasses.map((c) => `.${CSS.escape(c)}`).join("")}`;
  }

  for (const attr of STABLE_ATTRS) {
    const val = el.getAttribute(attr);
    if (!val || val.length >= 60) continue;
    if (attr === "itemprop" && val === "price") return `[itemprop="price"]`;
    return `${tag}[${attr}="${CSS.escape(val)}"]`;
  }

  if (withNth && el.parentElement) {
    const idx = [...el.parentElement.children].indexOf(el) + 1;
    if (idx > 0) return `${tag}:nth-child(${idx})`;
  }

  return tag;
}

function buildPathSelector(el, maxDepth = 6, { withNth = false } = {}) {
  const segments = [];
  let current = el;
  let depth = 0;

  while (current && current !== document.documentElement && depth < maxDepth) {
    segments.unshift(elementSelectorPart(current, { withNth }));
    current = current.parentElement;
    depth++;
  }

  return segments.join(" > ");
}

function generatePartialClassSelectors(el) {
  const tag = el.tagName.toLowerCase();
  const selectors = new Set();
  const classStr = typeof el.className === "string" ? el.className : "";

  for (const token of PRICE_CLASS_TOKENS) {
    if (!classStr.includes(token)) continue;
    selectors.add(`[class*="${token}"]`);
    selectors.add(`${tag}[class*="${token}"]`);
  }

  return [...selectors];
}

function isValidPriceTarget(el, hints, composite, matchCurrency = null) {
  const text = composite ? getCompositeText(el) : getLeafText(el);
  if (!text || text.length > 80) return false;

  let parsed = parsePrice(text, hints);
  if (!parsed) parsed = parsePrice(text);
  if (!parsed || !isPlausiblePrice(parsed.amount, parsed.currency)) return false;
  if (matchCurrency && parsed.currency !== matchCurrency) return false;

  return true;
}

function countPriceMatches(selector, hints, matchCurrency, composite) {
  let nodes;
  try {
    nodes = document.querySelectorAll(selector);
  } catch {
    return { count: 0, priceCount: 0, targets: [] };
  }

  const targets = new Set();
  const targetEls = [];

  for (const el of nodes) {
    if (composite) {
      if (!isValidPriceTarget(el, hints, true, matchCurrency)) continue;
      if (targets.has(el)) continue;
      targets.add(el);
      targetEls.push(el);
      continue;
    }

    const leaf = toPriceLeaf(el);
    if (!leaf || targets.has(leaf)) continue;
    if (!isValidPriceTarget(leaf, hints, false, matchCurrency)) continue;
    targets.add(leaf);
    targetEls.push(leaf);
  }

  return { count: nodes.length, priceCount: targetEls.length, targets: targetEls };
}

function targetMatchesPicked(targetEl, pickedEl) {
  return (
    targetEl === pickedEl ||
    targetEl.contains(pickedEl) ||
    pickedEl.contains(targetEl)
  );
}

function scoreSelector(selector, priceEl, hints, matchCurrency, composite) {
  const { priceCount, targets } = countPriceMatches(selector, hints, matchCurrency, composite);
  if (priceCount === 0) return -1;

  const hasPicked = targets.some((t) => targetMatchesPicked(t, priceEl));
  if (!hasPicked) return -1;

  let score = 0;

  if (priceCount >= 2 && priceCount <= 30) {
    score += 120;
  } else if (priceCount >= 31 && priceCount <= 100) {
    score += 60;
  } else if (priceCount === 1) {
    score += 20;
  } else if (priceCount > 100) {
    score -= 60;
  }
  if (priceCount > 300) score -= 120;
  if (priceCount > 500) score -= 200;

  if (selector.startsWith(".")) score += 24;
  if (selector.includes("[class*=")) score += 18;
  if (selector.includes("[itemprop=")) score += 40;
  if (selector.includes("[data-test")) score += 28;
  if (selector.length < 36) score += 12;
  if (selector.length > 120) score -= 20;

  if (priceCount === 1) {
    const only = targets[0];
    if (only && only !== priceEl && priceEl.contains(only)) score += 30;
    try {
      const match = document.querySelector(selector);
      if (match && match.childElementCount > 0 && !composite) score -= 80;
    } catch {
      /* ignore */
    }
  }

  return score;
}

function collectSelectorCandidates(priceEl) {
  const candidates = new Set();
  let el = priceEl;

  if (priceEl.getAttribute("itemprop") === "price") {
    candidates.add('[itemprop="price"]');
  }

  for (const sel of generatePartialClassSelectors(priceEl)) {
    candidates.add(sel);
  }

  for (const cls of [...priceEl.classList].filter(isStableClass)) {
    candidates.add(`.${CSS.escape(cls)}`);
    candidates.add(`${priceEl.tagName.toLowerCase()}.${CSS.escape(cls)}`);
  }

  while (el && el !== document.body) {
    candidates.add(elementSelectorPart(el));
    candidates.add(elementSelectorPart(el, { withNth: true }));
    candidates.add(buildPathSelector(el, 4));
    candidates.add(buildPathSelector(el, 6, { withNth: true }));

    for (const sel of generatePartialClassSelectors(el)) {
      candidates.add(sel);
    }

    const parent = el.parentElement;
    if (parent) {
      const tag = el.tagName.toLowerCase();
      const stableClasses = [...el.classList].filter(isStableClass);
      const parentPart = elementSelectorPart(parent);

      if (stableClasses.length) {
        const clsSel = `${tag}${stableClasses.map((c) => `.${CSS.escape(c)}`).join("")}`;
        candidates.add(clsSel);
        candidates.add(`${parentPart} > ${clsSel}`);
        candidates.add(`${parentPart} ${clsSel}`);
      }

      for (const token of PRICE_CLASS_TOKENS) {
        if ([...el.classList].some((c) => c.includes(token))) {
          candidates.add(`${parentPart} [class*="${token}"]`);
        }
      }
    }

    el = el.parentElement;
  }

  return [...candidates];
}

/**
 * @param {Element} priceEl
 * @param {object} hints
 * @param {string} currency
 * @param {boolean} composite
 * @returns {string}
 */
export function generateSelector(priceEl, hints, matchCurrency, composite = false) {
  const candidates = collectSelectorCandidates(priceEl);

  let best = null;
  let bestScore = -1;

  for (const selector of candidates) {
    const s = scoreSelector(selector, priceEl, hints, matchCurrency, composite);
    if (s > bestScore) {
      bestScore = s;
      best = selector;
    }
  }

  if (best) return best;

  const partial = generatePartialClassSelectors(priceEl)[0];
  if (partial) return partial;

  const fallbackClass = [...priceEl.classList].find(isStableClass);
  return fallbackClass ? `.${CSS.escape(fallbackClass)}` : elementSelectorPart(priceEl);
}

/**
 * @param {Element} pickedEl
 */
export function learnPatternFromElement(pickedEl) {
  const target = resolvePriceTarget(pickedEl);
  if (!target) return null;

  if (target.composite) {
    const leaf = toPriceLeaf(target.el);
    if (leaf) {
      const leafText = getLeafText(leaf);
      const hints = learnFromSample(leafText);
      if (hints) {
        return rebuildPatternFromPick(leaf, hints, hints.currency, {
          el: leaf,
          composite: false,
          text: leafText,
        });
      }
    }
  }

  const hints = learnFromSample(target.text);
  if (!hints) return null;

  return rebuildPatternFromPick(pickedEl, hints, hints.currency, target);
}

/**
 * Override which exchange rate is used — does not change selector or match count.
 * @param {object} pattern
 * @param {string} currency
 */
export function updatePatternCurrency(pattern, currency) {
  return {
    ...pattern,
    currency,
  };
}

/**
 * @param {Element} pickedEl
 * @param {object} hints
 * @param {string} currency — detected currency for selector scoring
 * @param {{ el: Element, composite: boolean } | null} [knownTarget]
 */
export function rebuildPatternFromPick(pickedEl, hints, currency, knownTarget = null) {
  const target = knownTarget || resolvePriceTarget(pickedEl, hints);
  if (!target) return null;

  const newHints = {
    ...hints,
    loosePattern: buildLoosePattern(currency),
  };

  return {
    selector: generateSelector(target.el, newHints, currency, target.composite),
    hints: newHints,
    currency,
    composite: target.composite,
    enabled: true,
    createdAt: Date.now(),
  };
}

/**
 * @param {string} selector
 * @param {object} pattern
 */
export function findMatchingElements(selector, pattern) {
  let nodes;
  try {
    nodes = document.querySelectorAll(selector);
  } catch {
    return [];
  }

  const results = [];
  const seen = new Set();
  const composite = !!pattern.composite;

  for (const el of nodes) {
    let target = el;

    if (composite) {
      if (!isValidPriceTarget(el, pattern.hints, true)) continue;
    } else {
      const leaf = toPriceLeaf(el);
      if (!leaf) continue;
      target = leaf;
      if (!isValidPriceTarget(leaf, pattern.hints, false)) continue;
    }

    if (seen.has(target) || target.hasAttribute("data-betoman")) continue;
    seen.add(target);
    results.push(target);
  }

  return results;
}

export { resolvePriceTarget as resolvePriceElement };
