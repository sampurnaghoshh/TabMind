let alreadyShown = false;

function injectOverlay(url) {
  if (alreadyShown || document.getElementById("tabmind-overlay")) return;
  alreadyShown = true;

  let domain = url;
  try { domain = new URL(url).hostname.replace("www.", ""); } catch {}

  const suggestions = getDomainSuggestions(domain);

  const style = document.createElement("style");
  style.textContent = `
    #tabmind-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      background: rgba(0, 0, 0, 0.65);
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding-top: 90px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    #tabmind-box {
      background: #ffffff;
      border-radius: 20px;
      padding: 28px 32px 24px;
      width: 440px;
      max-width: 92vw;
      box-shadow: 0 25px 70px rgba(0, 0, 0, 0.35);
      animation: tm-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    @keyframes tm-pop {
      from { transform: scale(0.88) translateY(25px); opacity: 0; }
      to   { transform: scale(1) translateY(0); opacity: 1; }
    }

    /* Lavender Dark Mode */
    @media (prefers-color-scheme: dark) {
      #tabmind-box {
        background: #1f1f2e;
        color: #e0d4ff;
      }
      #tabmind-box input {
        background: #2a2a3a;
        border-color: #6b46c1;
        color: #e0d4ff;
      }
    }

    #tabmind-box .label {
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #9f8cd9;
      margin-bottom: 6px;
      font-weight: 600;
    }
    #tabmind-box .question {
      font-size: 22px;
      font-weight: 700;
      color: #2c2c54;
      margin-bottom: 8px;
    }
    @media (prefers-color-scheme: dark) {
      #tabmind-box .question { color: #e0d4ff; }
    }
    #tabmind-box .domain {
      font-size: 13px;
      color: #9f8cd9;
      font-family: monospace;
      margin-bottom: 22px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #tabmind-box input {
      width: 100%;
      padding: 14px 16px;
      border: 2px solid #d4c3ff;
      border-radius: 12px;
      font-size: 16px;
      outline: none;
      box-sizing: border-box;
      transition: all 0.2s;
    }
    #tabmind-box input:focus {
      border-color: #8b5cf6;
      box-shadow: 0 0 0 4px rgba(139, 92, 246, 0.15);
    }
    #tabmind-box .pills {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 14px 0 20px;
    }
    #tabmind-box .pill {
      font-size: 13px;
      padding: 7px 16px;
      border-radius: 999px;
      border: 1px solid #d4c3ff;
      background: #f0e6ff;
      color: #5a4a8a;
      cursor: pointer;
      transition: all 0.15s;
    }
    #tabmind-box .pill:hover {
      background: #8b5cf6;
      color: white;
      border-color: #8b5cf6;
      transform: translateY(-1px);
    }
    #tabmind-box .actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    #tabmind-box .skip {
      font-size: 14px;
      color: #9f8cd9;
      background: none;
      border: none;
      cursor: pointer;
    }
    #tabmind-box .skip:hover { color: #6b46c1; }
    #tabmind-box .save {
      background: linear-gradient(135deg, #8b5cf6, #a78bfa);
      color: white;
      border: none;
      border-radius: 12px;
      padding: 12px 28px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
    }
    #tabmind-box .save:hover { opacity: 0.9; }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement("div");
  overlay.id = "tabmind-overlay";
  overlay.innerHTML = `
    <div id="tabmind-box">
      <div class="label">TABMIND</div>
      <div class="question">Why did you open this tab?</div>
      <div class="domain">${domain}</div>
      <input id="tm-reason" type="text" placeholder="Be honest... (e.g. compare prices, research, listen while working)" maxlength="160" />
      <div class="pills">
        ${suggestions.map(s => `<button class="pill">${s}</button>`).join("")}
      </div>
      <div class="actions">
        <div>
          <button class="skip">skip</button>
          <button id="snooze" class="skip" style="margin-left:18px;">snooze this site</button>
        </div>
        <button class="save">Save & Continue</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = overlay.querySelector("#tm-reason");
  const saveBtn = overlay.querySelector(".save");
  const skipBtn = overlay.querySelector(".skip");
  const snoozeBtn = overlay.querySelector("#snooze");

  overlay.querySelectorAll(".pill").forEach(p => {
    p.addEventListener("click", () => {
      input.value = p.textContent;
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
      input.style.borderColor = "#f44";
      input.focus();
      return;
    }
    chrome.runtime.sendMessage({ type: "SAVE_TAB", url, reason });
    dismiss();
  }

  saveBtn.addEventListener("click", save);
  skipBtn.addEventListener("click", dismiss);
  snoozeBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "SNOOZE_DOMAIN", domain });
    dismiss();
  });

  input.addEventListener("keydown", e => {
    if (e.key === "Enter") save();
    if (e.key === "Escape") dismiss();
  });

  setTimeout(dismiss, 35000);
  setTimeout(() => input.focus(), 200);
}

function getDomainSuggestions(d) {
  if (d.includes("youtube")) return ["listen while working", "watch later", "reference"];
  if (d.includes("github")) return ["check repo", "review PR", "read README"];
  if (d.includes("amazon") || d.includes("flipkart")) return ["buy this", "compare prices", "wishlist"];
  if (d.includes("reddit")) return ["read thread", "check comments"];
  return ["research", "read later", "follow up", "quick check"];
}

// Auto trigger
setTimeout(() => injectOverlay(location.href), 1500);