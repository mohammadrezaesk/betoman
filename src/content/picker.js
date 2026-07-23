import { learnPatternFromElement, updatePatternCurrency } from "./pattern.js";
import { countMatchCandidates } from "./converter.js";
import { MSG } from "../shared/constants.js";
import { getCurrencyDisplayName } from "../shared/currencies.js";
import { resolvePriceTargetAtPoint } from "../shared/text-node.js";
import { fa } from "../shared/i18n/fa.js";

const OVERLAY_ID = "betoman-picker-overlay";
const CONFIRM_ID = "betoman-confirm-dialog";

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

/** Frosted glass over the live page — low tint, high blur, site stays visible. */
const siteGlassCss = `
  --betoman-glass-bg: rgba(255, 255, 255, 0.42);
  --betoman-glass-border: rgba(255, 255, 255, 0.55);
  --betoman-glass-text: rgba(12, 18, 28, 0.92);
  --betoman-glass-muted: rgba(12, 18, 28, 0.62);
  --betoman-accent: #16a34a;
`;

const siteBackdropCss = `
  background: rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
`;

/** Picker stays click-through visually — no blur so prices remain readable. */
const pickerOverlayCss = `
  background: transparent;
`;

const sitePanelCss = `
  ${siteGlassCss}
  background: var(--betoman-glass-bg);
  backdrop-filter: blur(32px) saturate(180%);
  -webkit-backdrop-filter: blur(32px) saturate(180%);
  border: 1px solid var(--betoman-glass-border);
  box-shadow:
    0 8px 40px rgba(0, 0, 0, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.65);
  color: var(--betoman-glass-text);
`;

/**
 * @param {() => void} onCancel
 */
export function startPicker(onPick, onCancel) {
  stopPicker();

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.innerHTML = `
    <style>
      ${fontFacesCss()}
      #${OVERLAY_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        cursor: crosshair;
        pointer-events: auto;
        font-family: "Peyda", Tahoma, sans-serif;
        direction: rtl;
        ${pickerOverlayCss}
      }
      #${OVERLAY_ID} .betoman-tip {
        position: fixed;
        top: 16px;
        left: 50%;
        transform: translateX(-50%);
        ${sitePanelCss}
        padding: 12px 22px;
        border-radius: 16px;
        font-size: 14px;
        font-weight: 500;
        pointer-events: none;
        white-space: nowrap;
        z-index: 1;
      }
      .betoman-pick-highlight {
        outline: 2px solid var(--betoman-accent, #16a34a) !important;
        outline-offset: 3px !important;
        background-color: rgba(22, 163, 74, 0.14) !important;
        border-radius: 4px;
      }
    </style>
    <div class="betoman-tip">${fa.picker.tip}</div>
  `;

  document.documentElement.appendChild(overlay);

  let highlighted = null;

  function clearHighlight() {
    if (highlighted) {
      highlighted.classList.remove("betoman-pick-highlight");
      highlighted = null;
    }
  }

  function pickTargetAt(e) {
    overlay.style.pointerEvents = "none";
    const target = resolvePriceTargetAtPoint(e.clientX, e.clientY);
    overlay.style.pointerEvents = "auto";
    return target;
  }

  function onMouseMove(e) {
    const target = pickTargetAt(e);

    if (!target || target.closest(`#${OVERLAY_ID}, #${CONFIRM_ID}, #betoman-panel-root`)) {
      clearHighlight();
      return;
    }

    if (target !== highlighted) {
      clearHighlight();
      highlighted = target;
      highlighted.classList.add("betoman-pick-highlight");
    }
  }

  function onClick(e) {
    e.preventDefault();
    e.stopPropagation();

    const target = pickTargetAt(e);

    if (!target || target.closest(`#${OVERLAY_ID}`)) return;

    cleanup();
    onPick(target);
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      cleanup();
      onCancel();
    }
  }

  function cleanup() {
    clearHighlight();
    overlay.removeEventListener("mousemove", onMouseMove);
    overlay.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    overlay.remove();
  }

  overlay.addEventListener("mousemove", onMouseMove);
  overlay.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);

  return cleanup;
}

export function stopPicker() {
  document.getElementById(OVERLAY_ID)?.remove();
  document.querySelectorAll(".betoman-pick-highlight").forEach((el) => {
    el.classList.remove("betoman-pick-highlight");
  });
}

/**
 * @param {object} opts
 * @param {Element} opts.pickedEl
 * @param {object} opts.pattern
 * @param {boolean} [opts.warnFew]
 * @returns {Promise<object|null>}
 */
export function showConfirmDialog({ pickedEl, pattern, warnFew = false }) {
  return new Promise((resolve) => {
    (async () => {
    const existing = document.getElementById(CONFIRM_ID);
    existing?.remove();

    let currentPattern = pattern;

    const ratesRes = await chrome.runtime.sendMessage({ type: MSG.GET_RATES });
    const configuredCodes = ratesRes?.ok
      ? Object.keys(ratesRes.rates).sort()
      : [];
    const customNames = ratesRes?.currencyNames || {};

    function currencyOptionsHtml(selected) {
      const codes = [...configuredCodes];
      if (selected && !codes.includes(selected)) {
        codes.unshift(selected);
      }
      if (!codes.length && selected) {
        codes.push(selected);
      }

      return codes
        .map((code) => {
          const name = getCurrencyDisplayName(code, customNames);
          const sel = code === selected ? " selected" : "";
          return `<option value="${code}"${sel}>${name} (${code})</option>`;
        })
        .join("");
    }

    function updateCountText() {
      const count = countMatchCandidates(currentPattern);
      countEl.textContent = fa.picker.confirmBody(count);
      applyBtn.disabled = count === 0;
      return count;
    }

    const dialog = document.createElement("div");
    dialog.id = CONFIRM_ID;
    dialog.innerHTML = `
      <style>
        ${fontFacesCss()}
        #${CONFIRM_ID} {
          position: fixed;
          inset: 0;
          z-index: 2147483647;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: "Peyda", Tahoma, sans-serif;
          direction: rtl;
        }
        #${CONFIRM_ID} .betoman-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(12, 18, 28, 0.28);
          backdrop-filter: blur(6px) saturate(120%);
          -webkit-backdrop-filter: blur(6px) saturate(120%);
        }
        #${CONFIRM_ID} .box {
          position: relative;
          z-index: 1;
          ${siteGlassCss}
          background: rgba(255, 255, 255, 0.92);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          border: 1px solid rgba(255, 255, 255, 0.75);
          box-shadow:
            0 16px 48px rgba(0, 0, 0, 0.14),
            inset 0 1px 0 rgba(255, 255, 255, 0.9);
          color: var(--betoman-glass-text);
          border-radius: 20px;
          padding: 0;
          max-width: 380px;
          width: calc(100% - 32px);
          overflow: hidden;
        }
        #${CONFIRM_ID} .dialog-header {
          padding: 22px 22px 16px;
          border-bottom: 1px solid rgba(12, 18, 28, 0.08);
        }
        #${CONFIRM_ID} h3 {
          margin: 0 0 8px;
          font-size: 18px;
          font-weight: 700;
          color: var(--betoman-glass-text);
        }
        #${CONFIRM_ID} .confirm-text {
          margin: 0;
          color: var(--betoman-glass-muted);
          font-size: 14px;
          line-height: 1.6;
        }
        #${CONFIRM_ID} .dialog-body {
          padding: 18px 22px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        #${CONFIRM_ID} .currency-field {
          margin: 0;
        }
        #${CONFIRM_ID} .currency-field label {
          display: block;
          margin-bottom: 6px;
          font-size: 13px;
          font-weight: 600;
          color: var(--betoman-glass-text);
        }
        #${CONFIRM_ID} .select-wrap {
          position: relative;
        }
        #${CONFIRM_ID} .select-wrap::after {
          content: "";
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          width: 0;
          height: 0;
          border-left: 5px solid transparent;
          border-right: 5px solid transparent;
          border-top: 6px solid rgba(12, 18, 28, 0.45);
          pointer-events: none;
        }
        #${CONFIRM_ID} .currency-field select {
          width: 100%;
          min-height: 44px;
          padding: 10px 14px 10px 36px;
          border-radius: 12px;
          border: 1px solid rgba(12, 18, 28, 0.18);
          background: rgba(255, 255, 255, 0.95);
          color: var(--betoman-glass-text);
          font-family: "Peyda", Tahoma, sans-serif;
          font-size: 14px;
          font-weight: 500;
          outline: none;
          cursor: pointer;
          appearance: none;
          -webkit-appearance: none;
          box-shadow: inset 0 1px 2px rgba(12, 18, 28, 0.04);
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        #${CONFIRM_ID} .currency-field select:hover {
          border-color: rgba(12, 18, 28, 0.28);
        }
        #${CONFIRM_ID} .currency-field select:focus {
          border-color: rgba(22, 163, 74, 0.65);
          box-shadow:
            inset 0 1px 2px rgba(12, 18, 28, 0.04),
            0 0 0 3px rgba(22, 163, 74, 0.16);
        }
        #${CONFIRM_ID} .currency-hint {
          margin: 6px 0 0;
          font-size: 12px;
          color: var(--betoman-glass-muted);
          line-height: 1.55;
        }
        #${CONFIRM_ID} .dialog-notice {
          margin: 0;
          padding: 10px 12px;
          border-radius: 10px;
          background: rgba(22, 163, 74, 0.08);
          border: 1px solid rgba(22, 163, 74, 0.16);
          font-size: 12px;
          color: rgba(12, 18, 28, 0.72);
          line-height: 1.55;
        }
        #${CONFIRM_ID} .actions {
          display: flex;
          gap: 10px;
          justify-content: stretch;
          padding: 14px 22px 20px;
          border-top: 1px solid rgba(12, 18, 28, 0.08);
          background: rgba(255, 255, 255, 0.5);
        }
        #${CONFIRM_ID} button {
          flex: 1;
          border: 1px solid transparent;
          border-radius: 12px;
          padding: 11px 16px;
          font-family: inherit;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.15s, box-shadow 0.15s;
        }
        #${CONFIRM_ID} button:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        #${CONFIRM_ID} button:active:not(:disabled) { transform: scale(0.98); }
        #${CONFIRM_ID} .cancel {
          background: rgba(255, 255, 255, 0.9);
          color: var(--betoman-glass-text);
          border-color: rgba(12, 18, 28, 0.14);
        }
        #${CONFIRM_ID} .cancel:hover:not(:disabled) {
          border-color: rgba(12, 18, 28, 0.24);
        }
        #${CONFIRM_ID} .apply {
          background: linear-gradient(135deg, rgba(74, 222, 128, 0.92), rgba(34, 197, 94, 0.82));
          color: #041208;
          border-color: rgba(255, 255, 255, 0.45);
          box-shadow: 0 4px 16px rgba(74, 222, 128, 0.28);
        }
        #${CONFIRM_ID} .apply:hover:not(:disabled) {
          box-shadow: 0 6px 20px rgba(74, 222, 128, 0.34);
        }
      </style>
      <div class="betoman-backdrop" aria-hidden="true"></div>
      <div class="box">
        <div class="dialog-header">
          <h3>${fa.picker.confirmTitle}</h3>
          <p class="confirm-text"></p>
        </div>
        <div class="dialog-body">
          <div class="currency-field">
            <label for="betoman-confirm-currency">${fa.picker.currencyLabel}</label>
            <div class="select-wrap">
              <select id="betoman-confirm-currency" dir="rtl">
                ${currencyOptionsHtml(pattern.currency)}
              </select>
            </div>
            <p class="currency-hint">${fa.picker.currencyHint}</p>
          </div>
          ${warnFew ? `<p class="dialog-notice">${fa.picker.confirmFewTip}</p>` : ""}
        </div>
        <div class="actions">
          <button type="button" class="apply">${fa.picker.apply}</button>
          <button type="button" class="cancel">${fa.picker.cancel}</button>
        </div>
      </div>
    `;

    const countEl = dialog.querySelector(".confirm-text");
    const currencySelect = dialog.querySelector("#betoman-confirm-currency");
    const applyBtn = dialog.querySelector(".apply");

    updateCountText();

    currencySelect.addEventListener("change", () => {
      currentPattern = updatePatternCurrency(currentPattern, currencySelect.value);
    });

    dialog.querySelector(".cancel").addEventListener("click", () => {
      dialog.remove();
      resolve(null);
    });
    applyBtn.addEventListener("click", () => {
      if (applyBtn.disabled) return;
      dialog.remove();
      resolve(currentPattern);
    });

    document.documentElement.appendChild(dialog);
    })();
  });
}

export { learnPatternFromElement, updatePatternCurrency, countMatchCandidates };
