/**
 * LinkSnap — Popup script
 * Handles: current tab display, save+summarize, link list rendering, search, delete.
 * All data is stored in IndexedDB via db.js. OpenAI is called directly from the popup.
 */

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const pageFavicon     = document.getElementById("page-favicon");
const pageTitle       = document.getElementById("page-title");
const pageUrl         = document.getElementById("page-url");
const saveBtn         = document.getElementById("save-btn");
const saveBtnIcon     = document.getElementById("save-btn-icon");
const saveBtnLabel    = document.getElementById("save-btn-label");
const saveStatusBox   = document.getElementById("save-status");
const saveSpinner     = document.getElementById("save-spinner");
const saveStatusText  = document.getElementById("save-status-text");
const searchInput     = document.getElementById("search-input");
const linksContainer  = document.getElementById("links-container");
const emptyState      = document.getElementById("empty-state");
const statTotal       = document.getElementById("stat-total");
const statMonth       = document.getElementById("stat-month");
const quotaBadge      = document.getElementById("quota-badge");
const noKeyBanner     = document.getElementById("no-key-banner");
const optionsBtn      = document.getElementById("options-btn");
const goOptions       = document.getElementById("go-options");

// ─── State ────────────────────────────────────────────────────────────────────

let currentTab = null;
let allLinks   = [];

// ─── Status helpers ───────────────────────────────────────────────────────────

function showSaveStatus(type, text, loading = false) {
  saveStatusBox.className    = `save-status ${type}`;
  saveStatusText.textContent = text;
  saveSpinner.style.display  = loading ? "block" : "none";
}

function clearSaveStatus() {
  saveStatusBox.className = "save-status";
}

// ─── Stats footer ─────────────────────────────────────────────────────────────

async function refreshStats() {
  const all        = await db.getAll();
  const monthCount = await db.getMonthCount();
  const FREE_LIMIT = 100;

  statTotal.textContent = `${all.length} link${all.length !== 1 ? "s" : ""}`;
  statMonth.textContent = `${monthCount} this month`;

  quotaBadge.textContent = `${monthCount}/${FREE_LIMIT} this month`;
  quotaBadge.className   = `month-quota${monthCount >= FREE_LIMIT * 0.9 ? " warn" : ""}`;
}

// ─── Render link list ─────────────────────────────────────────────────────────

function formatRelativeTime(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function faviconUrl(url) {
  try {
    const origin = new URL(url).origin;
    return `https://www.google.com/s2/favicons?sz=32&domain_url=${encodeURIComponent(origin)}`;
  } catch {
    return "";
  }
}

function renderLinks(links) {
  linksContainer.querySelectorAll(".link-item").forEach((el) => el.remove());

  if (links.length === 0) {
    emptyState.classList.add("visible");
    return;
  }
  emptyState.classList.remove("visible");

  const fragment = document.createDocumentFragment();

  links.forEach((link) => {
    const item = document.createElement("div");
    item.className = "link-item";
    item.dataset.id = link.id;

    const favicon = document.createElement("img");
    favicon.className = "link-favicon";
    favicon.src = faviconUrl(link.url);
    favicon.alt = "";
    favicon.onerror = () => { favicon.style.display = "none"; };

    const body = document.createElement("div");
    body.className = "link-body";

    const titleAnchor = document.createElement("a");
    titleAnchor.className = "link-title";
    titleAnchor.textContent = link.title || link.url;
    titleAnchor.title = link.url;
    titleAnchor.href = "#";
    titleAnchor.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: link.url });
      window.close();
    });

    const summary = document.createElement("div");
    summary.className = "link-summary";
    summary.textContent = link.summary || "No summary available.";

    const meta = document.createElement("div");
    meta.className = "link-meta";

    const time = document.createElement("span");
    time.textContent = formatRelativeTime(link.savedAt);
    meta.appendChild(time);

    if (link.model) {
      const modelTag = document.createElement("span");
      modelTag.className = "link-model";
      modelTag.textContent = link.model;
      meta.appendChild(modelTag);
    }

    body.appendChild(titleAnchor);
    body.appendChild(summary);
    body.appendChild(meta);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.textContent = "✕";
    deleteBtn.title = "Delete";
    deleteBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await db.delete(link.id);
      allLinks = allLinks.filter((l) => l.id !== link.id);
      item.remove();
      if (linksContainer.querySelectorAll(".link-item").length === 0) {
        emptyState.classList.add("visible");
      }
      await refreshStats();
    });

    item.appendChild(favicon);
    item.appendChild(body);
    item.appendChild(deleteBtn);
    fragment.appendChild(item);
  });

  linksContainer.appendChild(fragment);
}

// ─── Search ───────────────────────────────────────────────────────────────────

let searchDebounce = null;

searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(async () => {
    const q       = searchInput.value.trim();
    const results = q ? await db.search(q) : allLinks;
    renderLinks(results);
  }, 200);
});

// ─── Multi-provider summarize ─────────────────────────────────────────────────

/**
 * Summarize page content using the configured AI provider.
 * Supports: openai, anthropic, openrouter, groq, ollama, custom.
 */
async function summarize(settings, content, title) {
  const {
    provider = "openai",
    apiKey,
    model,
    customEndpoint,
    ollamaModel,
  } = settings;

  const systemPrompt =
    "You are a helpful assistant that summarizes web pages concisely in Chinese. " +
    "Return exactly 3 sentences. Be informative and objective.";

  const userPrompt =
    `Page title: ${title}\n\nPage content:\n${content}\n\n` +
    "Summarize this page in exactly 3 sentences in Chinese.";

  // ── Anthropic Messages API (different format) ────────────────────────────
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
      throw new Error(`Network error: ${err.message}`);
    }

    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({}));
      const errMsg  = errBody?.error?.message || `HTTP ${resp.status}`;
      if (resp.status === 401 || resp.status === 403) throw new Error("API Key 无效或无权限");
      if (resp.status === 429) throw new Error("请求过于频繁，稍后再试");
      throw new Error(errMsg);
    }

    const data = await resp.json();
    return data.content?.[0]?.text?.trim() || "";
  }

  // ── OpenAI-compatible (openai / openrouter / groq / ollama / custom) ─────
  const actualModel = (provider === "ollama")
    ? (ollamaModel || model || "llama3.2")
    : (model || "gpt-4o-mini");

  let endpoint;
  const headers = { "Content-Type": "application/json" };

  switch (provider) {
    case "openai":
      endpoint         = "https://api.openai.com/v1/chat/completions";
      headers["Authorization"] = `Bearer ${apiKey}`;
      break;
    case "openrouter":
      endpoint         = "https://openrouter.ai/api/v1/chat/completions";
      headers["Authorization"] = `Bearer ${apiKey}`;
      headers["HTTP-Referer"]  = "https://linksnap.ext";
      headers["X-Title"]       = "LinkSnap";
      break;
    case "groq":
      endpoint         = "https://api.groq.com/openai/v1/chat/completions";
      headers["Authorization"] = `Bearer ${apiKey}`;
      break;
    case "ollama":
      endpoint         = "http://localhost:11434/v1/chat/completions";
      headers["Authorization"] = "Bearer ollama";
      break;
    default: // custom
      endpoint         = (customEndpoint || "http://localhost:8080/v1").replace(/\/$/, "") + "/chat/completions";
      headers["Authorization"] = `Bearer ${apiKey}`;
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
    if (provider === "ollama") {
      throw new Error("Ollama 未运行，请先启动 ollama serve");
    }
    throw new Error(`Network error: ${err.message}`);
  }

  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}));
    const errMsg  = errBody?.error?.message || `HTTP ${resp.status}`;
    if (resp.status === 401 || resp.status === 403) throw new Error("API Key 无效或无权限");
    if (resp.status === 429) throw new Error("请求过于频繁，稍后再试");
    if (resp.status === 400) throw new Error(`Bad request: ${errMsg}`);
    throw new Error(errMsg);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

// ─── Save current page ────────────────────────────────────────────────────────

async function saveCurrentPage() {
  if (!currentTab || !currentTab.url?.startsWith("http")) {
    showSaveStatus("error", "Cannot save this type of page (need http/https).");
    return;
  }

  const settings = await chrome.storage.local.get([
    "provider", "apiKey", "model", "customEndpoint", "ollamaModel",
  ]);
  const { provider = "openai", apiKey, model = "gpt-4o-mini", ollamaModel } = settings;

  if (provider !== "ollama" && !apiKey) {
    showSaveStatus("error", "No API key — open Settings first.");
    return;
  }

  // Compute the model name that will actually be used
  const actualModel = (provider === "ollama")
    ? (ollamaModel || model || "llama3.2")
    : (model || "gpt-4o-mini");

  saveBtn.disabled        = true;
  saveBtnIcon.textContent = "";
  const btnSpinner = document.createElement("div");
  btnSpinner.className = "spinner";
  btnSpinner.style.cssText = "border-color:rgba(255,255,255,.3);border-top-color:#fff;";
  saveBtnIcon.appendChild(btnSpinner);
  saveBtnLabel.textContent = "Saving\u2026";

  showSaveStatus("loading", "Extracting page content\u2026", true);

  try {
    // 1. Get page text via content script message
    let pageContent = "";
    try {
      const response = await chrome.tabs.sendMessage(currentTab.id, { type: "GET_PAGE_CONTENT" });
      pageContent = response?.content || "";
    } catch {
      // Fallback: inject a one-shot script
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

    showSaveStatus("loading", `Generating summary with ${actualModel}\u2026`, true);

    // 2. Call AI provider
    const summary = await summarize(
      settings,
      pageContent.slice(0, 5000),
      currentTab.title || currentTab.url
    );

    // 3. Persist to IndexedDB
    await db.save({
      url:             currentTab.url,
      title:           currentTab.title || currentTab.url,
      summary,
      content_preview: pageContent.slice(0, 300),
      tags:            [],
      model:           actualModel,
    });

    // 4. Refresh list & stats
    allLinks = await db.getAll();
    renderLinks(allLinks);
    await refreshStats();

    const preview = summary.slice(0, 90) + (summary.length > 90 ? "…" : "");
    showSaveStatus("success", `Saved! ${preview}`);
    setTimeout(clearSaveStatus, 6000);

  } catch (err) {
    console.error("LinkSnap save error:", err);
    showSaveStatus("error", err.message || "Unexpected error.");
  } finally {
    saveBtn.disabled         = false;
    saveBtnIcon.innerHTML    = "&#x26A1;";
    saveBtnLabel.textContent = "Save & Generate Summary";
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  pageTitle.textContent = tab.title || tab.url || "Untitled";
  pageUrl.textContent   = tab.url   || "";

  const fav = faviconUrl(tab.url || "");
  if (fav) {
    pageFavicon.src = fav;
  } else {
    pageFavicon.style.display = "none";
  }

  // Show banner if no API key configured (Ollama does not need one)
  const { provider = "openai", apiKey } = await chrome.storage.local.get(["provider", "apiKey"]);
  if (provider !== "ollama" && !apiKey) {
    noKeyBanner.classList.add("visible");
    saveBtn.disabled = true;
  }

  allLinks = await db.getAll();
  renderLinks(allLinks);
  await refreshStats();

  saveBtn.addEventListener("click", saveCurrentPage);

  optionsBtn.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  goOptions.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });
});
