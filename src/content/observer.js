import { OBSERVER_DEBOUNCE_MS, MAX_NODES_PER_TICK } from "../shared/constants.js";
import { collectShadowRoots } from "../shared/dom-deep.js";

const OBSERVE_OPTIONS = { childList: true, subtree: true, characterData: true };

/**
 * @param {object} options
 * @param {(roots: Element[]) => void} options.onMutations
 */
export function createDomObserver({ onMutations }) {
  let debounceTimer = null;
  let pendingRoots = new Set();
  let observer = null;
  let observedShadowRoots = new WeakSet();

  function flush() {
    debounceTimer = null;
    if (!pendingRoots.size) return;
    const roots = [...pendingRoots];
    pendingRoots = new Set();
    observeShadowRootsIn(roots);
    onMutations(roots);
  }

  function scheduleFlush() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flush, OBSERVER_DEBOUNCE_MS);
  }

  function isOwnUi(el) {
    return !!el.closest?.("#betoman-panel-root, #betoman-picker-overlay, #betoman-confirm-dialog");
  }

  function collectNodes(record) {
    if (record.type === "characterData") {
      const parent = record.target.parentElement;
      if (parent && !isOwnUi(parent)) pendingRoots.add(parent);
      return;
    }

    for (const node of record.addedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (!isOwnUi(node)) pendingRoots.add(node);
      } else if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
        pendingRoots.add(node.parentElement);
      }
    }
    // A removed text node inside a price (React swapping "29.99" for "31.99")
    // changes that price even when nothing element-level was added.
    if (record.removedNodes.length && record.target.nodeType === Node.ELEMENT_NODE) {
      pendingRoots.add(record.target);
    }
  }

  function handleRecords(records) {
    for (const record of records) {
      collectNodes(record);
    }
    if (pendingRoots.size > MAX_NODES_PER_TICK * 2) {
      pendingRoots = new Set([document.body]);
    }
    if (pendingRoots.size) scheduleFlush();
  }

  function observeShadowRootsIn(roots) {
    if (!observer) return;
    for (const root of roots) {
      for (const shadow of collectShadowRoots(root)) {
        if (observedShadowRoots.has(shadow)) continue;
        observedShadowRoots.add(shadow);
        observer.observe(shadow, OBSERVE_OPTIONS);
      }
    }
  }

  function start() {
    if (observer || !document.body) return;
    observer = new MutationObserver(handleRecords);
    observer.observe(document.body, OBSERVE_OPTIONS);
    observeShadowRootsIn([document.body]);
  }

  function stop() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    pendingRoots.clear();
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    observedShadowRoots = new WeakSet();
  }

  /**
   * Run `fn` (which edits the DOM) without our own edits echoing back as
   * mutations. Site mutations queued before `fn` are still processed.
   * @template T
   * @param {() => T} fn
   * @returns {T}
   */
  function runSilently(fn) {
    if (!observer) return fn();
    handleRecords(observer.takeRecords());
    try {
      return fn();
    } finally {
      observer?.takeRecords();
    }
  }

  return { start, stop, runSilently };
}

/**
 * Notify on in-page (SPA) navigation. Content scripts live in an isolated
 * world, so wrapping history.pushState here never sees the page's own calls;
 * use the Navigation API where available and poll location as a fallback.
 * @param {(url: string) => void} onNavigate
 */
export function watchSpaNavigation(onNavigate) {
  let lastHref = location.href;

  function check() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    onNavigate(location.href);
  }

  const nav = globalThis.navigation;
  nav?.addEventListener?.("navigatesuccess", check);
  window.addEventListener("popstate", check);
  window.addEventListener("hashchange", check);
  const timer = setInterval(check, 1000);

  return () => {
    nav?.removeEventListener?.("navigatesuccess", check);
    window.removeEventListener("popstate", check);
    window.removeEventListener("hashchange", check);
    clearInterval(timer);
  };
}
