/**
 * LinkSnap — Options page script
 * Multi-provider support: OpenAI, Anthropic, OpenRouter, Groq, Ollama, Custom.
 */

// ─── Provider model lists ──────────────────────────────────────────────────────

const MODEL_CONFIGS = {
  openai: [
    { group: "Flagship", models: [
      { value: "gpt-4.1",      label: "gpt-4.1" },
      { value: "gpt-4.1-mini", label: "gpt-4.1-mini" },
      { value: "gpt-4.1-nano", label: "gpt-4.1-nano" },
      { value: "gpt-4o",       label: "gpt-4o" },
      { value: "gpt-4o-mini",  label: "gpt-4o-mini — Recommended" },
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
      { value: "claude-opus-4-5",   label: "claude-opus-4-5" },
      { value: "claude-sonnet-4-6", label: "claude-sonnet-4-6 — Recommended" },
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
      { value: "openai/gpt-4o-mini", label: "openai/gpt-4o-mini — Recommended" },
    ]},
    { group: "Anthropic", models: [
      { value: "anthropic/claude-opus-4-5",   label: "anthropic/claude-opus-4-5" },
      { value: "anthropic/claude-sonnet-4-6", label: "anthropic/claude-sonnet-4-6" },
    ]},
    { group: "Meta (Free)", models: [
      { value: "meta-llama/llama-3.3-70b-instruct", label: "meta-llama/llama-3.3-70b-instruct — Free" },
      { value: "meta-llama/llama-3.1-8b-instruct",  label: "meta-llama/llama-3.1-8b-instruct — Free" },
    ]},
    { group: "Google", models: [
      { value: "google/gemini-2.0-flash", label: "google/gemini-2.0-flash" },
      { value: "google/gemini-flash-1.5", label: "google/gemini-flash-1.5" },
    ]},
    { group: "Mistral", models: [
      { value: "mistralai/mistral-large",        label: "mistralai/mistral-large" },
      { value: "mistralai/mistral-7b-instruct",  label: "mistralai/mistral-7b-instruct — Free" },
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
      { value: "llama-3.3-70b-versatile", label: "llama-3.3-70b-versatile — Recommended" },
      { value: "llama-3.1-8b-instant",    label: "llama-3.1-8b-instant" },
    ]},
    { group: "Other", models: [
      { value: "mixtral-8x7b-32768",            label: "mixtral-8x7b-32768" },
      { value: "gemma2-9b-it",                  label: "gemma2-9b-it" },
      { value: "deepseek-r1-distill-llama-70b", label: "deepseek-r1-distill-llama-70b" },
    ]},
  ],

  ollama: [
    { group: "Local Models", models: [
      { value: "llama3.2",    label: "llama3.2" },
      { value: "llama3.1",    label: "llama3.1" },
      { value: "mistral",     label: "mistral" },
      { value: "deepseek-r1", label: "deepseek-r1" },
      { value: "qwen2.5",     label: "qwen2.5" },
      { value: "phi3",        label: "phi3" },
    ]},
  ],

  custom: [], // no predefined models — user enters model name manually
};

// Per-provider metadata: key placeholder, hint HTML, default model, model hint
const PROVIDER_META = {
  openai: {
    placeholder: "sk-...",
    hint: 'Get yours at <a href="https://platform.openai.com/api-keys" target="_blank">platform.openai.com/api-keys</a>. Stored only in your browser\'s local storage.',
    defaultModel: "gpt-4o-mini",
    modelHint: "gpt-4o-mini offers the best balance of quality and cost for summarization.",
  },
  anthropic: {
    placeholder: "sk-ant-...",
    hint: 'Get yours at <a href="https://console.anthropic.com/keys" target="_blank">console.anthropic.com/keys</a>. Stored only in your browser\'s local storage.',
    defaultModel: "claude-sonnet-4-6",
    modelHint: "claude-sonnet-4-6 is the recommended model for quality and speed.",
  },
  openrouter: {
    placeholder: "sk-or-...",
    hint: 'Get yours at <a href="https://openrouter.ai/keys" target="_blank">openrouter.ai/keys</a>. Supports 200+ models via a unified OpenAI-compatible API.',
    defaultModel: "openai/gpt-4o-mini",
    modelHint: "Models marked \u201cFree\u201d have no per-request cost on OpenRouter.",
  },
  groq: {
    placeholder: "gsk_...",
    hint: 'Get yours at <a href="https://console.groq.com/keys" target="_blank">console.groq.com/keys</a>. Free tier available with extremely fast inference.',
    defaultModel: "llama-3.3-70b-versatile",
    modelHint: "llama-3.3-70b-versatile is free and among the fastest available.",
  },
  ollama: {
    placeholder: "",
    hint: 'No API key needed. Start with <code>ollama serve</code>, then pull a model: <code>ollama pull llama3.2</code>.',
    defaultModel: "llama3.2",
    modelHint: "Models run locally on your machine. Pull them first with ollama pull.",
  },
  custom: {
    placeholder: "Your API key",
    hint: "API key for your custom OpenAI-compatible endpoint. Leave blank if the endpoint does not require authentication.",
    defaultModel: "",
    modelHint: "",
  },
};

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const providerSelect       = document.getElementById("provider-select");
const apiKeyField          = document.getElementById("api-key-field");
const apiKeyInput          = document.getElementById("api-key");
const apiKeyHint           = document.getElementById("api-key-hint");
const eyeBtn               = document.getElementById("eye-btn");
const customEndpointField  = document.getElementById("custom-endpoint-field");
const customEndpointInput  = document.getElementById("custom-endpoint");
const modelField           = document.getElementById("model-field");
const modelSelect          = document.getElementById("model-select");
const modelHint            = document.getElementById("model-hint");
const ollamaModelField     = document.getElementById("ollama-model-field");
const ollamaModelInput     = document.getElementById("ollama-model");
const customModelField     = document.getElementById("custom-model-field");
const customModelInput     = document.getElementById("custom-model");
const saveBtn              = document.getElementById("save-btn");
const testBtn              = document.getElementById("test-btn");
const statusBox            = document.getElementById("status-box");
const statusText           = document.getElementById("status-text");
const spinner              = document.getElementById("spinner");

// ─── Status helpers ───────────────────────────────────────────────────────────

function showStatus(type, text, loading = false) {
  statusBox.className    = `status ${type}`;
  statusText.textContent = text;
  spinner.style.display  = loading ? "block" : "none";
}

function clearStatus() {
  statusBox.className = "status";
}

// ─── Populate model dropdown ──────────────────────────────────────────────────

function populateModels(provider) {
  const groups = MODEL_CONFIGS[provider] || [];
  modelSelect.innerHTML = "";

  if (groups.length === 0) return;

  groups.forEach(({ group, models }) => {
    const optgroup = document.createElement("optgroup");
    optgroup.label = group;
    models.forEach(({ value, label }) => {
      const opt = document.createElement("option");
      opt.value       = value;
      opt.textContent = label;
      optgroup.appendChild(opt);
    });
    modelSelect.appendChild(optgroup);
  });
}

// ─── Update UI for selected provider ─────────────────────────────────────────

function onProviderChange() {
  const provider = providerSelect.value;
  const meta     = PROVIDER_META[provider];

  // API key field visibility and labels
  if (provider === "ollama") {
    apiKeyField.style.display = "none";
  } else {
    apiKeyField.style.display = "";
    apiKeyInput.placeholder   = meta.placeholder;
    apiKeyHint.innerHTML      = meta.hint;
  }

  // Custom endpoint field
  customEndpointField.style.display = (provider === "custom") ? "" : "none";

  // Model select vs custom model text input
  if (provider === "custom") {
    modelField.style.display       = "none";
    customModelField.style.display = "";
  } else {
    modelField.style.display       = "";
    customModelField.style.display = "none";
    populateModels(provider);
    modelHint.textContent = meta.modelHint;
  }

  // Ollama custom model override
  ollamaModelField.style.display = (provider === "ollama") ? "" : "none";
}

// ─── Load saved settings ──────────────────────────────────────────────────────

async function loadSettings() {
  const data = await chrome.storage.local.get([
    "provider", "apiKey", "model", "customEndpoint", "ollamaModel",
  ]);

  if (data.provider) providerSelect.value = data.provider;

  // Rebuild UI for the stored provider first, then fill values
  onProviderChange();

  if (data.apiKey) apiKeyInput.value = data.apiKey;

  if (data.model) {
    if (providerSelect.value === "custom") {
      customModelInput.value = data.model;
    } else {
      modelSelect.value = data.model;
    }
  }

  if (data.customEndpoint) customEndpointInput.value = data.customEndpoint;
  if (data.ollamaModel)    ollamaModelInput.value    = data.ollamaModel;
}

// ─── Save settings ────────────────────────────────────────────────────────────

async function saveSettings() {
  const provider       = providerSelect.value;
  const key            = apiKeyInput.value.trim();
  const customEndpoint = customEndpointInput.value.trim();
  const ollamaModel    = ollamaModelInput.value.trim();
  const model          = (provider === "custom")
    ? customModelInput.value.trim()
    : modelSelect.value;

  if (provider !== "ollama" && !key) {
    showStatus("error", "API key cannot be empty.");
    return;
  }
  if (provider === "custom" && !customEndpoint) {
    showStatus("error", "Endpoint URL cannot be empty.");
    return;
  }

  saveBtn.disabled = true;
  showStatus("loading", "Saving\u2026", true);

  await chrome.storage.local.set({ provider, apiKey: key, model, customEndpoint, ollamaModel });

  showStatus("success", "Settings saved!");
  saveBtn.disabled = false;
  setTimeout(clearStatus, 3000);
}

// ─── Test connection ──────────────────────────────────────────────────────────

async function testConnection() {
  const provider       = providerSelect.value;
  const key            = apiKeyInput.value.trim();
  const customEndpoint = customEndpointInput.value.trim();

  if (provider !== "ollama" && !key) {
    showStatus("error", "Enter an API key first.");
    return;
  }

  testBtn.disabled = true;
  showStatus("loading", "Testing connection\u2026", true);

  try {
    if (provider === "anthropic") {
      // Anthropic: POST /v1/messages with a minimal test message
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type":      "application/json",
          "x-api-key":         key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model:      "claude-haiku-3-5",
          max_tokens: 1,
          messages:   [{ role: "user", content: "Hi" }],
        }),
      });

      if (resp.ok || resp.status === 529) {
        showStatus("success", "Anthropic API key is valid.");
      } else if (resp.status === 401 || resp.status === 403) {
        showStatus("error", "Invalid API key \u2014 authentication failed.");
      } else if (resp.status === 429) {
        showStatus("success", "Key is valid (rate limited, but authenticated).");
      } else {
        showStatus("error", `Unexpected response: HTTP ${resp.status}`);
      }

    } else if (provider === "ollama") {
      // Ollama: GET /api/tags to list installed models
      const resp = await fetch("http://localhost:11434/api/tags");
      if (resp.ok) {
        const data  = await resp.json();
        const count = data.models?.length ?? 0;
        showStatus("success", `Ollama is running \u2014 ${count} model${count !== 1 ? "s" : ""} installed.`);
      } else {
        showStatus("error", `Ollama responded with HTTP ${resp.status}`);
      }

    } else {
      // OpenAI-compatible: GET /v1/models with Bearer auth
      let endpoint;
      const headers = { Authorization: `Bearer ${key}` };

      if (provider === "openai") {
        endpoint = "https://api.openai.com/v1/models";
      } else if (provider === "openrouter") {
        endpoint           = "https://openrouter.ai/api/v1/models";
        headers["HTTP-Referer"] = "https://linksnap.ext";
        headers["X-Title"]      = "LinkSnap";
      } else if (provider === "groq") {
        endpoint = "https://api.groq.com/openai/v1/models";
      } else {
        // custom
        const base = customEndpoint || "http://localhost:8080/v1";
        endpoint   = base.replace(/\/$/, "") + "/models";
      }

      const resp = await fetch(endpoint, { headers });

      if (resp.ok) {
        const data  = await resp.json();
        const count = data.data?.length ?? "?";
        showStatus("success", `Valid key \u2014 ${count} models available.`);
      } else if (resp.status === 401 || resp.status === 403) {
        showStatus("error", "Invalid API key \u2014 authentication failed.");
      } else if (resp.status === 429) {
        showStatus("success", "Key is valid (rate limited, but authenticated).");
      } else {
        showStatus("error", `Unexpected response: HTTP ${resp.status}`);
      }
    }

  } catch (err) {
    if (provider === "ollama") {
      showStatus("error", "Cannot connect to Ollama. Is it running? Try: ollama serve");
    } else {
      showStatus("error", `Network error: ${err.message}`);
    }
  } finally {
    testBtn.disabled = false;
  }
}

// ─── Eye toggle ───────────────────────────────────────────────────────────────

eyeBtn.addEventListener("click", () => {
  const isHidden    = apiKeyInput.type === "password";
  apiKeyInput.type  = isHidden ? "text" : "password";
  eyeBtn.textContent = isHidden ? "\uD83D\uDE48" : "\uD83D\uDC41";
});

// ─── Wire events ──────────────────────────────────────────────────────────────

providerSelect.addEventListener("change", onProviderChange);
saveBtn.addEventListener("click", saveSettings);
testBtn.addEventListener("click", testConnection);
apiKeyInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveSettings();
});

// ─── Init ─────────────────────────────────────────────────────────────────────

loadSettings();
