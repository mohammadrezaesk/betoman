import { MSG } from "../shared/constants.js";
import { getCurrencyDisplayName } from "../shared/currencies.js";
import { formatRate } from "../shared/format.js";
import { fa } from "../shared/i18n/fa.js";

const PANEL_ROOT_ID = "betoman-panel-root";

function fontFacesCss() {
  const base = chrome.runtime.getURL("peyda/");
  const files = {
    400: "Peyda-Regular.ttf",
    500: "Peyda-Medium.ttf",
    600: "Peyda-SemiBold.ttf",
    700: "Peyda-Bold.ttf",
  };
  return Object.entries(files)
    .map(
      ([w, f]) => `@font-face {
  font-family: "Peyda";
  src: url("${base}${f}") format("truetype");
  font-weight: ${w};
  font-display: swap;
}`,
    )
    .join("\n");
}

function panelStylesCss() {
  return `
    ${fontFacesCss()}
    #${PANEL_ROOT_ID} {
      --betoman-glass-bg: rgba(255, 255, 255, 0.9);
      --betoman-glass-border: rgba(255, 255, 255, 0.58);
      --betoman-glass-text: rgba(12, 18, 28, 0.92);
      --betoman-glass-muted: rgba(12, 18, 28, 0.58);
      --betoman-accent: #16a34a;
      --betoman-accent-glow: rgba(74, 222, 128, 0.35);
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 2147483640;
      width: 300px;
      font-family: "Peyda", Tahoma, sans-serif;
      direction: rtl;
      color: var(--betoman-glass-text);
      pointer-events: auto;
      display: none;
      isolation: isolate;
    }
    #${PANEL_ROOT_ID}.open { display: block; }
    #${PANEL_ROOT_ID},
    #${PANEL_ROOT_ID} * {
      box-sizing: border-box;
    }
    #${PANEL_ROOT_ID} *:not(svg):not(path):not(circle):not(line):not(polyline) {
      font-family: "Peyda", Tahoma, sans-serif;
    }
    #${PANEL_ROOT_ID} button {
      font-family: "Peyda", Tahoma, sans-serif;
    }
    #${PANEL_ROOT_ID} .betoman-panel {
      background: var(--betoman-glass-bg);
      backdrop-filter: blur(32px) saturate(180%);
      -webkit-backdrop-filter: blur(32px) saturate(180%);
      border: 1px solid var(--betoman-glass-border);
      border-radius: 20px;
      box-shadow: 0 12px 48px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.65);
      padding: 18px 18px 16px;
      max-height: calc(100vh - 32px);
      overflow-y: auto;
    }
    #${PANEL_ROOT_ID} .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 0;
      padding-bottom: 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.35);
    }
    #${PANEL_ROOT_ID} .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    #${PANEL_ROOT_ID} .brand-icon {
      width: 36px;
      height: 36px;
      border-radius: 11px;
      display: block;
      flex-shrink: 0;
      object-fit: contain;
      padding: 5px;
      background: rgba(255,255,255,0.35);
      border: 1px solid var(--betoman-glass-border);
    }
    #${PANEL_ROOT_ID} h1 {
      margin: 0;
      font-size: 17px;
      font-weight: 700;
      font-family: "Peyda", Tahoma, sans-serif;
      line-height: 1.2;
    }
    #${PANEL_ROOT_ID} .subtitle {
      margin: 2px 0 0;
      font-size: 10px;
      font-family: "Peyda", Tahoma, sans-serif;
      color: var(--betoman-glass-muted);
      line-height: 1.4;
    }
    #${PANEL_ROOT_ID} .btn-close {
      border: none;
      background: rgba(255,255,255,0.35);
      border: 1px solid var(--betoman-glass-border);
      border-radius: 10px;
      width: 32px;
      height: 32px;
      cursor: pointer;
      font-size: 18px;
      line-height: 1;
      color: var(--betoman-glass-muted);
      flex-shrink: 0;
    }
    #${PANEL_ROOT_ID} .panel-block {
      padding: 14px 2px;
      border-top: 1px solid rgba(255, 255, 255, 0.35);
    }
    #${PANEL_ROOT_ID} .panel-block:first-of-type {
      border-top: none;
      padding-top: 14px;
    }
    #${PANEL_ROOT_ID} .panel-block:last-of-type {
      padding-bottom: 4px;
    }
    #${PANEL_ROOT_ID} .site-card {
      padding: 12px 14px;
      border: 1px solid var(--betoman-inner-border, rgba(12, 18, 28, 0.1));
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.32);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
    }
    #${PANEL_ROOT_ID} .site-card-top {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    #${PANEL_ROOT_ID} .site-info {
      flex: 1;
      min-width: 0;
    }
    #${PANEL_ROOT_ID} .site-title {
      display: block;
      font-size: 14px;
      font-weight: 600;
      line-height: 1.3;
      color: var(--betoman-glass-text);
    }
    #${PANEL_ROOT_ID} .site-status {
      display: block;
      margin-top: 4px;
      font-size: 11px;
      line-height: 1.45;
      color: var(--betoman-glass-muted);
    }
    #${PANEL_ROOT_ID} .site-status.on {
      color: var(--betoman-accent);
      font-weight: 500;
    }
    #${PANEL_ROOT_ID} .target-info {
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid rgba(12, 18, 28, 0.08);
    }
    #${PANEL_ROOT_ID} .target-info.hidden {
      display: none;
    }
    #${PANEL_ROOT_ID} .target-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    #${PANEL_ROOT_ID} .target-row + .target-row {
      margin-top: 8px;
    }
    #${PANEL_ROOT_ID} .target-label {
      font-size: 11px;
      font-weight: 500;
      color: var(--betoman-glass-muted);
    }
    #${PANEL_ROOT_ID} .target-value {
      font-size: 12px;
      font-weight: 600;
      color: var(--betoman-accent);
      text-align: left;
      direction: rtl;
    }
    #${PANEL_ROOT_ID} .hint {
      margin: 8px 0 0;
      font-size: 11px;
      color: var(--betoman-glass-muted);
      line-height: 1.55;
    }
    #${PANEL_ROOT_ID} .switch {
      position: relative;
      width: 42px;
      height: 24px;
      flex-shrink: 0;
    }
    #${PANEL_ROOT_ID} .switch input { opacity: 0; width: 0; height: 0; }
    #${PANEL_ROOT_ID} .switch .slider {
      position: absolute;
      inset: 0;
      cursor: pointer;
      background: rgba(0,0,0,0.08);
      border: 1px solid var(--betoman-glass-border);
      border-radius: 999px;
      transition: 0.25s;
    }
    #${PANEL_ROOT_ID} .switch .slider::before {
      content: "";
      position: absolute;
      height: 18px;
      width: 18px;
      right: 2px;
      bottom: 2px;
      background: #fff;
      border-radius: 50%;
      transition: 0.25s;
      box-shadow: 0 1px 4px rgba(0,0,0,0.15);
    }
    #${PANEL_ROOT_ID} .switch input:checked + .slider {
      background: rgba(74, 222, 128, 0.25);
      border-color: rgba(74, 222, 128, 0.5);
    }
    #${PANEL_ROOT_ID} .switch input:checked + .slider::before {
      transform: translateX(-18px);
      background: var(--betoman-accent);
    }
    #${PANEL_ROOT_ID} .icon-toolbar {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-wrap: wrap;
      gap: 8px;
      padding: 2px 0 0;
      overflow: visible;
    }
    #${PANEL_ROOT_ID} .btn-icon {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      min-width: 40px;
      min-height: 40px;
      padding: 0;
      margin: 0;
      overflow: visible;
      border: 1px solid var(--betoman-glass-border);
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.35);
      background-image: none;
      color: var(--betoman-glass-text);
      cursor: pointer;
      appearance: none;
      -webkit-appearance: none;
      line-height: 1;
      text-transform: none;
      letter-spacing: normal;
      transition: background 0.15s, transform 0.15s, box-shadow 0.15s;
    }
    #${PANEL_ROOT_ID} .btn-icon:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.58);
    }
    #${PANEL_ROOT_ID} .btn-icon:active:not(:disabled) { transform: scale(0.94); }
    #${PANEL_ROOT_ID} .btn-icon:disabled {
      opacity: 0.38;
      cursor: not-allowed;
    }
    #${PANEL_ROOT_ID} .btn-icon.primary {
      background: linear-gradient(135deg, rgba(74,222,128,0.92), rgba(34,197,94,0.82));
      color: #041208;
      border-color: rgba(255,255,255,0.45);
      box-shadow: 0 4px 14px var(--betoman-accent-glow);
    }
    #${PANEL_ROOT_ID} .btn-icon.primary:hover:not(:disabled) {
      box-shadow: 0 6px 18px var(--betoman-accent-glow);
    }
    #${PANEL_ROOT_ID} .btn-icon.danger:hover:not(:disabled) {
      background: rgba(251, 113, 133, 0.18);
      border-color: rgba(251, 113, 133, 0.35);
      color: #be123c;
    }
    #${PANEL_ROOT_ID} .btn-icon svg {
      width: 18px !important;
      height: 18px !important;
      min-width: 18px !important;
      min-height: 18px !important;
      max-width: 18px !important;
      max-height: 18px !important;
      flex-shrink: 0;
      display: block !important;
      overflow: visible !important;
      pointer-events: none;
      fill: none !important;
      stroke: currentColor !important;
      stroke-width: 2px !important;
      stroke-linecap: round !important;
      stroke-linejoin: round !important;
      vector-effect: non-scaling-stroke;
    }
    #${PANEL_ROOT_ID} .btn-icon svg path,
    #${PANEL_ROOT_ID} .btn-icon svg circle,
    #${PANEL_ROOT_ID} .btn-icon svg line,
    #${PANEL_ROOT_ID} .btn-icon svg polyline {
      fill: none !important;
      stroke: currentColor !important;
      stroke-width: 2px !important;
      stroke-linecap: round !important;
      stroke-linejoin: round !important;
      vector-effect: non-scaling-stroke;
    }
    #${PANEL_ROOT_ID} .btn-icon[data-tooltip]::after {
      content: attr(data-tooltip);
      position: absolute;
      bottom: calc(100% + 2px);
      left: 50%;
      transform: translateX(-50%);
      padding: 6px 10px 12px;
      background: rgba(12, 18, 28, 0.88);
      color: #fff;
      font-family: "Peyda", Tahoma, sans-serif;
      font-size: 11px;
      font-weight: 500;
      line-height: 1.4;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.15s, visibility 0.15s;
      z-index: 2;
      filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15));
      clip-path: polygon(
        0 0,
        100% 0,
        100% calc(100% - 6px),
        calc(50% + 6px) calc(100% - 6px),
        50% 100%,
        calc(50% - 6px) calc(100% - 6px),
        0 calc(100% - 6px)
      );
    }
    #${PANEL_ROOT_ID} .btn-icon:hover::after,
    #${PANEL_ROOT_ID} .btn-icon:focus-visible::after {
      opacity: 1;
      visibility: visible;
    }
    #${PANEL_ROOT_ID} .error-banner {
      margin: 12px 0 0;
      padding: 10px 12px;
      border-radius: 11px;
      background: rgba(251, 113, 133, 0.15);
      border: 1px solid rgba(251, 113, 133, 0.3);
      color: #9f1239;
      font-size: 11px;
      line-height: 1.55;
    }
    #${PANEL_ROOT_ID} .error-banner.hidden { display: none; }
  `;
}

const ICON_PICK = `<svg class="betoman-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>`;

const ICON_REPICK = `<svg class="betoman-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15.5-6.36"/><path d="M3 3v5h5"/><circle cx="12" cy="12" r="2.5"/></svg>`;

const ICON_FORGET = `<svg class="betoman-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`;

const ICON_REFRESH = `<svg class="betoman-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15.6-6.36L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15.6 6.36L3 16"/></svg>`;

const ICON_SETTINGS = `<svg class="betoman-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;

/**
 * @param {object} handlers
 */
const LOGO_URL = chrome.runtime.getURL("icons/toman-logo.png");

export function createBetomanPanel(handlers) {
  let root = document.getElementById(PANEL_ROOT_ID);
  let els = {};

  function ensureDom() {
    if (root) return;

    root = document.createElement("div");
    root.id = PANEL_ROOT_ID;
    root.innerHTML = `
      <style>${panelStylesCss()}</style>
      <div class="betoman-panel" role="dialog" aria-label="به‌تومن">
        <div class="panel-header">
          <div class="brand">
            <img class="brand-icon" src="${LOGO_URL}" width="36" height="36" alt="" aria-hidden="true" />
            <div>
              <h1>${fa.appName}</h1>
              <p class="subtitle">${fa.appTagline}</p>
            </div>
          </div>
          <button type="button" class="btn-close" aria-label="بستن">×</button>
        </div>

        <div class="panel-block">
          <div class="site-card">
            <div class="site-card-top">
              <div class="site-info">
                <span class="site-title">${fa.thisSite}</span>
                <span id="betoman-status" class="site-status"></span>
              </div>
              <label class="switch">
                <input type="checkbox" id="betoman-toggle" />
                <span class="slider"></span>
              </label>
            </div>
            <div id="betoman-target-info" class="target-info hidden">
              <div class="target-row">
                <span class="target-label">${fa.targetCurrency}</span>
                <strong id="betoman-target-value" class="target-value">—</strong>
              </div>
              <div class="target-row">
                <span class="target-label">${fa.targetRate}</span>
                <strong id="betoman-target-rate" class="target-value">—</strong>
              </div>
            </div>
          </div>
        </div>

        <div class="panel-block">
          <div class="icon-toolbar">
            <button
              type="button"
              id="betoman-pick"
              class="btn-icon primary"
              data-tooltip="${fa.pickPrice}"
              aria-label="${fa.pickPrice}"
              disabled
            >${ICON_PICK}</button>
            <button
              type="button"
              id="betoman-repick"
              class="btn-icon"
              data-tooltip="${fa.repick}"
              aria-label="${fa.repick}"
              disabled
            >${ICON_REPICK}</button>
            <button
              type="button"
              id="betoman-forget"
              class="btn-icon danger"
              data-tooltip="${fa.forgetSite}"
              aria-label="${fa.forgetSite}"
              disabled
            >${ICON_FORGET}</button>
            <button
              type="button"
              id="betoman-refresh"
              class="btn-icon"
              data-tooltip="${fa.refreshRates}"
              aria-label="${fa.refreshRates}"
            >${ICON_REFRESH}</button>
            <button
              type="button"
              id="betoman-settings"
              class="btn-icon"
              data-tooltip="${fa.settings}"
              aria-label="${fa.settings}"
            >${ICON_SETTINGS}</button>
          </div>
        </div>

        <p id="betoman-error" class="error-banner hidden"></p>
      </div>
    `;

    document.documentElement.appendChild(root);

    els = {
      toggle: root.querySelector("#betoman-toggle"),
      status: root.querySelector("#betoman-status"),
      targetInfo: root.querySelector("#betoman-target-info"),
      targetValue: root.querySelector("#betoman-target-value"),
      targetRate: root.querySelector("#betoman-target-rate"),
      pick: root.querySelector("#betoman-pick"),
      repick: root.querySelector("#betoman-repick"),
      forget: root.querySelector("#betoman-forget"),
      refresh: root.querySelector("#betoman-refresh"),
      error: root.querySelector("#betoman-error"),
      close: root.querySelector(".btn-close"),
      settings: root.querySelector("#betoman-settings"),
    };

    root.addEventListener("click", (e) => e.stopPropagation());

    els.close.addEventListener("click", () => hide());
    els.settings.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: MSG.OPEN_OPTIONS });
    });

    els.toggle.addEventListener("change", async () => {
      const on = els.toggle.checked;
      try {
        await handlers.setActive(on);
        await refresh();
      } catch (err) {
        els.toggle.checked = !on;
        showError(String(err));
      }
    });

    const startPickFromPanel = () => {
      hide();
      handlers.startPick();
    };

    els.pick.addEventListener("click", startPickFromPanel);
    els.repick.addEventListener("click", startPickFromPanel);

    els.forget.addEventListener("click", async () => {
      await handlers.forgetSite();
      await refresh();
    });

    els.refresh.addEventListener("click", async () => {
      els.refresh.disabled = true;
      const res = await chrome.runtime.sendMessage({ type: MSG.REFRESH_RATES });
      els.refresh.disabled = false;
      if (!res?.ok) {
        showError(res?.error || fa.errors.refreshFailed);
        return;
      }
      await refresh();
    });
  }

  function showError(msg) {
    if (!msg) {
      els.error?.classList.add("hidden");
      if (els.error) els.error.textContent = "";
      return;
    }
    els.error.textContent = msg;
    els.error.classList.remove("hidden");
  }

  async function loadRates() {
    const res = await chrome.runtime.sendMessage({ type: MSG.GET_RATES });
    if (!res?.ok) return res;

    if (res.error || res.warning) showError(res.warning || res.error);
    else showError(null);
    return res;
  }

  async function refresh() {
    ensureDom();
    const state = handlers.getState();

    els.toggle.checked = state.active;
    els.pick.disabled = !state.active;
    els.repick.disabled = !state.active;
    els.forget.disabled = !state.origin;

    els.status.classList.toggle("on", state.active);

    if (state.origin) {
      const host = new URL(state.origin).hostname;
      if (state.hasPattern) {
        els.status.textContent = fa.patternSaved(host);
      } else if (state.active) {
        els.status.textContent = fa.onPickHint;
      } else {
        els.status.textContent = fa.off;
      }
    } else {
      els.status.textContent = fa.openShopPage;
    }

    const ratesRes = await chrome.runtime.sendMessage({ type: MSG.GET_RATES });

    if (state.active) {
      els.targetInfo.classList.remove("hidden");
      const label = ratesRes?.label || fa.toman;
      if (state.conversionCurrency) {
        const name = getCurrencyDisplayName(
          state.conversionCurrency,
          ratesRes?.currencyNames || {},
        );
        els.targetValue.textContent = `${name} (${state.conversionCurrency})`;
        const rate = ratesRes?.rates?.[state.conversionCurrency];
        els.targetRate.textContent = rate
          ? `${formatRate(rate)} ${label}`
          : fa.rateNotSet;
      } else {
        els.targetValue.textContent = fa.targetCurrencyPending;
        els.targetRate.textContent = "—";
      }
    } else {
      els.targetInfo.classList.add("hidden");
    }

    if (ratesRes?.ok) {
      if (ratesRes.error || ratesRes.warning) showError(ratesRes.warning || ratesRes.error);
      else showError(null);
    }
  }

  function show() {
    ensureDom();
    root.classList.add("open");
    refresh();
  }

  function hide() {
    root?.classList.remove("open");
  }

  function toggle() {
    ensureDom();
    if (root.classList.contains("open")) hide();
    else show();
  }

  function isOpen() {
    return root?.classList.contains("open") ?? false;
  }

  function destroy() {
    root?.remove();
    root = null;
    els = {};
  }

  return { show, hide, toggle, refresh, isOpen, destroy };
}
