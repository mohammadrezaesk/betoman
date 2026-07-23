/** English digits + comma grouping — for converted prices on shopping pages. */
export function formatNumberEn(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/** Persian digits + grouping — for Betoman panel / extension UI. */
export function formatNumberFa(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "۰";
  return n.toLocaleString("fa-IR", { maximumFractionDigits: 0 });
}

/** @deprecated use formatNumberFa in UI, formatNumberEn on pages */
export const formatNumber = formatNumberFa;

export function toPersianDigits(value) {
  return String(value).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

/**
 * Converted price text injected into shopping pages (English digits).
 * @param {number} amount
 * @param {string} [label]
 */
export function formatToman(amount, label = "تومان") {
  return `${formatNumberEn(Math.round(amount))} ${label}`;
}

/** Rate display in panel UI (Persian digits). */
export function formatRate(rate) {
  return formatNumberFa(rate);
}

/** Relative time in panel UI (Persian digits in numbers). */
export function formatRelativeTime(timestamp) {
  if (!timestamp) return "هرگز";
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "همین الان";
  if (mins < 60) return `${formatNumberFa(mins)} دقیقه پیش`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${formatNumberFa(hours)} ساعت پیش`;
  return `${formatNumberFa(Math.floor(hours / 24))} روز پیش`;
}

/** Absolute date/time for history lists (Persian locale). */
export function formatDateTimeFa(timestamp) {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleString("fa-IR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
