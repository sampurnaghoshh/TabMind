// This is the brain of the extension.
// It runs silently in the background and listens for new tabs.

const alreadyAsked = new Set(); // tracks tabs we've already prompted

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Wait until the page is fully loaded
  if (changeInfo.status !== "complete") return;

  // Skip Chrome's own pages
  const url = tab.url || "";
  if (!url.startsWith("http")) return;

  // Don't ask twice for the same tab
  if (alreadyAsked.has(tabId)) return;
  alreadyAsked.add(tabId);

  // Check if the user has paused TabMind
  chrome.storage.local.get(["paused"], (data) => {
    if (data.paused) return;

    // Inject the "why did you open this?" overlay into the page
    chrome.scripting.executeScript({
      target: { tabId },
      func: injectOverlay,
      args: [url],
    });
  });
});

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  alreadyAsked.delete(tabId);
});

// Listen for messages from the overlay and popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SAVE_TAB") {
    chrome.storage.local.get(["tabs"], (data) => {
      const tabs = data.tabs || [];
      tabs.unshift({
        id: Date.now(),
        url: msg.url,
        reason: msg.reason,
        ts: Date.now(),
        done: false,
      });
      chrome.storage.local.set({ tabs: tabs.slice(0, 200) });
    });
    sendResponse({ ok: true });
  }

  if (msg.type === "GET_TABS") {
    chrome.storage.local.get(["tabs"], (data) => {
      sendResponse({ tabs: data.tabs || [] });
    });
    return true; // keeps the message channel open for async response
  }

  if (msg.type === "MARK_DONE") {
    chrome.storage.local.get(["tabs"], (data) => {
      const tabs = (data.tabs || []).map((t) =>
        t.id === msg.id ? { ...t, done: true } : t
      );
      chrome.storage.local.set({ tabs });
    });
  }

  if (msg.type === "DELETE_TAB") {
    chrome.storage.local.get(["tabs"], (data) => {
      const tabs = (data.tabs || []).filter((t) => t.id !== msg.id);
      chrome.storage.local.set({ tabs });
    });
  }
});

// -------------------------------------------------------
// This function gets INJECTED into the webpage.
// It builds the overlay entirely from scratch in plain JS.
// -------------------------------------------------------
function injectOverlay(url) {
  // Don't inject twice
  if (document.getElementById("tabmind-overlay")) return;

  // --- Styles ---
  const style = document.createElement("style");
  style.textContent = `
    #tabmind-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      background: rgba(0, 0, 0, 0.4);
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding-top: 100px;
      font-family: -apple-system, sans-serif;
      animation: tm-in 0.15s ease;
    }
    @keyframes tm-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    #tabmind-box {
      background: #ffffff;
      border-radius: 16px;
      padding: 24px 28px 20px;
      width: 420px;
      max-width: calc(100vw - 32px);
      box-shadow: 0 24px 64px rgba(0,0,0,0.22);
      animation: tm-up 0.2s cubic-bezier(.22,.68,0,1.15);
    }
    @keyframes tm-up {
      from { transform: translateY(12px); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }
    #tabmind-box .label {
      font-size: 10px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #999;
      margin-bottom: 8px;
    }
    #tabmind-box .question {
      font-size: 20px;
      font-weight: 700;
      color: #111;
      margin-bottom: 4px;
    }
    #tabmind-box .domain {
      font-size: 12px;
      color: #aaa;
      font-family: monospace;
      margin-bottom: 18px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #tabmind-box input {
      width: 100%;
      padding: 11px 14px;
      border: 1.5px solid #e0e0e0;
      border-radius: 10px;
      font-size: 15px;
      outline: none;
      box-sizing: border-box;
      transition: border-color 0.15s;
      font-family: inherit;
      color: #111;
    }
    #tabmind-box input:focus { border-color: #378ADD; }
    #tabmind-box input::placeholder { color: #ccc; }
    #tabmind-box .pills {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 10px;
    }
    #tabmind-box .pill {
      font-size: 11px;
      padding: 4px 12px;
      border-radius: 99px;
      border: 1px solid #e0e0e0;
      background: #f7f7f7;
      color: #555;
      cursor: pointer;
      transition: all 0.12s;
    }
    #tabmind-box .pill:hover {
      background: #378ADD;
      color: #fff;
      border-color: #378ADD;
    }
    #tabmind-box .actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 16px;
    }
    #tabmind-box .skip {
      font-size: 12px;
      color: #bbb;
      background: none;
      border: none;
      cursor: pointer;
      font-family: inherit;
    }
    #tabmind-box .skip:hover { color: #777; }
    #tabmind-box .save {
      background: #111;
      color: #fff;
      border: none;
      border-radius: 10px;
      padding: 10px 22px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      transition: opacity 0.12s;
    }
    #tabmind-box .save:hover { opacity: 0.75; }
  `;
  document.head.appendChild(style);

  // --- Get domain for display ---
  let domain = url;
  try { domain = new URL(url).hostname.replace("www.", ""); } catch {}

  // --- Smart suggestions based on domain ---
  const suggestions = getDomainSuggestions(domain);

  // --- Build the overlay HTML ---
  const overlay = document.createElement("div");
  overlay.id = "tabmind-overlay";
  overlay.innerHTML = `
    <div id="tabmind-box">
      <div class="label">tabmind</div>
      <div class="question">Why did you open this?</div>
      <div class="domain">${domain}</div>
      <input id="tm-reason" type="text" placeholder="e.g. check the pricing, read the article…" maxlength="120" />
      <div class="pills">
        ${suggestions.map(s => `<button class="pill">${s}</button>`).join("")}
      </div>
      <div class="actions">
        <button class="skip">skip (esc)</button>
        <button class="save">save →</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // --- Wire up interactions ---
  const input = overlay.querySelector("#tm-reason");
  const saveBtn = overlay.querySelector(".save");
  const skipBtn = overlay.querySelector(".skip");

  // Clicking a suggestion fills the input
  overlay.querySelectorAll(".pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      input.value = pill.textContent;
      input.focus();
    });
  });

  function dismiss() {
    overlay.remove();
    style.remove();
  }

  function save() {
    const reason = input.value.trim();
    if (!reason) {
      input.style.borderColor = "#e55";
      input.focus();
      return;
    }
    chrome.runtime.sendMessage({ type: "SAVE_TAB", url, reason });
    dismiss();
  }

  saveBtn.addEventListener("click", save);
  skipBtn.addEventListener("click", dismiss);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") save();
    if (e.key === "Escape") dismiss();
  });

  // Auto-dismiss after 25 seconds if ignored
  setTimeout(dismiss, 25000);

  // Focus input immediately
  setTimeout(() => input.focus(), 100);

  // --- Helper ---
  function getDomainSuggestions(d) {
    if (d.includes("youtube"))    return ["watch later", "reference for project", "listen while working"];
    if (d.includes("github"))     return ["check the repo", "review a PR", "read the README"];
    if (d.includes("stackoverflow")) return ["fix a bug", "understand this pattern"];
    if (d.includes("amazon") || d.includes("flipkart")) return ["buy this", "compare prices", "add to wishlist"];
    if (d.includes("reddit"))     return ["read this thread", "check comments"];
    if (d.includes("twitter") || d.includes("x.com")) return ["read this thread", "follow up on this"];
    if (d.includes("linkedin"))   return ["check profile", "apply for job", "follow up"];
    if (d.includes("figma"))      return ["review design", "grab assets", "give feedback"];
    if (d.includes("notion") || d.includes("docs.google")) return ["update this doc", "review notes"];
    return ["read later", "research this", "follow up", "buy this"];
  }
}