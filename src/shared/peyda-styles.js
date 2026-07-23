const STYLE_ID = "betoman-peyda-styles";

export function fontFacesCss() {
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

export function convertedPriceCss() {
  return `
    ${fontFacesCss()}
    [data-betoman] {
      font-family: "Peyda", Tahoma, sans-serif !important;
      font-variant-numeric: tabular-nums;
    }
  `;
}

/** Inject Peyda @font-face + styles for converted prices on the host page. */
export function ensurePeydaStyles(doc = document) {
  if (doc.getElementById(STYLE_ID)) return;

  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = convertedPriceCss();
  (doc.head || doc.documentElement).appendChild(style);
}
