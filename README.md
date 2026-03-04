# LinkSnap

Save any web page with a 3-sentence AI summary — no server, no sign-up, 100% local.

---

## How it works

1. Click the LinkSnap icon (or press `Ctrl+Shift+S` / `Cmd+Shift+S`)
2. Hit **Save & Generate Summary**
3. The extension reads the page text, calls OpenAI directly, and stores everything in your browser's IndexedDB — nothing leaves your machine except the OpenAI API call

---

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the `extension/` folder
4. The LinkSnap icon appears in your toolbar

---

## Setup

1. Click the LinkSnap icon → **⚙ Settings** (or right-click the icon → *Options*)
2. Paste your **OpenAI API key** (`sk-…`)
   Get one at [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
3. Choose a model (default: `gpt-4o-mini`)
4. Click **Test API Key** to verify, then **Save Settings**

---

## Usage

| Action | How |
|--------|-----|
| Save current page | Click the popup → **Save & Generate Summary** |
| Quick-save shortcut | `Ctrl+Shift+S` (Windows/Linux) · `Cmd+Shift+S` (Mac) |
| Search saved links | Type in the search box inside the popup |
| Open a saved link | Click the blue link title |
| Delete a link | Hover a row → click **✕** |
| Change API key / model | **⚙ Settings** inside the popup |

---

## Supported models

| Model | Notes |
|-------|-------|
| `gpt-4o-mini` | Recommended — fast, cheap, great quality |
| `gpt-4o` | Smarter summaries, higher cost |
| `gpt-3.5-turbo` | Legacy option |

---

## Project structure

```
linksnap-20260304/
├── README.md
└── extension/
    ├── manifest.json      # Manifest V3 config
    ├── popup.html         # Main popup UI
    ├── popup.js           # Save + list + search logic
    ├── options.html       # Settings page
    ├── options.js         # API key + model settings
    ├── background.js      # Service worker (shortcuts, cleanup)
    ├── content.js         # Page text extraction
    ├── db.js              # IndexedDB wrapper (LinkDB class)
    └── icons/
        ├── icon16.png
        ├── icon48.png
        └── icon128.png
```

---

## Privacy

- **Your API key** is stored only in `chrome.storage.local` on your device
- **All saved links and summaries** live in your browser's IndexedDB — never uploaded anywhere
- The only external network call is from your browser directly to `api.openai.com` when generating a summary
- No telemetry, no analytics, no LinkSnap server involved

---

## Data management

- Links older than **30 days** are automatically purged by the background service worker
- The popup shows a monthly usage counter (free soft-limit: 100 saves/month)
- To clear all data: go to `chrome://settings/siteData`, find `chrome-extension://…`, and delete

---

## Tech stack

- Chrome Manifest V3 (pure HTML/CSS/JS, no build step)
- IndexedDB for local storage
- OpenAI Chat Completions API (`gpt-4o-mini` default)

---

## License

MIT
