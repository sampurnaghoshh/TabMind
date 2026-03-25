let allTabs = [];

// Helpers
function getDomain(url) {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url.slice(0, 30);
  }
}

function getFavLetter(url) {
  return getDomain(url)[0]?.toUpperCase() || "?";
}

function timeAgo(ts) {
  const d = Date.now() - ts;
  if (d < 60000) return "just now";
  if (d < 3600000) return Math.floor(d / 60000) + "m ago";
  if (d < 86400000) return Math.floor(d / 3600000) + "h ago";
  return Math.floor(d / 86400000) + "d ago";
}

function urlsMatch(savedUrl, currentUrl) {
  if (savedUrl === currentUrl) return true;
  try {
    const s = new URL(savedUrl);
    const c = new URL(currentUrl);
    if (s.hostname.includes("youtube.com") && c.hostname.includes("youtube.com")) {
      if (s.pathname === "/watch" && c.pathname === "/watch") {
        return s.searchParams.get("v") === c.searchParams.get("v");
      }
      return true;
    }
    return savedUrl === currentUrl;
  } catch {
    return savedUrl === currentUrl;
  }
}

function makeCard(t) {
  const card = document.createElement("div");
  card.className = "tab-card";

  const reasonText = t.reason || "no reason saved";

  card.innerHTML = `
    <div class="fav">${getFavLetter(t.url)}</div>
    <div class="tab-body">
      <div class="tab-reason" title="${reasonText.replace(/"/g, '&quot;')}">
        ${t.reason || '<span style="color:#aaa">no reason saved</span>'}
      </div>
      <div class="tab-domain">${getDomain(t.url)} · ${timeAgo(t.ts)}</div>
    </div>
    <div class="tab-actions">
      <button class="icon-btn open" title="Open">↗</button>
      <button class="icon-btn done" title="Mark done">✓</button>
      <button class="icon-btn del" title="Delete">×</button>
    </div>
  `;

  card.querySelector(".open").addEventListener("click", () => chrome.tabs.create({ url: t.url }));
  card.querySelector(".done").addEventListener("click", () => chrome.runtime.sendMessage({ type: "MARK_DONE", id: t.id }));
  card.querySelector(".del").addEventListener("click", () => chrome.runtime.sendMessage({ type: "DELETE_TAB", id: t.id }));

  return card;
}

function renderList(tabs) {
  const list = document.getElementById("tab-list");
  list.innerHTML = "";

  if (tabs.length === 0) {
    list.innerHTML = `<div class="empty">No open tabs with reasons yet.<br>Open a website and TabMind will ask why.</div>`;
    return;
  }

  tabs.forEach(t => list.appendChild(makeCard(t)));
}

function updateStats(tabs) {
  document.getElementById("s-open").textContent = tabs.length;
  document.getElementById("s-norea").textContent = tabs.filter(t => !t.reason).length;
  document.getElementById("s-done").textContent = 0;
}

async function loadAndRender() {
  const response = await chrome.runtime.sendMessage({ type: "GET_TABS" });
  let savedTabs = response ? response.tabs || [] : [];

  const openTabs = await chrome.tabs.query({});

  // Strict filter: only keep tabs that are currently open
  const visibleTabs = savedTabs.filter(saved => {
    return openTabs.some(open => open.url && urlsMatch(saved.url, open.url));
  });

  visibleTabs.sort((a, b) => b.ts - a.ts);

  // HARD CLEANUP: If any closed tabs were found, remove them from storage permanently
  if (visibleTabs.length !== savedTabs.length) {
    chrome.storage.local.set({ tabs: visibleTabs }, () => {
      console.log(`[TabMind] Cleaned up ${savedTabs.length - visibleTabs.length} closed tabs`);
    });
  }

  allTabs = visibleTabs;
  updateStats(visibleTabs);
  renderList(visibleTabs);
}

// Refresh when storage changes or popup opens
chrome.storage.onChanged.addListener((changes) => {
  if (changes.tabs) loadAndRender();
});

// Button handlers
document.getElementById("btn-ai").addEventListener("click", async () => {
  const key = await getApiKey();
  if (!key) {
    document.getElementById("key-prompt").classList.remove("hidden");
    return;
  }
  runAISort(key);
});

document.getElementById("save-key-btn").addEventListener("click", async () => {
  const k = document.getElementById("api-key-input").value.trim();
  if (k) {
    await chrome.storage.local.set({ apiKey: k });
    document.getElementById("key-prompt").classList.add("hidden");
    runAISort(k);
  }
});

document.getElementById("btn-pause").addEventListener("click", () => {
  chrome.storage.local.get(["paused"], (d) => {
    const newPaused = !d.paused;
    chrome.storage.local.set({ paused: newPaused });
    document.getElementById("btn-pause").textContent = newPaused ? "resume prompts" : "pause prompts";
  });
});

document.getElementById("btn-clear").addEventListener("click", () => {
  chrome.storage.local.set({ tabs: [] });
});

document.getElementById("btn-clear-all").addEventListener("click", () => {
  if (confirm("Clear ALL saved tabs?")) {
    chrome.storage.local.set({ tabs: [] });
  }
});

loadAndRender();