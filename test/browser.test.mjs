/**
 * DOM-level checks for detection, conversion and undo, run in real Chromium.
 * Loads the extension's modules into test pages with a tiny `chrome` shim.
 *
 *   npm run test:browser      (needs the `playwright` package + Chromium)
 */
import assert from "node:assert/strict";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require("playwright");
} catch {
  playwright = require(path.join(process.execPath, "../../lib/node_modules/playwright"));
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css" };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/page") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<!doctype html><html><head></head><body></body></html>");
    return;
  }
  try {
    const file = path.join(ROOT, decodeURIComponent(url.pathname));
    if (!file.startsWith(ROOT)) throw new Error("outside root");
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await playwright.chromium.launch();
const RATES = { USD: 100000, EUR: 110000, CAD: 70000 };

/** Fresh page with `html` in <body> and the modules on window.B. */
async function setup(html, head = "") {
  const page = await browser.newPage();
  page.on("pageerror", (err) => console.error("pageerror:", err));
  await page.goto(`${base}/page`);
  await page.evaluate(
    async ({ html, head }) => {
      globalThis.chrome = { runtime: { getURL: (p) => `/${p}` } };
      document.head.insertAdjacentHTML("beforeend", head);
      document.body.innerHTML = html;
      const [converter, pattern, textNode, observer] = await Promise.all([
        import("/src/content/converter.js"),
        import("/src/content/pattern.js"),
        import("/src/shared/text-node.js"),
        import("/src/content/observer.js"),
      ]);
      window.B = { ...converter, ...pattern, ...textNode, ...observer };
    },
    { html, head },
  );
  return page;
}

/** Learn a pattern from `pickSelector`, convert the page, return state. */
async function pickAndConvert(page, pickSelector, fallbackCurrency = null) {
  return page.evaluate(
    ({ pickSelector, fallbackCurrency, RATES }) => {
      const picked = document.querySelector(pickSelector);
      const pattern = B.learnPatternFromElement(picked, fallbackCurrency);
      if (!pattern) return { pattern: null };
      window.pattern = pattern;
      const count = B.convertAll(pattern, RATES, "تومان");
      return { pattern, count };
    },
    { pickSelector, fallbackCurrency, RATES },
  );
}

const text = (page, sel) =>
  page.$$eval(sel, (els) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));

let passed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}\n`, err);
    process.exitCode = 1;
  }
}

await check("simple leaf prices convert and undo exactly", async () => {
  const html = `<div class="grid">
    <div class="card"><div class="product-price">$29.99</div></div>
    <div class="card"><div class="product-price">$2,000</div></div>
    <div class="card"><div class="product-price">US$ 1,299.99</div></div>
  </div>`;
  const page = await setup(html);
  const before = await page.evaluate(() => document.body.innerHTML);
  const { pattern, count } = await pickAndConvert(page, ".product-price");
  assert.equal(pattern.selector.includes("product-price"), true, pattern.selector);
  assert.equal(count, 3);
  assert.deepEqual(await text(page, ".product-price"), [
    "2,999,000 تومان",
    "200,000,000 تومان",
    "129,999,000 تومان",
  ]);
  await page.evaluate(() => B.restoreAll());
  assert.equal(await page.evaluate(() => document.body.innerHTML), before);
  await page.close();
});

await check("Amazon-style split price with off-screen copy", async () => {
  const card = (whole, frac) => `<div class="s-card"><span class="a-price">
      <span class="a-offscreen" style="position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden">$${whole}.${frac}</span>
      <span aria-hidden="true"><span class="a-price-symbol">$</span><span class="a-price-whole">${whole}<span class="a-price-decimal">.</span></span><span class="a-price-fraction">${frac}</span></span>
    </span></div>`;
  const page = await setup(card(29, 99) + card(149, "00"));
  const before = await page.evaluate(() => document.body.innerHTML);
  const { pattern, count } = await pickAndConvert(page, ".a-price-whole");
  assert.ok(pattern, "pattern learned");
  assert.equal(count, 2);
  const visible = await page.$$eval(".a-price > [aria-hidden]", (els) =>
    els.map((e) => e.textContent.trim()),
  );
  assert.deepEqual(visible, ["2,999,000 تومان", "14,900,000 تومان"]);
  // Screen-reader copy follows the visible price.
  assert.deepEqual(await text(page, ".a-offscreen"), ["2,999,000 تومان", "14,900,000 تومان"]);
  const nodeKept = await page.evaluate(() => {
    window.whole = document.querySelector(".a-price-whole");
    B.restoreAll();
    return window.whole.isConnected;
  });
  assert.equal(nodeKept, true, "undo must not recreate DOM nodes");
  assert.equal(await page.evaluate(() => document.body.innerHTML), before);
  await page.close();
});

await check("superscript cents read as decimals", async () => {
  const page = await setup(
    `<p><span class="amount">$29<sup>99</sup></span></p><p><span class="amount">$1,299<sup>50</sup></span></p>`,
  );
  const { count } = await pickAndConvert(page, ".amount");
  assert.equal(count, 2);
  assert.deepEqual(await text(page, ".amount"), ["2,999,000 تومان", "129,950,000 تومان"]);
  await page.close();
});

await check("words around the price survive", async () => {
  const page = await setup(`<span class="plan-cost">From $29.99 / mo</span><span class="plan-cost">From $9 / mo</span>`);
  await pickAndConvert(page, ".plan-cost");
  assert.deepEqual(await text(page, ".plan-cost"), [
    "From 2,999,000 تومان / mo",
    "From 900,000 تومان / mo",
  ]);
  await page.close();
});

await check("site updates a converted price (React text node) → re-sync, undo keeps new value", async () => {
  const page = await setup(`<div class="variant-price"></div><div class="variant-price">$5.00</div>`);
  await page.evaluate(() => {
    // React renders `$<!-- -->{price}` as two text nodes.
    const el = document.querySelector(".variant-price");
    el.append("$", document.createComment(""), "29.99");
    window.priceNode = el.childNodes[2];
  });
  await pickAndConvert(page, ".variant-price");
  assert.deepEqual(await text(page, ".variant-price"), ["2,999,000 تومان", "500,000 تومان"]);

  await page.evaluate(() => {
    window.priceNode.nodeValue = "31.99"; // user picked another variant
    B.convertAll(window.pattern, { USD: 100000 }, "تومان", [window.priceNode.parentElement]);
  });
  assert.deepEqual(await text(page, ".variant-price"), ["3,199,000 تومان", "500,000 تومان"]);

  await page.evaluate(() => B.restoreAll());
  assert.deepEqual(await text(page, ".variant-price"), ["$31.99", "$5.00"]);
  await page.close();
});

await check("site replaces price with non-price text → we step aside", async () => {
  const page = await setup(`<b class="price">$10</b><b class="price">$20</b>`);
  await pickAndConvert(page, ".price");
  await page.evaluate(() => {
    const el = document.querySelector(".price");
    el.firstChild.nodeValue = "Sold out";
    B.convertAll(window.pattern, { USD: 100000 }, "تومان", [el]);
  });
  assert.deepEqual(await text(page, ".price"), ["Sold out", "2,000,000 تومان"]);
  assert.equal(await page.$eval(".price", (e) => e.hasAttribute("data-betoman")), false);
  await page.close();
});

await check("prices inside open shadow roots", async () => {
  const page = await setup(`<div class="price-tag">$10</div><product-card></product-card><product-card></product-card>`);
  await page.evaluate(() => {
    customElements.define(
      "product-card",
      class extends HTMLElement {
        constructor() {
          super();
          this.attachShadow({ mode: "open" }).innerHTML = `<div class="price-tag">$15</div>`;
        }
      },
    );
  });
  const { count } = await pickAndConvert(page, ".price-tag");
  assert.equal(count, 3);
  const shadowTexts = await page.$$eval("product-card", (els) =>
    els.map((e) => e.shadowRoot.querySelector(".price-tag").textContent),
  );
  assert.deepEqual(shadowTexts, ["1,500,000 تومان", "1,500,000 تومان"]);
  await page.evaluate(() => B.restoreAll());
  const restored = await page.$$eval("product-card", (els) =>
    els.map((e) => e.shadowRoot.querySelector(".price-tag").textContent),
  );
  assert.deepEqual(restored, ["$15", "$15"]);
  await page.close();
});

await check("symbol drawn by CSS + page currency metadata", async () => {
  const page = await setup(
    `<span class="amt">29.99</span><span class="amt">5</span><span class="rating">4.5 stars</span>`,
    `<meta property="product:price:currency" content="EUR"><style>.amt::before{content:"€"}</style>`,
  );
  const detected = await page.evaluate(async () => {
    const { detectPageCurrency, detectPseudoCurrency } = await import("/src/shared/page-currency.js");
    return [detectPseudoCurrency(document.querySelector(".amt")), detectPageCurrency()];
  });
  assert.deepEqual(detected, ["EUR", "EUR"]);
  const { pattern, count } = await pickAndConvert(page, ".amt", "EUR");
  assert.equal(pattern.currency, "EUR");
  assert.equal(count, 2);
  assert.deepEqual(await text(page, ".amt"), ["3,298,900 تومان", "550,000 تومان"]);
  await page.close();
});

await check("observer converts lazy-loaded items and ignores its own writes", async () => {
  const page = await setup(`<ul id="list"><li><span class="price">$1</span></li></ul>`);
  const result = await page.evaluate(async () => {
    let runs = 0;
    const pattern = B.learnPatternFromElement(document.querySelector(".price"));
    let obs;
    obs = B.createDomObserver({
      onMutations: (roots) => {
        runs++;
        obs.runSilently(() => B.convertAll(pattern, { USD: 100000 }, "تومان", roots));
      },
    });
    obs.start();
    obs.runSilently(() => B.convertAll(pattern, { USD: 100000 }, "تومان"));
    for (let i = 2; i <= 4; i++) {
      document.getElementById("list").insertAdjacentHTML("beforeend", `<li><span class="price">$${i}</span></li>`);
    }
    await new Promise((r) => setTimeout(r, 400));
    const runsAfterAdd = runs;
    await new Promise((r) => setTimeout(r, 400));
    obs.stop();
    return {
      texts: [...document.querySelectorAll(".price")].map((e) => e.textContent),
      runsAfterAdd,
      runs,
    };
  });
  assert.deepEqual(result.texts, ["100,000 تومان", "200,000 تومان", "300,000 تومان", "400,000 تومان"]);
  assert.equal(result.runsAfterAdd, 1, "one debounced batch");
  assert.equal(result.runs, 1, "own writes must not re-trigger the observer");
  await page.close();
});

await check("undo keeps event listeners on split-price children", async () => {
  const page = await setup(`<div class="product-price"><span class="cur">$</span><button class="amt">49</button></div>
    <div class="product-price"><span class="cur">$</span><button class="amt">10</button></div>`);
  const clicks = await page.evaluate(() => {
    let n = 0;
    const btn = document.querySelector(".amt");
    btn.addEventListener("click", () => n++);
    const pattern = B.learnPatternFromElement(document.querySelector(".product-price"));
    B.convertAll(pattern, { USD: 100000 }, "تومان");
    B.restoreAll();
    document.querySelector(".amt").click();
    return n;
  });
  assert.equal(clicks, 1);
  assert.deepEqual(await text(page, ".product-price"), ["$49", "$10"]);
  await page.close();
});

await check("no false positives from 'AMD' / 'try' words; CA$ is CAD", async () => {
  const page = await setup(`<i class="p">AMD Ryzen 7 — $299</i><i class="p">Try it for $5</i><i class="p">CA$ 20</i>`);
  await pickAndConvert(page, ".p");
  assert.deepEqual(await text(page, ".p"), [
    "AMD Ryzen 7 — 29,900,000 تومان",
    "Try it for 500,000 تومان",
    "1,400,000 تومان",
  ]);
  await page.close();
});

await check("picking by mouse position finds the visible price", async () => {
  const page = await setup(`<a class="card-link" style="display:block;padding:20px">
      <span class="a-price"><span class="a-offscreen" style="position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden">$29.99</span>
      <span aria-hidden="true"><span class="a-price-symbol">$</span><span class="a-price-whole">29<span class="a-price-decimal">.</span></span><span class="a-price-fraction">99</span></span></span>
    </a><div style="padding:20px"><span class="bare" style="font-size:30px">12.50</span></div>`);
  const picked = await page.evaluate(() => {
    const at = (el, hints) => {
      const r = el.getBoundingClientRect();
      const found = B.resolvePriceTargetAtPoint(r.left + r.width / 2, r.top + r.height / 2, hints);
      if (!found) return null;
      return found.closest(".a-price") ? "a-price" : found.className || found.tagName;
    };
    return [
      at(document.querySelector(".a-price-whole")),
      at(document.querySelector(".bare")),
      at(document.querySelector(".bare"), { currency: "EUR" }),
    ];
  });
  // The visible split price, not the off-screen copy; a bare number only with a currency hint.
  assert.equal(picked[0], "a-price");
  assert.equal(picked[1], null);
  assert.equal(picked[2], "bare");
  await page.close();
});

await check("split-price fixture: every card can be picked", async () => {
  const html = (await readFile(path.join(ROOT, "test/fixtures/split-price.html"), "utf8"))
    .replace(/^[\s\S]*<body>/, "")
    .replace(/<\/body>[\s\S]*$/, "");
  const page = await setup(html);
  const counts = await page.evaluate(() =>
    [...document.querySelectorAll(".card > *")].map((el) => {
      const pattern = B.learnPatternFromElement(el);
      return pattern ? B.countMatchCandidates(pattern) : 0;
    }),
  );
  assert.ok(counts.every((n) => n > 0), `counts ${counts}`);
  await page.close();
});

await browser.close();
server.close();
console.log(`${passed} browser checks passed.`);
