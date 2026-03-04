/**
 * LinkSnap — Content script
 * Injected into every page. Provides getPageContent() which intelligently
 * extracts the main body text and strips navigation/boilerplate noise.
 */

/**
 * Extract the main readable text from the current page.
 * Priority: <article>, <main>, then fallback to document.body.
 * Returns at most 5000 characters.
 *
 * @returns {string}
 */
function getPageContent() {
  // Tags that contain noise, not content
  const NOISE_TAGS = new Set([
    "script", "style", "noscript", "nav", "header", "footer",
    "aside", "form", "iframe", "svg", "button", "select",
    "input", "textarea", "dialog", "menu",
  ]);

  // Clone a node and strip noise tags in-place
  function stripNoise(node) {
    const clone = node.cloneNode(true);
    clone.querySelectorAll(Array.from(NOISE_TAGS).join(",")).forEach((el) => el.remove());
    return clone;
  }

  // Prefer semantic content containers
  const CANDIDATES = ["article", "main", "[role='main']", ".post-content", ".article-body", ".entry-content"];

  let root = null;
  for (const selector of CANDIDATES) {
    const el = document.querySelector(selector);
    if (el && el.innerText.trim().length > 200) {
      root = el;
      break;
    }
  }

  // Fallback: use the whole body
  if (!root) root = document.body;

  const cleaned = stripNoise(root);

  // Collapse whitespace and trim
  const text = (cleaned.innerText || cleaned.textContent || "")
    .replace(/\n{3,}/g, "\n\n")   // collapse excessive blank lines
    .replace(/[ \t]{2,}/g, " ")   // collapse horizontal whitespace
    .trim();

  return text.slice(0, 5000);
}

// Listen for messages from the popup / background requesting page content
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "GET_PAGE_CONTENT") {
    sendResponse({ content: getPageContent() });
  }
  // Return true to keep the channel open for async use (not needed here but safe)
  return false;
});
