import { MSG } from "../shared/constants.js";
import {
  BUILTIN_CURRENCY_CODES,
  BUILTIN_CURRENCY_NAMES,
  DEFAULT_MANUAL_RATES,
  getCurrencyDisplayName,
  isBuiltinCurrency,
} from "../shared/currencies.js";
import {
  formatDateTimeFa,
  formatNumberFa,
} from "../shared/format.js";
import { getPrefs, setPrefs, parseManualRateInput } from "../shared/storage.js";
import { fa, formatRelativeTimeFa } from "../shared/i18n/fa.js";

const useNavasan = document.getElementById("useNavasan");
const navasanApiKey = document.getElementById("navasanApiKey");
const navasanFields = document.getElementById("navasanFields");
const manualRatesEl = document.getElementById("manualRates");
const btnAddCurrency = document.getElementById("btnAddCurrency");
const btnSave = document.getElementById("btnSave");
const btnTestNavasan = document.getElementById("btnTestNavasan");
const saveStatus = document.getElementById("saveStatus");
const navasanTestResult = document.getElementById("navasanTestResult");
const labelInput = document.getElementById("label");

const ratesTabs = document.querySelectorAll(".rates-tab");
const tabManual = document.getElementById("tabManual");
const tabNavasan = document.getElementById("tabNavasan");
const navasanLastFetch = document.getElementById("navasanLastFetch");
const navasanHistoryStatus = document.getElementById("navasanHistoryStatus");
const navasanHistoryEl = document.getElementById("navasanHistory");
const btnRefreshNavasan = document.getElementById("btnRefreshNavasan");

let activeRatesTab = "manual";
let currencyNamesCache = {};

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function createBuiltinRateRow(code, value = "") {
  const row = document.createElement("div");
  row.className = "rate-item builtin";
  row.dataset.builtin = "1";
  row.dataset.code = code;
  const nameFa = BUILTIN_CURRENCY_NAMES[code] || code;
  row.innerHTML = `
    <input type="text" class="currency-code" value="${escapeAttr(code)}" maxlength="6" dir="ltr" readonly disabled />
    <input type="text" class="currency-name" value="${escapeAttr(nameFa)}" readonly disabled />
    <input type="text" class="currency-value" placeholder="85000" value="${value ? String(value) : ""}" dir="ltr" inputmode="numeric" />
    <span class="rate-item-spacer" aria-hidden="true"></span>
  `;
  return row;
}

function createCustomRateRow(code = "", nameFa = "", value = "") {
  const row = document.createElement("div");
  row.className = "rate-item custom";
  row.innerHTML = `
    <input type="text" class="currency-code" placeholder="CAD" value="${escapeAttr(code)}" maxlength="6" dir="ltr" />
    <input type="text" class="currency-name" placeholder="${escapeAttr(fa.options.currencyNameFa)}" value="${escapeAttr(nameFa)}" />
    <input type="text" class="currency-value" placeholder="85000" value="${value ? String(value) : ""}" dir="ltr" inputmode="numeric" />
    <button type="button" class="btn btn-danger btn-remove remove" title="${fa.options.remove}" aria-label="${fa.options.remove}">✕</button>
  `;
  row.querySelector(".remove").addEventListener("click", () => row.remove());
  return row;
}

function renderManualRates(manualRates, customNames) {
  manualRatesEl.innerHTML = "";

  for (const code of BUILTIN_CURRENCY_CODES) {
    const val = manualRates[code] ?? DEFAULT_MANUAL_RATES[code] ?? "";
    manualRatesEl.appendChild(createBuiltinRateRow(code, val));
  }

  const customCodes = new Set([
    ...Object.keys(manualRates),
    ...Object.keys(customNames),
  ]);

  for (const code of [...customCodes].sort()) {
    if (isBuiltinCurrency(code)) continue;
    manualRatesEl.appendChild(
      createCustomRateRow(code, customNames[code] || "", manualRates[code] ?? ""),
    );
  }
}

function collectCurrencyConfig() {
  const manualRates = {};
  const currencyNames = {};

  for (const row of manualRatesEl.querySelectorAll(".rate-item")) {
    const builtin = row.dataset.builtin === "1";
    const code = row.querySelector(".currency-code").value.trim().toUpperCase();
    const raw = row.querySelector(".currency-value").value;
    const nameFa = row.querySelector(".currency-name").value.trim();

    if (!code) continue;

    if (!builtin && isBuiltinCurrency(code)) {
      continue;
    }

    const val = parseManualRateInput(raw);
    if (val != null) manualRates[code] = val;

    if (!builtin && nameFa) {
      currencyNames[code] = nameFa;
    }
  }

  for (const code of BUILTIN_CURRENCY_CODES) {
    if (manualRates[code] == null && DEFAULT_MANUAL_RATES[code] != null) {
      manualRates[code] = DEFAULT_MANUAL_RATES[code];
    }
  }

  return { manualRates, currencyNames };
}

function sortHistoryRateCodes(rates) {
  const codes = Object.keys(rates);
  const builtin = BUILTIN_CURRENCY_CODES.filter((code) => codes.includes(code));
  const rest = codes.filter((code) => !BUILTIN_CURRENCY_CODES.includes(code)).sort();
  return [...builtin, ...rest];
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getHistoryCurrencyName(code) {
  return getCurrencyDisplayName(code, {
    ...fa.picker.currencyNames,
    ...currencyNamesCache,
  });
}

function setRatesTab(tab) {
  activeRatesTab = tab;
  for (const button of ratesTabs) {
    const isActive = button.dataset.tab === tab;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  }

  const showManual = tab === "manual";
  tabManual.classList.toggle("hidden", !showManual);
  tabNavasan.classList.toggle("hidden", showManual);
  tabNavasan.hidden = showManual;

  if (tab === "navasan") {
    loadNavasanLatest();
  }
}

function renderNavasanLatest(rates, fetchedAt, latestError) {
  if (fetchedAt) {
    const absolute = formatDateTimeFa(fetchedAt);
    const relative = formatRelativeTimeFa(fetchedAt);
    navasanLastFetch.textContent = fa.options.lastFetch(`${absolute} (${relative})`);
  } else {
    navasanLastFetch.textContent = fa.options.lastFetchNever;
  }

  if (latestError) {
    navasanHistoryStatus.textContent = latestError;
    navasanHistoryStatus.className = "hint err";
  } else {
    navasanHistoryStatus.textContent = "";
    navasanHistoryStatus.className = "hint";
  }

  if (!rates || !Object.keys(rates).length) {
    navasanHistoryEl.innerHTML = `<p class="history-empty">${escapeHtml(fa.options.navasanLatestEmpty)}</p>`;
    return;
  }

  const codes = sortHistoryRateCodes(rates);
  const ratesHtml = codes
    .map((code) => {
      const value = rates[code];
      const nameFa = getHistoryCurrencyName(code);
      return `<div class="history-rate">
        <span class="history-rate-name">${escapeHtml(nameFa)}</span>
        <span class="history-rate-code">${escapeHtml(code)}</span>
        <span class="history-rate-value">${escapeHtml(formatNumberFa(value))}</span>
      </div>`;
    })
    .join("");

  navasanHistoryEl.innerHTML = `
    <div class="navasan-latest-meta">
      <span class="history-entry-count">${escapeHtml(fa.options.historyCurrencies(codes.length))}</span>
    </div>
    <div class="history-rates">${ratesHtml}</div>
  `;
}

async function loadNavasanLatest() {
  const prefs = await getPrefs();
  currencyNamesCache = prefs.currencyNames || {};
  const res = await chrome.runtime.sendMessage({ type: MSG.GET_NAVASAN_HISTORY });
  if (!res?.ok) return;
  renderNavasanLatest(res.rates, res.fetchedAt, res.error);
}

async function refreshNavasanRates() {
  if (!useNavasan.checked) {
    navasanHistoryStatus.textContent = fa.rates.navasanUnavailable;
    navasanHistoryStatus.className = "hint err";
    return;
  }

  if (!navasanApiKey.value.trim()) {
    navasanHistoryStatus.textContent = fa.options.testFail;
    navasanHistoryStatus.className = "hint err";
    return;
  }

  btnRefreshNavasan.disabled = true;
  navasanHistoryStatus.textContent = fa.options.refreshingNavasan;
  navasanHistoryStatus.className = "hint";

  await setPrefs({
    useNavasan: true,
    navasanApiKey: navasanApiKey.value.trim(),
  });

  const res = await chrome.runtime.sendMessage({ type: MSG.REFRESH_RATES });
  btnRefreshNavasan.disabled = false;

  if (!res?.ok) {
    navasanHistoryStatus.textContent = res?.error || fa.errors.refreshFailed;
    navasanHistoryStatus.className = "hint err";
    await loadNavasanLatest();
    return;
  }

  await loadNavasanLatest();
}

async function load() {
  const prefs = await getPrefs();
  useNavasan.checked = prefs.useNavasan;
  navasanApiKey.value = prefs.navasanApiKey || "";
  labelInput.value = prefs.label || fa.toman;
  renderManualRates(prefs.manualRates || {}, prefs.currencyNames || {});
  syncNavasanFields();
  if (activeRatesTab === "navasan") {
    await loadNavasanLatest();
  }
}

function syncNavasanFields() {
  const on = useNavasan.checked;
  navasanApiKey.disabled = !on;
  btnTestNavasan.disabled = !on;
  navasanFields.classList.toggle("disabled", !on);
}

useNavasan.addEventListener("change", syncNavasanFields);

for (const button of ratesTabs) {
  button.addEventListener("click", () => setRatesTab(button.dataset.tab));
}

btnRefreshNavasan.addEventListener("click", refreshNavasanRates);

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === MSG.RATES_UPDATED && activeRatesTab === "navasan") {
    loadNavasanLatest();
  }
});

btnAddCurrency.addEventListener("click", () => {
  manualRatesEl.appendChild(createCustomRateRow());
});

btnSave.addEventListener("click", async () => {
  const { manualRates, currencyNames } = collectCurrencyConfig();
  if (!Object.keys(manualRates).length) {
    saveStatus.textContent = fa.options.needRate;
    saveStatus.className = "hint err";
    return;
  }

  await setPrefs({
    useNavasan: useNavasan.checked,
    navasanApiKey: navasanApiKey.value.trim(),
    manualRates,
    currencyNames,
    label: labelInput.value.trim() || fa.toman,
  });

  saveStatus.textContent = fa.options.saved;
  saveStatus.className = "hint ok";
  setTimeout(() => {
    saveStatus.textContent = "";
  }, 2000);
});

btnTestNavasan.addEventListener("click", async () => {
  navasanTestResult.textContent = fa.options.testing;
  navasanTestResult.className = "hint";

  await setPrefs({
    navasanApiKey: navasanApiKey.value.trim(),
  });

  const res = await chrome.runtime.sendMessage({ type: MSG.TEST_NAVASAN });
  if (res?.ok) {
    navasanTestResult.textContent = fa.options.testOk(res.count, res.rates?.USD);
    navasanTestResult.className = "hint ok";
    if (activeRatesTab === "navasan") {
      await loadNavasanLatest();
    }
  } else {
    navasanTestResult.textContent = res?.error || fa.options.testFail;
    navasanTestResult.className = "hint err";
  }
});

load();
