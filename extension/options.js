/**
 * LinkSnap — Options page script
 * Handles: loading/saving settings, API key visibility toggle, key validation.
 */

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const apiKeyInput   = document.getElementById("api-key");
const modelSelect   = document.getElementById("model-select");
const saveBtn       = document.getElementById("save-btn");
const testBtn       = document.getElementById("test-btn");
const eyeBtn        = document.getElementById("eye-btn");
const statusBox     = document.getElementById("status-box");
const statusText    = document.getElementById("status-text");
const spinner       = document.getElementById("spinner");

// ─── Status helpers ───────────────────────────────────────────────────────────

function showStatus(type, text, loading = false) {
  statusBox.className       = `status ${type}`;
  statusText.textContent    = text;
  spinner.style.display     = loading ? "block" : "none";
}

function clearStatus() {
  statusBox.className = "status";
}

// ─── Load saved settings ──────────────────────────────────────────────────────

async function loadSettings() {
  const data = await chrome.storage.local.get(["apiKey", "model"]);
  if (data.apiKey)  apiKeyInput.value      = data.apiKey;
  if (data.model)   modelSelect.value      = data.model;
}

// ─── Save settings ────────────────────────────────────────────────────────────

async function saveSettings() {
  const key   = apiKeyInput.value.trim();
  const model = modelSelect.value;

  if (!key) {
    showStatus("error", "API key cannot be empty.");
    return;
  }
  if (!key.startsWith("sk-")) {
    showStatus("error", "Invalid key format — should start with sk-");
    return;
  }

  saveBtn.disabled = true;
  showStatus("loading", "Saving…", true);

  await chrome.storage.local.set({ apiKey: key, model });

  showStatus("success", "Settings saved!");
  saveBtn.disabled = false;

  // Auto-clear after 3 s
  setTimeout(clearStatus, 3000);
}

// ─── Test API key ─────────────────────────────────────────────────────────────

async function testApiKey() {
  const key = apiKeyInput.value.trim();

  if (!key) {
    showStatus("error", "Enter an API key first.");
    return;
  }

  testBtn.disabled = true;
  showStatus("loading", "Testing API key…", true);

  try {
    const resp = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });

    if (resp.ok) {
      const data = await resp.json();
      const count = data.data?.length ?? "?";
      showStatus("success", `Valid key — ${count} models available.`);
    } else if (resp.status === 401) {
      showStatus("error", "Invalid API key — authentication failed.");
    } else if (resp.status === 429) {
      showStatus("error", "Rate limited — the key works but quota is exhausted.");
    } else {
      showStatus("error", `Unexpected response: HTTP ${resp.status}`);
    }
  } catch (err) {
    showStatus("error", `Network error: ${err.message}`);
  } finally {
    testBtn.disabled = false;
  }
}

// ─── Eye toggle ───────────────────────────────────────────────────────────────

eyeBtn.addEventListener("click", () => {
  const isHidden = apiKeyInput.type === "password";
  apiKeyInput.type = isHidden ? "text" : "password";
  eyeBtn.textContent = isHidden ? "🙈" : "👁";
});

// ─── Wire buttons ─────────────────────────────────────────────────────────────

saveBtn.addEventListener("click", saveSettings);
testBtn.addEventListener("click", testApiKey);

// Allow Enter in the key field to save
apiKeyInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveSettings();
});

// ─── Init ─────────────────────────────────────────────────────────────────────

loadSettings();
