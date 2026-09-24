/**
 * Helpers that see into open shadow roots. Many modern storefronts render
 * product cards inside web components, where document.querySelectorAll and
 * document.elementsFromPoint stop at the shadow host.
 */

/**
 * @param {Document | ShadowRoot | Element} root
 * @returns {ShadowRoot[]} open shadow roots under `root`, nested ones included
 */
export function collectShadowRoots(root = document) {
  const out = [];
  const stack = [root];

  while (stack.length) {
    const current = stack.pop();
    if (current.shadowRoot) {
      out.push(current.shadowRoot);
      stack.push(current.shadowRoot);
    }
    const all = current.querySelectorAll ? current.querySelectorAll("*") : [];
    for (const el of all) {
      if (el.shadowRoot) {
        out.push(el.shadowRoot);
        stack.push(el.shadowRoot);
      }
    }
  }

  return out;
}

/**
 * querySelectorAll across the light DOM and every open shadow root.
 * Throws on an invalid selector, like querySelectorAll.
 * @param {string} selector
 * @param {Document | ShadowRoot | Element} [root]
 * @returns {Element[]}
 */
export function querySelectorAllDeep(selector, root = document) {
  const results = [...root.querySelectorAll(selector)];
  for (const shadow of collectShadowRoots(root)) {
    results.push(...shadow.querySelectorAll(selector));
  }
  return results;
}

/**
 * elementsFromPoint that descends into open shadow roots (deepest first).
 * @param {number} x
 * @param {number} y
 * @returns {Element[]}
 */
export function elementsFromPointDeep(x, y) {
  const stack = document.elementsFromPoint(x, y);
  const seen = new Set(stack);
  const deeper = [];

  let host = stack[0];
  for (let depth = 0; host?.shadowRoot && depth < 10; depth++) {
    const inner = host.shadowRoot.elementsFromPoint(x, y).filter((el) => !seen.has(el));
    if (!inner.length) break;
    inner.forEach((el) => seen.add(el));
    deeper.unshift(...inner);
    host = inner[0];
  }

  return [...deeper, ...stack];
}

/** Parent element, crossing a shadow boundary to the host. */
export function parentElementDeep(el) {
  if (el.parentElement) return el.parentElement;
  const root = el.getRootNode?.();
  return root instanceof ShadowRoot ? root.host : null;
}
