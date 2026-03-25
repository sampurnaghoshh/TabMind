# TabMind

**TabMind** is a context-aware productivity extension for Chrome that captures user intent at the point of tab creation through proactive micro-prompting, while building a persistent, searchable knowledge base of browsing motivations and behaviors.

## ✨ Features

- **Instant Reason Prompt** - Beautiful lavender overlay appears when you open a new tab
- **Smart Saving** - Saves tab URL + your reason with timestamp
- **Clean Popup UI** - Modern pastel lavender design with stats
- **AI Sort** - Click "✦ AI sort" to intelligently group your open tabs (powered by Groq)
- **Real Tab Groups** - Creates actual Chrome tab groups with titles and colors (Edge-like experience)
- **Badge Counter** - Shows number of unsaved tabs on the extension icon
- **Control Options** - Pause prompts, clear done, and **Clear ALL tabs**
- **Snooze Domains** - Stop being asked on specific websites
- **Dark Mode Support**

## 📸 Current Look

- Soft lavender theme for both overlay and popup
- Clean card design with hover effects
- AI grouping feature available (requires Groq API key)

## 🚀 How to Install

1. Clone or download this repository
2. Open Chrome → go to `chrome://extensions/`
3. Enable **Developer mode**
4. Click **"Load unpacked"** and select the project folder

## 📋 How to Use

1. Open any website → the lavender overlay will ask **"Why did you open this tab?"**
2. Type your reason and click **Save**
3. Click the TabMind icon to view your saved tabs
4. Click **✦ AI sort** → Enter your Groq API key (free at console.groq.com) to let AI intelligently group your open tabs into real Chrome Tab Groups

## 🛠 Project Structure

TabMind/
├── manifest.json
├── background.js
├── content.js          # The reason overlay
├── popup.html
├── popup.js
├── popup.css           # Lavender Dream theme
└── README.md

## 🎨 Design

- Beautiful **Lavender Dream** pastel palette
- Smooth animations and modern UI
- Consistent light & dark mode support

## 🔮 Current Status

- Overlay appears reliably
- Basic saving is implemented
- Beautiful UI with lavender theme
- **AI Sort** feature is integrated (creates real tab groups like Microsoft Edge)
- Tab cleanup logic is being improved

## Future Improvements

- More reliable closed tab detection
- Better handling of YouTube tabs
- Export / Import saved reasons
- Advanced AI grouping options

---

**Made with ❤️ to help you browse more intentionally**