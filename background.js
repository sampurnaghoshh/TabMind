let alreadyAsked = new Set();
let snoozedDomains = new Set();

// Keep service worker alive
setInterval(() => {
  chrome.runtime.getPlatformInfo(() => {});
}, 25000);

async function loadStorage() {
  const data = await chrome.storage.local.get(["alreadyAsked", "snoozedDomains", "paused"]);
  if (data.alreadyAsked) alreadyAsked = new Set(data.alreadyAsked);
  if (data.snoozedDomains) snoozedDomains = new Set(data.snoozedDomains);
  return data.paused || false;
}

chrome.runtime.onInstalled.addListener(() => console.log("[TabMind] Installed / reloaded"));
chrome.runtime.onStartup.addListener(() => console.log("[TabMind] Service worker started"));

// Tab listener
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!tab.url || !tab.url.startsWith("http")) return;

  let domain = "";
  try {
    domain = new URL(tab.url).hostname.replace("www.", "");
  } catch (e) {}

  if (snoozedDomains.has(domain) || alreadyAsked.has(tabId)) return;

  const isPaused = await loadStorage();
  if (isPaused) return;

  alreadyAsked.add(tabId);
  chrome.storage.local.set({ alreadyAsked: Array.from(alreadyAsked).slice(-150) });

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: injectOverlay,
      args: [tab.url]
    });
  } catch (e) {}
});

chrome.tabs.onRemoved.addListener((tabId) => {
  alreadyAsked.delete(tabId);
});

// ====================== MESSAGE LISTENER ======================
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
      chrome.storage.local.set({ tabs: tabs.slice(0, 200) }, () => {
        chrome.storage.local.get(["tabs"], () => {});
      });
    });
    sendResponse({ ok: true });
  }

  if (msg.type === "MARK_DONE") {
    chrome.storage.local.get(["tabs"], (data) => {
      const tabs = (data.tabs || []).map(t =>
        t.id === msg.id ? { ...t, done: true } : t
      );
      chrome.storage.local.set({ tabs }, () => {
        chrome.storage.local.get(["tabs"], () => {});
      });
    });
  }

  if (msg.type === "DELETE_TAB") {
    chrome.storage.local.get(["tabs"], (data) => {
      const tabs = (data.tabs || []).filter(t => t.id !== msg.id);
      chrome.storage.local.set({ tabs }, () => {
        chrome.storage.local.get(["tabs"], () => {});
      });
    });
  }

  if (msg.type === "SNOOZE_DOMAIN") {
    chrome.storage.local.get(["snoozedDomains"], (data) => {
      const domains = data.snoozedDomains || [];
      if (!domains.includes(msg.domain)) domains.push(msg.domain);
      chrome.storage.local.set({ snoozedDomains: domains });
    });
    sendResponse({ ok: true });
  }

  if (msg.type === "GET_TABS") {
    chrome.storage.local.get(["tabs"], (data) => {
      sendResponse({ tabs: data.tabs || [] });
    });
    return true;
  }
});

// ====================== BADGE (Number of unsaved tabs) ======================
// Add this at the very end of background.js
async function updateBadge() {
  const data = await chrome.storage.local.get(["tabs"]);
  const tabs = data.tabs || [];
  const unsaved = tabs.filter(t => !t.done).length;

  if (unsaved > 0) {
    chrome.action.setBadgeText({ text: unsaved.toString() });
    chrome.action.setBadgeBackgroundColor({ color: "#0066ff" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}

// Update badge whenever tabs change
chrome.storage.onChanged.addListener((changes) => {
  if (changes.tabs) {
    updateBadge();
  }
});

// Initial badge when extension loads
updateBadge();