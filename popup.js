let allTabs = [];

function getDomain(url) {
  try { return new URL(url).hostname.replace("www.", ""); }
  catch { return url.slice(0, 30); }
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
  } catch { return savedUrl === currentUrl; }
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
  card.querySelector(".done").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "MARK_DONE", id: t.id });
    loadAndRender();
  });
  card.querySelector(".del").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "DELETE_TAB", id: t.id });
    loadAndRender();
  });
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

function renderGroups(groups, tabsById) {
  const list = document.getElementById("tab-list");
  list.innerHTML = "";

  const colors = {
    urgent:   "#e24b4a",
    today:    "#ba7517",
    work:     "#6b46c1",
    research: "#3b6d11",
    shopping: "#534ab7",
    reading:  "#0f6e56",
    watch:    "#854f0b",
    later:    "#9f8cd9",
    other:    "#9f8cd9",
  };

  groups.forEach(group => {
    const header = document.createElement("div");
    header.className = "group-header";
    const color = colors[group.key?.toLowerCase()] || "#9f8cd9";
    header.innerHTML = `
      <div class="group-dot" style="background:${color}"></div>
      ${group.label}
      <span style="margin-left:auto;font-weight:400;color:#bbb">${group.tabs.length}</span>
    `;
    list.appendChild(header);

    group.tabs.forEach(id => {
      const t = tabsById[id];
      if (t) list.appendChild(makeCard(t));
    });
  });

  // Also create real Chrome tab groups
  createChromeTabGroups(groups, tabsById);
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

  const visibleTabs = savedTabs.filter(saved => {
    return openTabs.some(open => open.url && urlsMatch(saved.url, open.url));
  });

  visibleTabs.sort((a, b) => b.ts - a.ts);

  if (visibleTabs.length !== savedTabs.length) {
    chrome.storage.local.set({ tabs: visibleTabs });
  }

  allTabs = visibleTabs;
  updateStats(visibleTabs);
  renderList(visibleTabs);
}

// ---- CHROME TAB GROUPS (like Microsoft Edge) ----
async function createChromeTabGroups(groups, tabsById) {
  const colorMap = {
    urgent:   "red",
    today:    "orange",
    work:     "blue",
    research: "green",
    shopping: "yellow",
    reading:  "cyan",
    watch:    "pink",
    later:    "grey",
    other:    "grey",
  };

  const chromeColors = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];

  const openChromeTabs = await chrome.tabs.query({ currentWindow: true });

  // Ungroup everything first for a clean slate
  const allTabIds = openChromeTabs.map(t => t.id);
  try { await chrome.tabs.ungroup(allTabIds); } catch (e) {}

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const color = colorMap[group.key?.toLowerCase()] || chromeColors[i % chromeColors.length];

    const matchingTabIds = [];

    for (const savedTabId of group.tabs) {
      const savedTab = tabsById[savedTabId];
      if (!savedTab) continue;

      const matchingChromeTab = openChromeTabs.find(ct =>
        ct.url && urlsMatch(savedTab.url, ct.url)
      );

      if (matchingChromeTab) {
        matchingTabIds.push(matchingChromeTab.id);
      }
    }

    if (matchingTabIds.length === 0) continue;

    try {
      const groupId = await chrome.tabs.group({ tabIds: matchingTabIds });
      await chrome.tabGroups.update(groupId, {
        title: group.label,
        color: color,
        collapsed: false,
      });
    } catch (e) {
      console.log("[TabMind] Group error:", e.message);
    }
  }
}

// ---- AI SORT ----
function getApiKey() {
  return new Promise(resolve => {
    chrome.storage.local.get(["apiKey"], d => resolve(d.apiKey || null));
  });
}

async function runAISort(key) {
  const openTabs = allTabs;
  if (openTabs.length === 0) {
    alert("No tabs to sort yet! Save some tab reasons first.");
    return;
  }

  document.getElementById("ai-loading").classList.remove("hidden");
  document.getElementById("tab-list").innerHTML = "";

  const tabSummaries = openTabs.map(t => ({
    id: t.id,
    domain: getDomain(t.url),
    reason: t.reason || "(no reason given)",
  }));

  const prompt = `You are helping someone manage their browser tabs.
Here are their open tabs as JSON:
${JSON.stringify(tabSummaries, null, 2)}

Group them into 3-5 meaningful groups by urgency and intent.
Always put the most time-sensitive tabs first.
Respond ONLY with valid JSON, no markdown, no explanation:
{
  "groups": [
    { "key": "urgent", "label": "Urgent — do now", "tabs": [<list of id numbers>] },
    { "key": "work", "label": "Work", "tabs": [<list of id numbers>] }
  ]
}`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error.message);

    const raw = data.choices[0].message.content.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(raw);

    const tabsById = {};
    openTabs.forEach(t => { tabsById[t.id] = t; });

    document.getElementById("ai-loading").classList.add("hidden");
    renderGroups(parsed.groups, tabsById);

  } catch (err) {
    document.getElementById("ai-loading").classList.add("hidden");
    document.getElementById("tab-list").innerHTML = `
      <div class="empty" style="color:#e74c3c">
        Error: ${err.message}<br>
        <small style="color:#9f8cd9">Check your Groq API key</small>
      </div>`;
  }
}

// ---- BUTTON HANDLERS ----
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

chrome.storage.onChanged.addListener((changes) => {
  if (changes.tabs) loadAndRender();
});

loadAndRender();