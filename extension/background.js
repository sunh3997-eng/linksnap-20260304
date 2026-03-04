/**
 * LinkSnap — Service Worker (Manifest V3)
 * Handles keyboard shortcut command to save the current tab directly.
 */

// Listen for the "save-link" keyboard command defined in manifest
chrome.commands?.onCommand.addListener(async (command) => {
  if (command !== "save-link") return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url?.startsWith("http")) return;

  const data = await chrome.storage.sync.get("apiBase");
  const api  = (data.apiBase || "http://localhost:5000").replace(/\/$/, "");

  try {
    const resp = await fetch(`${api}/links`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: tab.url, title: tab.title || "" }),
    });

    if (resp.ok) {
      // Show a brief badge notification
      chrome.action.setBadgeText({ text: "✓", tabId: tab.id });
      chrome.action.setBadgeBackgroundColor({ color: "#4ade80" });
      setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2000);
    } else {
      chrome.action.setBadgeText({ text: "!", tabId: tab.id });
      chrome.action.setBadgeBackgroundColor({ color: "#f87171" });
      setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2000);
    }
  } catch (err) {
    console.error("LinkSnap background save failed:", err);
  }
});
