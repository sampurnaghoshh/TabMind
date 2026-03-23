let allTabs = [];

// --- Helpers ---
function getDomain(url) {
  try { return new URL(url).hostname.replace("www.", ""); }
  catch { return url.slice(0, 30); }
}
function getFavLetter(url) {
  return getDomain(url)[0]?.toUpperCase() || "?";
}
function timeAgo(ts) {
  const d = Date.now() - ts;
  if (d < 60000)    return "just now";
  if (d < 3600000)  return Math.floor(d / 60000) + "m ago";
  if (d < 86400000) return Math.floor(d / 3600000) + "h ago";
  return Math.floor(d / 86400000) + "d ago";
}

// --- Render a single tab card ---
function makeCard(t) {
  const card = document.createElement("div");
  card.className = "tab-card" + (t.done ? " done" : "");

  card.innerHTML = `
    <div class="fav">${getFavLetter(t.url)}</div>
    <div class="tab-body">
      <div class="tab-reason">${t.reason || '<span style="color:#ccc;font-weight:400">no reason saved</span>'}</div>
      <div class="tab-domain">${getDomain(t.url)} · ${timeAgo(t.ts)}</div>
    </div>
    <div class="tab-actions">
      <button class="icon-btn open"  title="open">↗</button>
      <button class="icon-btn done"  title="mark done">✓</button>
      <button class="icon-btn del"   title="delete">×</button>
    </div>
  `;

  card.querySelector(".open").addEventListener("click", () => {
    chrome.tabs.create({ url: t.url });
  });
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

// --- Render flat list ---
function renderList(tabs) {
  const list = document.getElementById("tab-list");
  list.innerHTML = "";

  const open = tabs.filter(t => !t.done);
  const done = tabs.filter(t => t.done);
  const all = [...open, ...done];

  if (all.length === 0) {
    list.innerHTML = `<div class="empty">No tabs saved yet.<br>Open a new tab and TabMind<br>will ask you why.</div>`;
    return;
  }

  all.forEach(t => list.appendChild(makeCard(t)));
}

// --- Render AI groups ---
function renderGroups(groups, tabsById) {
  const list = document.getElementById("tab-list");
  list.innerHTML = "";

  const colors = {
    urgent:   "#e24b4a",
    today:    "#ba7517",
    work:     "#185fa5",
    research: "#3b6d11",
    shopping: "#534ab7",
    reading:  "#0f6e56",
    watch:    "#854f0b",
    later:    "#888",
    other:    "#888",
  };

  groups.forEach(group => {
    const header = document.createElement("div");
    header.className = "group-header";
    const color = colors[group.key?.toLowerCase()] || "#888";
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
}

// --- Update stats bar ---
function updateStats(tabs) {
  document.getElementById("s-open").textContent  = tabs.filter(t => !t.done).length;
  document.getElementById("s-norea").textContent = tabs.filter(t => !t.done && !t.reason).length;
  document.getElementById("s-done").textContent  = tabs.filter(t => t.done).length;
}

// --- Load tabs from storage and render ---
function loadAndRender() {
  chrome.runtime.sendMessage({ type: "GET_TABS" }, ({ tabs }) => {
    allTabs = tabs || [];
    updateStats(allTabs);
    renderList(allTabs);
  });
}

// --- AI Sort ---
document.getElementById("btn-ai").addEventListener("click", async () => {
  const key = await getApiKey();

  if (!key) {
    document.getElementById("key-prompt").classList.remove("hidden");
    return;
  }

  runAISort(key);
});

// Save key and immediately sort
document.getElementById("save-key-btn").addEventListener("click", async () => {
  const k = document.getElementById("api-key-input").value.trim();
  if (!k) return;
  await chrome.storage.local.set({ apiKey: k });
  document.getElementById("key-prompt").classList.add("hidden");
  runAISort(k);
});

async function runAISort(key) {
  const openTabs = allTabs.filter(t => !t.done);
  if (openTabs.length === 0) return;

  // Show loading
  document.getElementById("ai-loading").classList.remove("hidden");
  document.getElementById("tab-list").innerHTML = "";

  // Build the prompt
  const tabSummaries = openTabs.map(t => ({
    id: t.id,
    domain: getDomain(t.url),
    reason: t.reason || "(no reason given)",
  }));

  const prompt = `You are helping someone manage their browser tabs.
Here are their open tabs as JSON:
${JSON.stringify(tabSummaries, null, 2)}

Group them into 3–5 meaningful groups by urgency and intent.
Always put the most time-sensitive tabs first.
Respond ONLY with valid JSON — no markdown, no explanation:
{
  "groups": [
    { "key": "urgent", "label": "Urgent — do now", "tabs": [<list of id numbers>] },
    { "key": "work",   "label": "Work",             "tabs": [<list of id numbers>] }
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

    // Build a lookup: tab id → tab object
    const tabsById = {};
    openTabs.forEach(t => { tabsById[t.id] = t; });

    document.getElementById("ai-loading").classList.add("hidden");
    renderGroups(parsed.groups, tabsById);

  } catch (err) {
    document.getElementById("ai-loading").classList.add("hidden");
    document.getElementById("tab-list").innerHTML = `
      <div class="empty" style="color:#e24b4a">
        Error: ${err.message}<br>
        <small>Check your Groq API key</small>
      </div>`;
  }
}

function getApiKey() {
  return new Promise(resolve => {
    chrome.storage.local.get(["apiKey"], d => resolve(d.apiKey || null));
  });
}

// --- Pause toggle ---
document.getElementById("btn-pause").addEventListener("click", () => {
  chrome.storage.local.get(["paused"], (d) => {
    const nowPaused = !d.paused;
    chrome.storage.local.set({ paused: nowPaused });
    document.getElementById("btn-pause").textContent = nowPaused ? "resume prompts" : "pause prompts";
  });
});

// --- Clear done ---
document.getElementById("btn-clear").addEventListener("click", () => {
  chrome.storage.local.get(["tabs"], (d) => {
    const tabs = (d.tabs || []).filter(t => !t.done);
    chrome.storage.local.set({ tabs });
    loadAndRender();
  });
});

// --- Init ---
loadAndRender();