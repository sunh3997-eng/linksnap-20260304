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

// ─── OpenAI summarize ─────────────────────────────────────────────────────────

async function summarizeWithOpenAI(apiKey, model, content, title) {
  const systemPrompt =
    "You are a helpful assistant that summarizes web pages concisely in Chinese. " +
    "Return exactly 3 sentences. Be informative and objective.";

  const userPrompt =
    `Page title: ${title}\n\nPage content:\n${content}\n\n` +
    "Summarize this page in exactly 3 sentences in Chinese.";

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt },
      ],
      max_tokens:  300,
      temperature: 0.3,
    }),
  });

  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}));
    const errMsg  = errBody?.error?.message || `HTTP ${resp.status}`;

    if (resp.status === 401) throw new Error("Invalid API key — check Settings.");
    if (resp.status === 429) throw new Error("Rate limited or quota exceeded — try again later.");
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

  const { apiKey, model = "gpt-4o-mini" } = await chrome.storage.local.get(["apiKey", "model"]);
  if (!apiKey) {
    showSaveStatus("error", "No API key — open Settings first.");
    return;
  }

  saveBtn.disabled        = true;
  saveBtnIcon.textContent = "";
  const btnSpinner = document.createElement("div");
  btnSpinner.className = "spinner";
  btnSpinner.style.cssText = "border-color:rgba(255,255,255,.3);border-top-color:#fff;";
  saveBtnIcon.appendChild(btnSpinner);
  saveBtnLabel.textContent = "Saving…";

  showSaveStatus("loading", "Extracting page content…", true);

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

    showSaveStatus("loading", `Generating summary with ${model}…`, true);

    // 2. Call OpenAI
    const summary = await summarizeWithOpenAI(
      apiKey,
      model,
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
      model,
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
    saveBtn.disabled        = false;
    saveBtnIcon.innerHTML   = "⚡";
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

  // Show banner if no API key configured
  const { apiKey } = await chrome.storage.local.get("apiKey");
  if (!apiKey) {
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
