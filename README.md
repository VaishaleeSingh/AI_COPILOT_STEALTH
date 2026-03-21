# 🛡️ AI Copilot Stealth

An AI-powered interview assistant designed for absolute privacy. It is **completely invisible** to Zoom, Google Meet, Microsoft Teams, and all secondary screen-sharing/recording tools.

---

## ⚡ Features

### 🧠 Intelligence Engine (Multi-Provider Support)

- **Priority Routing**: Automatically routes queries through a multi-tiered fallback system:
  1. **Anthropic Claude**: Using `claude-sonnet-4-20250514` for high-reasoning answers.
  2. **Custom LLM / OpenRouter**: Support for any OpenAI-compatible endpoint (DeepSeek-R1, GPT-4o, etc.).
  3. **Groq**: Lightning-fast answers via `moonshotai/kimi-k2-instruct-0905`.
  4. **Gemini 2.0 Flash Lite**: Robust fallback for reliable, fast processing.
  5. **Tavily Search**: Real-time web search for the latest technical info or company-specific data.

### 🤖 Agentic Code Execution Flow (3-Agent System)

Detects coding questions and triggers a sophisticated iterative verification loop:
1. **Agent 1 (Test Generator)**: Analyzes the problem and generates 10 unique test cases (edge cases, typical cases, and problem examples). It writes it's own reference solution to verify these test outputs before proceeding.
2. **Agent 2 (Optimal Coder)**: Receives verified test cases and writes the most time-efficient solution (O(N), O(log N)) using the best-known algorithms for the specific problem.
3. **Agent 3 (The Validator)**: Executes the code in a sandbox (Judge0 / OneCompiler). If any tests fail, it sends the specific "Expected vs Got" error back to Agent 2 for an automatic fix. Repeats until all tests pass.

### 🎤 Advanced Voice & Audio Capture (Dual-Mode)

- **System Audio Capture**: Directly capture and transcribe system audio (the interviewer's voice) from Zoom, Teams, or Meet without external patches.
- **Voice Dictation**: Real-time transcription of your own speech for follow-up questions.
- **Live Transcript**: Displays a scrollable conversation transcript with speaker identification ("You" vs "Interviewer").
- **Auto-Answer**: Intelligently triggers AI generation when a question is detected in the live transcript.

### ✂️ Screen Snipping & Image Intelligence

- **Dual-Mode Snipping**:
  - **✂️ Snip (OCR)**: Drag over text, code, or diagrams; extracted text is automatically appended to your query box.
  - **📷 Image Capture**: Drag to copy an area to the clipboard. The app generates a **Native Thumbnail Preview** inside the interface.
- **Image Paste Support**: Paste any image from the clipboard into the question or code boxes. Thumbnail previews allow for visual reference of complex diagrams.
- **Fragment Appending**: Sequential captures are handled intelligently, appending new text to existing queries.

### 🛡️ Privacy & Stealth (Stealth Mode)

- **Content Protection**: Uses `setContentProtection(true)`—the app appears as a black box to all screen-sharing and recording software.
- **📍 Protected Protected Cursor**: Replaces the system pointer with a custom, capture-protected arrow. Your mouse movements and scrolls remain invisible to observers.
- **Automatic Hiding**: The app hides itself during the snipping process to ensure it never blocks capture or appears in OCR results.

### 🎨 Premium UI/UX

- **Glassmorphism Design**: A sleek, dark, premium interface with subtle animations.
- **Tabbed Workflow**: Seamlessly switch between **General Interview** (3-4 sentence spoken answers) and **Code Execution** (Agentic flow) modes.
- **Live Status Feed**: Real-time updates of agent activity (e.g., "Agent 2: Optimizing logic…").
- **Always-on-Top & Opacity**: Stays visible over interview windows with adjustable transparency to blend into your setup.

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
- API Keys for the providers you wish to use (add to `.env`).

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
CheatChat/
├── src/
│   ├── main.js           ← Electron main process (Stealth & IPC)
│   ├── preload.js        ← Secure bridge for UI
│   ├── renderer.js       ← App logic, event bindings & UI flow
│   ├── snipper.js        ← Drag & Draw logic for screen capture
│   ├── styles.css        ← Glassmorphism & premium UI theme
│   └── js/
│       ├── api.js        ← 3-Agent Flow & Multi-LLM logic
│       ├── voice.js      ← Dual-mode audio transcription
│       ├── ui.js         ← UI utilities & effects
│       └── prompts.js    ← Specialized system instructions
├── .env                  ← API Secret keys
└── README.md             ← Documentation
```
