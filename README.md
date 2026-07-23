# Betoman

Chromium extension that **replaces** foreign shopping-site prices with Iranian **free-market Toman** (English digits). Everything runs in your browser — **no Betoman server**.

## Features (v0.1.0)

- Pick one price on a page → convert all matching prices
- Smart parsing: `2,000` = `2000`, `$`, `US$`, `USD`, `€`, `£`, and more
- Real-time conversion for scroll / lazy-loaded content (`MutationObserver`)
- Manual rates per currency **or** your own [Navasan](https://www.navasan.net/api/) API key
- Per-site pattern memory; toggle off restores original prices
- Checkout/cart pages skipped by default

## Install (development)

1. Clone this repo
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** → select the `betoman` folder
5. **Reload the extension** after code updates (click ↻ on the extension card)
6. Open **Settings** and set manual rates (e.g. USD `85000`)

### Local HTML test files (`file://`)

1. Extension → **Details** → enable **Allow access to file URLs**
2. Open the fixture, then **reload the tab**
3. If you installed Betoman after opening the tab, toggle On in the popup (it will inject automatically) or reload once

## Quick start

1. Open a shopping page (or `test/fixtures/static-usd.html` via `file://`)
2. Click the **Betoman icon** in the toolbar — a glass panel opens **on the page** (top-right)
3. Turn **On** → **انتخاب قیمت** → click a price on the page
4. Confirm **اعمال** when prompted

## Navasan API (optional)

Betoman uses **your** Navasan API key — not a shared server.

1. Get a free API key from Telegram bot [@navasan_contact_bot](https://t.me/navasan_contact_bot) ([Navasan API](https://www.navasan.net/api/))
2. In Settings, enable **استفاده از API نوسان** and enter your API key
3. Free tier: 120 requests/month; rates update every ~2 hours on the free plan

See the [Navasan web service guide](https://www.navasan.net/api/webserviceguide/) for details.

## Project structure

```
src/
  background/   Service worker — rates cache, Navasan fetch, alarms
  content/      Picker, converter, DOM observer
  popup/        Toolbar popup
  options/      Settings page
  shared/       Storage, parser, formatting
test/           Parser unit tests + HTML fixtures
```

## Tests

```bash
npm test
```

Open `test/fixtures/static-usd.html` and `infinite-scroll.html` in Chrome for manual tests.

## Privacy

- API keys stored in `chrome.storage.local` only (not synced)
- No analytics or third-party scripts
- Network calls only to Navasan (if you enable it) and the shopping sites you visit

## License

MIT — see [LICENSE](LICENSE)
