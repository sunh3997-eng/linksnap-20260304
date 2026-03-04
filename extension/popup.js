/**
 * LinkSnap — Popup script
 * Settings + save + list + search merged into one file.
 * CSP-safe: createElement/textContent only, no innerHTML for content, no inline handlers.
 */

// ─── Settings: model configs ──────────────────────────────────────────────────

const MODEL_CONFIGS = {
  openai: [
    { group: "Flagship", models: [
      { value: "gpt-4.1",      label: "gpt-4.1" },
      { value: "gpt-4.1-mini", label: "gpt-4.1-mini" },
      { value: "gpt-4.1-nano", label: "gpt-4.1-nano" },
      { value: "gpt-4o",       label: "gpt-4o" },
      { value: "gpt-4o-mini",  label: "gpt-4o-mini (recommended)" },
    ]},
    { group: "Reasoning", models: [
      { value: "o3",      label: "o3" },
      { value: "o3-mini", label: "o3-mini" },
      { value: "o1",      label: "o1" },
      { value: "o1-mini", label: "o1-mini" },
    ]},
    { group: "Legacy", models: [
      { value: "gpt-4-turbo",   label: "gpt-4-turbo" },
      { value: "gpt-4",         label: "gpt-4" },
      { value: "gpt-3.5-turbo", label: "gpt-3.5-turbo" },
    ]},
  ],
  anthropic: [
    { group: "Claude 4", models: [
      { value: "claude-opus-4-6",   label: "claude-opus-4-6 (latest)" },
      { value: "claude-sonnet-4-6", label: "claude-sonnet-4-6 (recommended)" },
      { value: "claude-haiku-3-5",  label: "claude-haiku-3-5" },
    ]},
    { group: "Claude 3.5", models: [
      { value: "claude-3-5-sonnet-20241022", label: "claude-3-5-sonnet-20241022" },
      { value: "claude-3-5-haiku-20241022",  label: "claude-3-5-haiku-20241022" },
    ]},
    { group: "Claude 3", models: [
      { value: "claude-3-opus-20240229",  label: "claude-3-opus-20240229" },
      { value: "claude-3-haiku-20240307", label: "claude-3-haiku-20240307" },
    ]},
  ],
  openrouter: [
    { group: "OpenAI", models: [
      { value: "openai/gpt-4o",      label: "openai/gpt-4o" },
      { value: "openai/gpt-4o-mini", label: "openai/gpt-4o-mini (recommended)" },
    ]},
    { group: "Anthropic", models: [
      { value: "anthropic/claude-opus-4-6",   label: "anthropic/claude-opus-4-6" },
      { value: "anthropic/claude-sonnet-4-6", label: "anthropic/claude-sonnet-4-6" },
    ]},
    { group: "Meta (Free)", models: [
      { value: "meta-llama/llama-3.3-70b-instruct", label: "meta-llama/llama-3.3-70b (free)" },
      { value: "meta-llama/llama-3.1-8b-instruct",  label: "meta-llama/llama-3.1-8b (free)" },
    ]},
    { group: "Google", models: [
      { value: "google/gemini-2.0-flash", label: "google/gemini-2.0-flash" },
      { value: "google/gemini-flash-1.5", label: "google/gemini-flash-1.5" },
    ]},
    { group: "Mistral", models: [
      { value: "mistralai/mistral-large",       label: "mistralai/mistral-large" },
      { value: "mistralai/mistral-7b-instruct", label: "mistralai/mistral-7b (free)" },
    ]},
    { group: "DeepSeek", models: [
      { value: "deepseek/deepseek-chat", label: "deepseek/deepseek-chat" },
      { value: "deepseek/deepseek-r1",   label: "deepseek/deepseek-r1" },
    ]},
    { group: "Qwen", models: [
      { value: "qwen/qwen-2.5-72b-instruct", label: "qwen/qwen-2.5-72b-instruct" },
    ]},
  ],
  groq: [
    { group: "Llama", models: [
      { value: "llama-3.3-70b-versatile", label: "llama-3.3-70b-versatile (recommended)" },
      { value: "llama-3.1-8b-instant",    label: "llama-3.1-8b-instant" },
    ]},
    { group: "Other", models: [
      { value: "mixtral-8x7b-32768",            label: "mixtral-8x7b-32768" },
      { value: "gemma2-9b-it",                  label: "gemma2-9b-it" },
      { value: "deepseek-r1-distill-llama-70b", label: "deepseek-r1-distill-llama-70b" },
    ]},
  ],
  ollama: [
    { group: "Local", models: [
      { value: "llama3.2",    label: "llama3.2" },
      { value: "llama3.1",    label: "llama3.1" },
      { value: "mistral",     label: "mistral" },
      { value: "deepseek-r1", label: "deepseek-r1" },
      { value: "qwen2.5",     label: "qwen2.5" },
      { value: "phi3",        label: "phi3" },
    ]},
  ],
  custom: [],
};

const KEY_PLACEHOLDERS = {
  openai:     "sk-...",
  anthropic:  "sk-ant-...",
  openrouter: "sk-or-...",
  groq:       "gsk_...",
  ollama:     "",
  custom:     "Your API key",
};

// ─── Settings DOM refs ────────────────────────────────────────────────────────

const settingsPanel   = document.getElementById("settings-panel");
const settingsToggle  = document.getElementById("settings-toggle");
const sProvider       = document.getElementById("s-provider");
const sKeyRow         = document.getElementById("s-key-row");
const sApiKey         = document.getElementById("s-api-key");
const sEyeBtn         = document.getElementById("s-eye-btn");
const sEyeShow        = document.getElementById("s-eye-show");
const sEyeHide        = document.getElementById("s-eye-hide");
const sEndpointRow    = document.getElementById("s-endpoint-row");
const sEndpoint       = document.getElementById("s-endpoint");
const sModelRow       = document.getElementById("s-model-row");
const sModel          = document.getElementById("s-model");
const sOllamaModelRow = document.getElementById("s-ollama-model-row");
const sOllamaModel    = document.getElementById("s-ollama-model");
const sCustomModelRow = document.getElementById("s-custom-model-row");
const sCustomModel    = document.getElementById("s-custom-model");
const sSaveBtn        = document.getElementById("s-save-btn");
const sTestBtn        = document.getElementById("s-test-btn");
const sStatusEl       = document.getElementById("s-status");

// ─── Settings helpers ─────────────────────────────────────────────────────────

function populateModels(provider) {
  sModel.textContent = "";
  const groups = MODEL_CONFIGS[provider] || [];
  groups.forEach(({ group, models }) => {
    const optgroup = document.createElement("optgroup");
    optgroup.label = group;
    models.forEach(({ value, label }) => {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      optgroup.appendChild(opt);
    });
    sModel.appendChild(optgroup);
  });
}

function onProviderChange() {
  const p = sProvider.value;

  sKeyRow.hidden         = (p === "ollama");
  sEndpointRow.hidden    = (p !== "custom");
  sOllamaModelRow.hidden = (p !== "ollama");

  if (p === "custom") {
    sModelRow.hidden       = true;
    sCustomModelRow.hidden = false;
  } else {
    sModelRow.hidden       = false;
    sCustomModelRow.hidden = true;
    populateModels(p);
  }

  if (p !== "ollama") {
    sApiKey.placeholder = KEY_PLACEHOLDERS[p] || "";
  }
}

function showSettingsStatus(cls, text) {
  sStatusEl.className   = "s-status " + cls;
  sStatusEl.textContent = text;
}

function clearSettingsStatus() {
  sStatusEl.className   = "s-status";
  sStatusEl.textContent = "";
}

async function loadSettings() {
  const data = await chrome.storage.local.get([
    "provider", "apiKey", "model", "customEndpoint", "ollamaModel",
  ]);
  if (data.provider) sProvider.value = data.provider;
  onProviderChange();
  if (data.apiKey)        sApiKey.value      = data.apiKey;
  if (data.customEndpoint) sEndpoint.value   = data.customEndpoint;
  if (data.ollamaModel)   sOllamaModel.value = data.ollamaModel;
  if (data.model) {
    if (sProvider.value === "custom") {
      sCustomModel.value = data.model;
    } else {
      sModel.value = data.model;
    }
  }
}

async function saveSettings() {
  const provider       = sProvider.value;
  const key            = sApiKey.value.trim();
  const customEndpoint = sEndpoint.value.trim();
  const ollamaModel    = sOllamaModel.value.trim();
  const model          = (provider === "custom") ? sCustomModel.value.trim() : sModel.value;

  if (provider !== "ollama" && !key) {
    showSettingsStatus("err", "API key is required.");
    return;
  }
  if (provider === "custom" && !customEndpoint) {
    showSettingsStatus("err", "Endpoint URL is required.");
    return;
  }

  sSaveBtn.disabled = true;
  showSettingsStatus("inf", "Saving\u2026");
  await chrome.storage.local.set({ provider, apiKey: key, model, customEndpoint, ollamaModel });
  sSaveBtn.disabled = false;
  showSettingsStatus("ok", "Saved.");
  await refreshStats();
  setTimeout(clearSettingsStatus, 2500);
}

async function testConnection() {
  const provider       = sProvider.value;
  const key            = sApiKey.value.trim();
  const customEndpoint = sEndpoint.value.trim();

  if (provider !== "ollama" && !key) {
    showSettingsStatus("err", "Enter an API key first.");
    return;
  }

  sTestBtn.disabled = true;
  showSettingsStatus("inf", "Testing\u2026");

  try {
    if (provider === "anthropic") {
      const selectedModel = sModel.value || "claude-3-5-haiku-20241022";
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type":      "application/json",
          "x-api-key":         key,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model:      selectedModel,
          max_tokens: 1,
          messages:   [{ role: "user", content: "Hi" }],
        }),
      });
      if (resp.ok || resp.status === 529) {
        showSettingsStatus("ok", "Key valid \u2014 connected.");
      } else if (resp.status === 401 || resp.status === 403) {
        showSettingsStatus("err", "Invalid API key.");
      } else if (resp.status === 429) {
        showSettingsStatus("ok", "Key valid (rate limited).");
      } else if (resp.status === 404) {
        showSettingsStatus("err", "Model not found \u2014 try another.");
      } else {
        showSettingsStatus("err", "HTTP " + resp.status);
      }

    } else if (provider === "ollama") {
      const resp = await fetch("http://localhost:11434/api/tags");
      if (resp.ok) {
        const data  = await resp.json();
        const count = data.models?.length ?? 0;
        showSettingsStatus("ok", "Ollama running \u2014 " + count + " model(s) installed.");
      } else {
        showSettingsStatus("err", "Ollama returned HTTP " + resp.status);
      }

    } else {
      let endpoint;
      const headers = { "Authorization": "Bearer " + key };
      if (provider === "openai") {
        endpoint = "https://api.openai.com/v1/models";
      } else if (provider === "openrouter") {
        endpoint = "https://openrouter.ai/api/v1/models";
        headers["HTTP-Referer"] = "https://linksnap.ext";
        headers["X-Title"]      = "LinkSnap";
      } else if (provider === "groq") {
        endpoint = "https://api.groq.com/openai/v1/models";
      } else {
        const base = customEndpoint || "http://localhost:8080/v1";
        endpoint   = base.replace(/\/$/, "") + "/models";
      }
      const resp = await fetch(endpoint, { headers });
      if (resp.ok) {
        const data  = await resp.json();
        const count = data.data?.length ?? "?";
        showSettingsStatus("ok", "Connected \u2014 " + count + " models available.");
      } else if (resp.status === 401 || resp.status === 403) {
        showSettingsStatus("err", "Invalid API key.");
      } else if (resp.status === 429) {
        showSettingsStatus("ok", "Key valid (rate limited).");
      } else {
        showSettingsStatus("err", "HTTP " + resp.status);
      }
    }
  } catch (err) {
    if (provider === "ollama") {
      showSettingsStatus("err", "Cannot connect. Is ollama serve running?");
    } else {
      showSettingsStatus("err", "Network error: " + err.message);
    }
  } finally {
    sTestBtn.disabled = false;
  }
}

// ─── Settings event bindings ──────────────────────────────────────────────────

settingsToggle.addEventListener("click", () => {
  settingsPanel.classList.toggle("open");
});

sProvider.addEventListener("change", onProviderChange);
sSaveBtn.addEventListener("click", saveSettings);
sTestBtn.addEventListener("click", testConnection);
sApiKey.addEventListener("keydown", (e) => { if (e.key === "Enter") saveSettings(); });

sEyeBtn.addEventListener("click", () => {
  const isPassword = sApiKey.type === "password";
  sApiKey.type      = isPassword ? "text" : "password";
  sEyeShow.hidden   = isPassword;   // show hide-icon when key is visible
  sEyeHide.hidden   = !isPassword;  // show show-icon when key is hidden
});

// ─── Toast ────────────────────────────────────────────────────────────────────

const toastEl = document.getElementById("toast");
let toastTimer = null;

function showToast(text, type, duration) {
  if (duration === undefined) duration = 3000;
  clearTimeout(toastTimer);
  toastEl.textContent = text;
  toastEl.className   = "toast" + (type ? " " + type : "");
  // Force reflow so transition fires even if toast was already visible
  void toastEl.offsetWidth;
  toastEl.classList.add("show");
  toastTimer = setTimeout(() => { toastEl.classList.remove("show"); }, duration);
}

// ─── Stats / footer ───────────────────────────────────────────────────────────

const statCount = document.getElementById("stat-count");
const statModel = document.getElementById("stat-model");

async function refreshStats() {
  const all  = await db.getAll();
  const data = await chrome.storage.local.get(["provider", "model", "ollamaModel"]);
  const provider    = data.provider    || "openai";
  const model       = data.model       || "gpt-4o-mini";
  const ollamaModel = data.ollamaModel || "";
  const actualModel = (provider === "ollama") ? (ollamaModel || model || "llama3.2") : (model || "gpt-4o-mini");

  statCount.textContent = all.length + " link" + (all.length !== 1 ? "s" : "");
  statModel.textContent = actualModel;
}

// ─── List ─────────────────────────────────────────────────────────────────────

const linkList   = document.getElementById("link-list");
const emptyState = document.getElementById("empty-state");
let allLinks     = [];

function formatRelativeTime(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return mins + "m ago";
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return hrs + "h ago";
  const days = Math.floor(hrs / 24);
  if (days < 30) return days + "d ago";
  return new Date(ts).toLocaleDateString();
}

function faviconUrl(url) {
  try {
    const origin = new URL(url).origin;
    return "https://www.google.com/s2/favicons?sz=32&domain_url=" + encodeURIComponent(origin);
  } catch {
    return "";
  }
}

function renderLinks(links) {
  linkList.querySelectorAll(".link-item").forEach((el) => el.remove());

  if (links.length === 0) {
    emptyState.classList.add("visible");
    return;
  }
  emptyState.classList.remove("visible");

  const frag = document.createDocumentFragment();
  links.forEach((link) => {
    const item = document.createElement("div");
    item.className  = "link-item";
    item.dataset.id = link.id;

    const fav = document.createElement("img");
    fav.className = "link-favicon";
    fav.src = faviconUrl(link.url);
    fav.alt = "";
    fav.addEventListener("error", () => { fav.style.display = "none"; });

    const body = document.createElement("div");
    body.className = "link-body";

    const titleEl = document.createElement("a");
    titleEl.className   = "link-title";
    titleEl.textContent = link.title || link.url;
    titleEl.title       = link.url;
    titleEl.href        = "#";
    titleEl.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: link.url });
      window.close();
    });

    const summary = document.createElement("div");
    summary.className   = "link-summary";
    summary.textContent = link.summary || "";

    const meta = document.createElement("div");
    meta.className = "link-meta";

    const time = document.createElement("span");
    time.textContent = formatRelativeTime(link.savedAt);
    meta.appendChild(time);

    if (link.model) {
      const modelTag = document.createElement("span");
      modelTag.className   = "link-model";
      modelTag.textContent = link.model;
      meta.appendChild(modelTag);
    }

    body.appendChild(titleEl);
    body.appendChild(summary);
    body.appendChild(meta);

    const delBtn = document.createElement("button");
    delBtn.className   = "delete-btn";
    delBtn.textContent = "\u00d7";
    delBtn.title       = "Delete";
    delBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await db.delete(link.id);
      allLinks = allLinks.filter((l) => l.id !== link.id);
      item.remove();
      if (linkList.querySelectorAll(".link-item").length === 0) {
        emptyState.classList.add("visible");
      }
      await refreshStats();
      showToast("Deleted.", "", 2000);
    });

    item.appendChild(fav);
    item.appendChild(body);
    item.appendChild(delBtn);
    frag.appendChild(item);
  });

  linkList.appendChild(frag);
}

// ─── Search ───────────────────────────────────────────────────────────────────

const searchInput = document.getElementById("search-input");
let searchDebounce = null;

searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(async () => {
    const q       = searchInput.value.trim();
    const results = q ? await db.search(q) : allLinks;
    renderLinks(results);
  }, 200);
});

// ─── Save ─────────────────────────────────────────────────────────────────────

const saveBtn     = document.getElementById("save-btn");
const pageFavicon = document.getElementById("page-favicon");
const pageTitleEl = document.getElementById("page-title");
const pageUrlEl   = document.getElementById("page-url");
let currentTab    = null;

function makePulseDots() {
  const wrap = document.createElement("span");
  wrap.className = "pulse";
  for (let i = 0; i < 3; i++) {
    wrap.appendChild(document.createElement("span"));
  }
  return wrap;
}

async function summarize(settings, content, title) {
  const { provider = "openai", apiKey, model, customEndpoint, ollamaModel } = settings;

  const systemPrompt =
    "You are a helpful assistant that summarizes web pages concisely in Chinese. " +
    "Return exactly 3 sentences. Be informative and objective.";
  const userPrompt =
    "Page title: " + title + "\n\nPage content:\n" + content + "\n\n" +
    "Summarize this page in exactly 3 sentences in Chinese.";

  // ── Anthropic Messages API ────────────────────────────────────────────────
  if (provider === "anthropic") {
    let resp;
    try {
      resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type":      "application/json",
          "x-api-key":         apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model,
          max_tokens: 300,
          system:     systemPrompt,
          messages:   [{ role: "user", content: userPrompt }],
        }),
      });
    } catch (err) {
      throw new Error("Network error: " + err.message);
    }
    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({}));
      const errMsg  = errBody?.error?.message || "HTTP " + resp.status;
      if (resp.status === 401 || resp.status === 403) throw new Error("API Key \u65e0\u6548\u6216\u65e0\u6743\u9650");
      if (resp.status === 429) throw new Error("\u8bf7\u6c42\u8fc7\u4e8e\u9891\u7e41\uff0c\u7a0d\u540e\u518d\u8bd5");
      throw new Error(errMsg);
    }
    const data = await resp.json();
    return data.content?.[0]?.text?.trim() || "";
  }

  // ── OpenAI-compatible (openai / openrouter / groq / ollama / custom) ──────
  const actualModel = (provider === "ollama")
    ? (ollamaModel || model || "llama3.2")
    : (model || "gpt-4o-mini");

  let endpoint;
  const headers = { "Content-Type": "application/json" };

  switch (provider) {
    case "openai":
      endpoint = "https://api.openai.com/v1/chat/completions";
      headers["Authorization"] = "Bearer " + apiKey;
      break;
    case "openrouter":
      endpoint = "https://openrouter.ai/api/v1/chat/completions";
      headers["Authorization"] = "Bearer " + apiKey;
      headers["HTTP-Referer"]  = "https://linksnap.ext";
      headers["X-Title"]       = "LinkSnap";
      break;
    case "groq":
      endpoint = "https://api.groq.com/openai/v1/chat/completions";
      headers["Authorization"] = "Bearer " + apiKey;
      break;
    case "ollama":
      endpoint = "http://localhost:11434/v1/chat/completions";
      headers["Authorization"] = "Bearer ollama";
      break;
    default: // custom
      endpoint = (customEndpoint || "http://localhost:8080/v1").replace(/\/$/, "") + "/chat/completions";
      headers["Authorization"] = "Bearer " + apiKey;
  }

  let resp;
  try {
    resp = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model:       actualModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userPrompt },
        ],
        max_tokens:  300,
        temperature: 0.3,
      }),
    });
  } catch (err) {
    if (provider === "ollama") throw new Error("Ollama \u672a\u8fd0\u884c\uff0c\u8bf7\u5148\u542f\u52a8 ollama serve");
    throw new Error("Network error: " + err.message);
  }

  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}));
    const errMsg  = errBody?.error?.message || "HTTP " + resp.status;
    if (resp.status === 401 || resp.status === 403) throw new Error("API Key \u65e0\u6548\u6216\u65e0\u6743\u9650");
    if (resp.status === 429) throw new Error("\u8bf7\u6c42\u8fc7\u4e8e\u9891\u7e41\uff0c\u7a0d\u540e\u518d\u8bd5");
    if (resp.status === 400) throw new Error("Bad request: " + errMsg);
    throw new Error(errMsg);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

async function saveCurrentPage() {
  if (!currentTab || !currentTab.url?.startsWith("http")) {
    showToast("Cannot save this page (needs http/https).", "error");
    return;
  }

  const settings = await chrome.storage.local.get([
    "provider", "apiKey", "model", "customEndpoint", "ollamaModel",
  ]);
  const { provider = "openai", apiKey, model = "gpt-4o-mini", ollamaModel } = settings;

  if (provider !== "ollama" && !apiKey) {
    showToast("No API key \u2014 open Settings first.", "error");
    settingsPanel.classList.add("open");
    return;
  }

  const actualModel = (provider === "ollama")
    ? (ollamaModel || model || "llama3.2")
    : (model || "gpt-4o-mini");

  // Loading state: pulse dots + label
  saveBtn.disabled  = true;
  saveBtn.textContent = "";
  saveBtn.appendChild(makePulseDots());
  const loadLabel = document.createElement("span");
  loadLabel.textContent = " Saving\u2026";
  saveBtn.appendChild(loadLabel);

  try {
    // 1. Get page content
    let pageContent = "";
    try {
      const response = await chrome.tabs.sendMessage(currentTab.id, { type: "GET_PAGE_CONTENT" });
      pageContent = response?.content || "";
    } catch {
      try {
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: currentTab.id },
          func:   () => document.body.innerText.slice(0, 3000),
        });
        pageContent = result?.result || "";
      } catch {
        pageContent = "";
      }
    }

    // 2. Call AI provider
    const summary = await summarize(
      settings,
      pageContent.slice(0, 5000),
      currentTab.title || currentTab.url
    );

    // 3. Persist
    await db.save({
      url:             currentTab.url,
      title:           currentTab.title || currentTab.url,
      summary,
      content_preview: pageContent.slice(0, 300),
      tags:            [],
      model:           actualModel,
    });

    // 4. Refresh
    allLinks = await db.getAll();
    renderLinks(allLinks);
    await refreshStats();

    showToast("Saved!", "success");

  } catch (err) {
    console.error("LinkSnap save error:", err);
    showToast(err.message || "Unexpected error.", "error", 5000);
  } finally {
    saveBtn.disabled    = false;
    saveBtn.textContent = "Save \u0026 Summarize";
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  pageTitleEl.textContent = tab.title || tab.url || "Untitled";
  pageUrlEl.textContent   = tab.url   || "";

  const fav = faviconUrl(tab.url || "");
  if (fav) {
    pageFavicon.src = fav;
    pageFavicon.addEventListener("error", () => { pageFavicon.style.display = "none"; });
  } else {
    pageFavicon.style.display = "none";
  }

  await loadSettings();

  // Auto-open settings panel if no API key configured
  const { provider = "openai", apiKey } = await chrome.storage.local.get(["provider", "apiKey"]);
  if (provider !== "ollama" && !apiKey) {
    settingsPanel.classList.add("open");
    saveBtn.disabled = true;
  }

  allLinks = await db.getAll();
  renderLinks(allLinks);
  await refreshStats();

  saveBtn.addEventListener("click", saveCurrentPage);
});
