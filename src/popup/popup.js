import { MSG } from "../shared/constants.js";
import { formatRate } from "../shared/format.js";
import { fa, formatRelativeTimeFa } from "../shared/i18n/fa.js";

const toggleActive = document.getElementById("toggleActive");
const btnPick = document.getElementById("btnPick");
const btnRepick = document.getElementById("btnRepick");
const btnForget = document.getElementById("btnForget");
const btnRefresh = document.getElementById("btnRefresh");
const siteStatus = document.getElementById("siteStatus");
const usdRate = document.getElementById("usdRate");
const rateMeta = document.getElementById("rateMeta");
const errorEl = document.getElementById("error");
const linkOptions = document.getElementById("linkOptions");

let currentTab = null;

function showError(msg) {
  if (!msg) {
    errorEl.classList.add("hidden");
    errorEl.textContent = "";
    return;
  }
  errorEl.textContent = msg;
  errorEl.classList.remove("hidden");
}

function isRestrictedUrl(url) {
  if (!url) return true;
  return (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:") ||
    url.startsWith("https://chrome.google.com/webstore")
  );
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendToTab(message) {
  if (!currentTab?.id) return null;
  try {
    return await chrome.tabs.sendMessage(currentTab.id, message);
  } catch {
    return null;
  }
}

async function sendToBackground(message) {
  return chrome.runtime.sendMessage(message);
}

async function ensureContentScript() {
  let res = await sendToTab({ type: MSG.GET_TAB_STATE });
  if (res?.ok) return { ok: true };

  if (!currentTab?.id) return { ok: false, error: fa.errors.noTab };

  const url = currentTab.url || "";
  if (isRestrictedUrl(url)) {
    return { ok: false, error: fa.errors.restrictedPage };
  }

  if (url.startsWith("file://")) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        files: ["src/content/inject-bootstrap.js"],
      });
      await new Promise((r) => setTimeout(r, 150));
      res = await sendToTab({ type: MSG.GET_TAB_STATE });
      if (res?.ok) return { ok: true };
    } catch {
      /* fall through */
    }
    return { ok: false, error: fa.errors.fileUrl };
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      files: ["src/content/inject-bootstrap.js"],
    });
    await new Promise((r) => setTimeout(r, 150));
    res = await sendToTab({ type: MSG.GET_TAB_STATE });
    if (res?.ok) return { ok: true };
  } catch {
    return { ok: false, error: fa.errors.connectFailed };
  }

  return { ok: false, error: fa.errors.reloadTab };
}

async function loadRates() {
  const res = await sendToBackground({ type: MSG.GET_RATES });
  if (!res?.ok) return;

  const usd = res.rates?.USD;
  const label = res.label || fa.toman;
  usdRate.textContent = usd ? `${formatRate(usd)} ${label}` : fa.rateNotSet;

  const parts = [];
  parts.push(res.source === "navasan" ? fa.rateSourceNavasan : fa.rateSourceManual);
  if (res.fetchedAt) parts.push(formatRelativeTimeFa(res.fetchedAt));
  rateMeta.textContent = parts.join(" · ");

  if (res.error || res.warning) {
    showError(res.warning || res.error);
  } else {
    showError(null);
  }
}

async function loadTabState() {
  const ready = await ensureContentScript();
  if (!ready.ok) {
    toggleActive.checked = false;
    btnPick.disabled = true;
    btnRepick.disabled = true;
    siteStatus.textContent = fa.cannotConnect;
    if (ready.error) showError(ready.error);
    return;
  }

  const res = await sendToTab({ type: MSG.GET_TAB_STATE });
  const active = res?.active ?? false;
  const hasPattern = res?.hasPattern ?? false;

  toggleActive.checked = active;
  btnPick.disabled = !active;
  btnRepick.disabled = !active;
  btnForget.disabled = !res?.origin;

  if (res?.origin) {
    const host = new URL(res.origin).hostname;
    siteStatus.textContent = hasPattern
      ? fa.patternSaved(host)
      : active
        ? fa.onPickHint
        : fa.off;
  } else {
    siteStatus.textContent = fa.openShopPage;
  }
}

toggleActive.addEventListener("change", async () => {
  const active = toggleActive.checked;

  const ready = await ensureContentScript();
  if (!ready.ok) {
    showError(ready.error || fa.errors.connectFailed);
    toggleActive.checked = false;
    return;
  }

  await sendToBackground({
    type: MSG.SET_TAB_ACTIVE,
    tabId: currentTab?.id,
    active,
  });

  const res = await sendToTab({ type: MSG.SET_TAB_ACTIVE, active });
  if (!res?.ok && active) {
    showError(ready.error || fa.errors.activateFailed);
    toggleActive.checked = false;
    return;
  }

  showError(null);
  await loadTabState();
});

async function startPick() {
  const ready = await ensureContentScript();
  if (!ready.ok) {
    showError(ready.error || fa.errors.pickerFailed);
    return;
  }

  const res = await sendToTab({ type: MSG.ACTIVATE_PICKER });
  if (!res?.ok) {
    showError(res?.error || fa.errors.pickerFailed);
    return;
  }
  window.close();
}

btnPick.addEventListener("click", startPick);
btnRepick.addEventListener("click", startPick);

btnForget.addEventListener("click", async () => {
  const ready = await ensureContentScript();
  if (!ready.ok) return;

  const res = await sendToTab({ type: MSG.GET_TAB_STATE });
  if (res?.origin) {
    await sendToBackground({ type: MSG.FORGET_SITE_PATTERN, origin: res.origin });
    await sendToTab({ type: MSG.FORGET_SITE_PATTERN, origin: res.origin });
    await sendToTab({ type: MSG.DEACTIVATE });
    toggleActive.checked = false;
    await loadTabState();
  }
});

btnRefresh.addEventListener("click", async () => {
  btnRefresh.disabled = true;
  const res = await sendToBackground({ type: MSG.REFRESH_RATES });
  btnRefresh.disabled = false;
  if (!res?.ok) {
    showError(res?.error || fa.errors.refreshFailed);
    return;
  }
  await loadRates();
});

linkOptions.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

currentTab = await getActiveTab();
await loadRates();
await loadTabState();
