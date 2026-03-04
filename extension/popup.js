/**
 * LinkSnap — Popup script (Manifest V3)
 * Handles: loading current tab info, saving link, opening dashboard, settings.
 */

const DEFAULT_API = "http://localhost:5000";

let currentTab = null;

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getApiBase() {
  const data = await chrome.storage.sync.get("apiBase");
  return (data.apiBase || DEFAULT_API).replace(/\/$/, "");
}

function setStatus(type, text, showSpinner = false) {
  const box     = document.getElementById("status-box");
  const textEl  = document.getElementById("status-text");
  const spinner = document.getElementById("spinner");

  box.className       = `status ${type}`;
  textEl.textContent  = text;
  spinner.style.display = showSpinner ? "block" : "none";
}

function clearStatus() {
  const box = document.getElementById("status-box");
  box.className = "status";
  box.style.display = "none";
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  clearStatus();

  // Load current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  document.getElementById("page-title").textContent = tab.title || tab.url;
  document.getElementById("page-url").textContent   = tab.url;

  // Open dashboard button
  document.getElementById("open-dashboard").addEventListener("click", async () => {
    const api = await getApiBase();
    chrome.tabs.create({ url: api + "/" });
    window.close();
  });

  // Settings link — prompt for API base URL
  document.getElementById("settings-link").addEventListener("click", async (e) => {
    e.preventDefault();
    const api    = await getApiBase();
    const newApi = prompt("LinkSnap 后端地址（默认 http://localhost:5000）：", api);
    if (newApi !== null && newApi.trim()) {
      await chrome.storage.sync.set({ apiBase: newApi.trim() });
      setStatus("success", "已保存后端地址：" + newApi.trim());
    }
  });

  // Save button
  document.getElementById("save-btn").addEventListener("click", saveLink);

  // Allow Enter key in tags field to trigger save
  document.getElementById("tags-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveLink();
  });
});

// ─── Save link ────────────────────────────────────────────────────────────────

async function saveLink() {
  if (!currentTab) return;

  const url   = currentTab.url;
  const title = currentTab.title || "";
  const tags  = document.getElementById("tags-input").value.trim();

  // Validate URL
  if (!url || !url.startsWith("http")) {
    setStatus("error", "无法保存此类页面（需要 http/https）");
    return;
  }

  const btn = document.getElementById("save-btn");
  btn.disabled = true;
  setStatus("loading", "正在抓取页面并生成 AI 摘要…", true);

  try {
    const api  = await getApiBase();
    const resp = await fetch(`${api}/links`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, title, tags }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      const msg = data.error || `HTTP ${resp.status}`;
      setStatus("error", "保存失败：" + msg);
      return;
    }

    setStatus("success", "✓ 已保存！摘要已生成");

    // Show summary preview in a brief toast-style update
    if (data.summary) {
      setTimeout(() => {
        setStatus("success", data.summary.slice(0, 120) + (data.summary.length > 120 ? "…" : ""));
      }, 800);
    }

  } catch (err) {
    console.error("LinkSnap save error:", err);
    setStatus("error", "无法连接后端，请检查服务是否运行（" + err.message + "）");
  } finally {
    btn.disabled = false;
  }
}
