# 🛡️ AI Copilot Stealth

An AI-powered interview assistant designed for absolute privacy. It is **completely invisible** to Zoom, Google Meet, Microsoft Teams, and all secondary screen-sharing/recording tools.

---

## ⚡ Features

### 🧠 Intelligence Engine (Groq & Gemini)

- **Multi-tiered AI**: Prioritizes **Groq** (Llama 3.3 / Kimi) for lightning-fast answers, with **Gemini 1.5/2.0** and **Tavily Search** as robust fallbacks.
- **Execute Code**: Detects coding questions and uses an Agentic flow to write, test, and verify solutions via RapidAPI/OneCompiler.
- **Voice Dictation**: Real-time transcription of your voice and system audio to capture questions as they are being asked.

### ✂️ Screen Snipping & Image Capture

- **Dual-Mode Snipping**:
  - **✂️ Snip (OCR)**: Drag over text, code, or diagrams; extracted text is automatically appended to your interview query.
  - **📷 Image Capture**: Drag over any area to copy the exact image to your system clipboard instantly.
- **Image Paste Support**: Paste any image from your clipboard into the question/code boxes. The app will generate a native thumbnail preview for visual reference.
- **Fragment Appending**: Capture different parts of a long question sequentially; the app intelligently appends them for a complete query.
- **Auto-Hide Capture**: The app automatically hides during screen capture to ensure it never appears in its own results or blocks your view.

### 🛡️ Privacy & Stealth (Stealth Mode)

- **Overlay Protection**: Uses `setContentProtection(true)` to ensure the app window is a "black box" to screen-sharing and recording software.
- **📍 Protected Protected Cursor**: Replaces the system mouse pointer with a custom, capture-protected arrow. **Others cannot see your mouse movements or scrolling**.
- **Auto-Hide Capture**: The app automatically hides during screen capture to ensure it never appears in its own results or blocks your view.

### 🎨 Premium UI/UX

- **Modern Aesthetics**: Glassmorphism design with a dark, premium theme.
- **Always-on-Top**: Stays visible above all interview windows.
- **Opacity Control**: Easily adjust transparency to blend into your environment.
- **Auto-Generate**: Automatically triggered answers as soon as text is captured or dictated.

---

## ⌨️ Shortcuts

| Action              | Control                        |
| ------------------- | ------------------------------ |
| **Generate Answer** | `Enter`                        |
| **New Line in Box** | `Shift + Enter`                |
| **Snipping Tool**   | `Alt + S` (Trigger via Button) |
| **Show/Hide App**   | `Alt + Space`                  |
| **Minimize App**    | `-` button                     |

---

## 🚀 Getting Started

### Prerequisites

- Node.js installed.
- API Keys for Groq, Gemini, Tavily, and RapidAPI (add to `.env`).

### Installation

```bash
npm install
npm start
```

### Build (Production)

```bash
npm run build
```

Packaged app will be in `out/interview-app-win32-x64`.

---

## 📁 Project Structure

```
interview-app/
├── src/
│   ├── main.js       ← Electron main process (Stealth & IPC)
│   ├── preload.js    ← Secure bridge for UI
│   ├── renderer.js   ← App logic & events
│   ├── snipper.html  ← Snipping overlay
│   ├── snipper.js    ← Drag & Draw logic
│   └── js/
│       ├── api.js    ← AI (Groq/Gemini/OCR) logic
│       ├── voice.js  ← Audio transcription
│       └── ui.js     ← Interface utilities
├── .env              ← API Secret keys
└── README.md         ← You are here
```
# CheatChat
