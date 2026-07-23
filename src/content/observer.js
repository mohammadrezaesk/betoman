import { OBSERVER_DEBOUNCE_MS, MAX_NODES_PER_TICK } from "../shared/constants.js";

/**
 * @param {object} options
 * @param {(roots: Element[]) => void} options.onMutations
 */
export function createDomObserver({ onMutations }) {
  let debounceTimer = null;
  let pendingRoots = new Set();
  let observer = null;

  function flush() {
    debounceTimer = null;
    if (!pendingRoots.size) return;
    const roots = [...pendingRoots];
    pendingRoots = new Set();
    onMutations(roots);
  }

  function scheduleFlush() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flush, OBSERVER_DEBOUNCE_MS);
  }

  function collectNodes(record) {
    if (
      record.type === "attributes" &&
      record.attributeName?.startsWith("data-betoman")
    ) {
      return;
    }

    if (record.type === "characterData") {
      const parent = record.target.parentElement;
      if (!parent) return;
      if (parent.closest("[data-betoman]")) return;
      pendingRoots.add(parent);
      return;
    }

    if (record.type === "attributes" && record.target.nodeType === Node.ELEMENT_NODE) {
      pendingRoots.add(record.target);
      return;
    }

    for (const node of record.addedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        pendingRoots.add(node);
      } else if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
        pendingRoots.add(node.parentElement);
      }
    }
  }

  function start() {
    if (observer) return;

    observer = new MutationObserver((records) => {
      for (const record of records) {
        collectNodes(record);
      }
      if (pendingRoots.size > MAX_NODES_PER_TICK * 2) {
        pendingRoots = new Set([document.body]);
      }
      scheduleFlush();
    });

    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
      });
    }
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
  }

  return { start, stop };
}

/**
 * @param {(url: string) => void} onNavigate
 */
export function watchSpaNavigation(onNavigate) {
  const origPush = history.pushState;
  const origReplace = history.replaceState;

  function notify() {
    onNavigate(location.href);
  }

  history.pushState = function (...args) {
    origPush.apply(this, args);
    notify();
  };

  history.replaceState = function (...args) {
    origReplace.apply(this, args);
    notify();
  };

  window.addEventListener("popstate", notify);

  return () => {
    history.pushState = origPush;
    history.replaceState = origReplace;
    window.removeEventListener("popstate", notify);
  };
}
