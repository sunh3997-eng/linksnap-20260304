/**
 * LinkSnap — Service Worker (Manifest V3)
 * Responsibilities:
 *   - Handle Ctrl+Shift+S keyboard shortcut → trigger save via popup messaging
 *   - Periodic cleanup of links older than 30 days
 */

// ─── Keyboard shortcut ────────────────────────────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "save-link") return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url?.startsWith("http")) return;

  // Open the popup — the user can then confirm & save.
  // (Service workers cannot directly trigger a full summarize+save flow
  // because IndexedDB is not available in MV3 service workers by default,
  // and the OpenAI fetch would require the full popup context.)
  // Instead, signal via badge so the user knows the shortcut was received.
  chrome.action.setBadgeText({ text: "↑", tabId: tab.id });
  chrome.action.setBadgeBackgroundColor({ color: "#6c8fff" });
  setTimeout(() => chrome.action.setBadgeText({ text: "", tabId: tab.id }), 2000);

  // Open the extension popup so the user can complete the save
  chrome.action.openPopup().catch(() => {
    // openPopup is not available in all Chrome versions — silently ignore
  });
});

// ─── Periodic old-link cleanup ────────────────────────────────────────────────

// Register a daily alarm on install / startup
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("cleanup-old-links", {
    delayInMinutes:     1,
    periodInMinutes:    24 * 60, // once a day
  });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("cleanup-old-links", {
    delayInMinutes:  1,
    periodInMinutes: 24 * 60,
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== "cleanup-old-links") return;
  cleanupOldLinks();
});

/**
 * Delete IndexedDB records older than 30 days.
 * We open the database directly here since the service worker shares
 * the same origin as the popup.
 */
async function cleanupOldLinks() {
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - THIRTY_DAYS_MS;

  const DB_NAME    = "linksnap";
  const STORE_NAME = "links";

  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = () => reject(req.error);
    req.onupgradeneeded = (e) => {
      const store = e.target.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      store.createIndex("savedAt", "savedAt", { unique: false });
    };
  });

  const tx    = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);

  const allLinks = await new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => reject(req.error);
  });

  const oldLinks = allLinks.filter((l) => l.savedAt < cutoff);

  await Promise.all(
    oldLinks.map(
      (l) =>
        new Promise((resolve, reject) => {
          const req = store.delete(l.id);
          req.onsuccess = () => resolve();
          req.onerror   = () => reject(req.error);
        })
    )
  );

  if (oldLinks.length > 0) {
    console.log(`LinkSnap cleanup: removed ${oldLinks.length} link(s) older than 30 days.`);
  }
}
