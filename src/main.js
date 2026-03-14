const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen,
  session,
  clipboard,
  desktopCapturer,
  nativeImage,
} = require("electron");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "../.env") });

// Enable Web Speech API & audio capture in Electron
app.commandLine.appendSwitch("enable-features", "WebRTC,WebSpeech");
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
app.commandLine.appendSwitch("disable-background-networking");

let assistantWindow;
let snippingWindow;
let currentSnipType = "ocr";

function createAssistantWindow() {
  const { width } = screen.getPrimaryDisplay().workAreaSize;

  assistantWindow = new BrowserWindow({
    width: 420,
    height: 620,
    x: width - 450,
    y: 40,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // 🔒 Exclude from all screen capture (Zoom, Meet, OBS, etc.)
  assistantWindow.setContentProtection(true);
  assistantWindow.loadFile(path.join(__dirname, "index.html"));
  assistantWindow.setAlwaysOnTop(true, "screen-saver", 1);
  assistantWindow.setSkipTaskbar(true);


  // macOS: appear over full-screen apps (e.g. Chrome in full-screen Space)
  if (process.platform === "darwin") {
    assistantWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    assistantWindow.setAlwaysOnTop(true, "screen-saver", 1);
  }
}

function createSnippingWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;

  snippingWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    enableLargerThanScreen: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  snippingWindow.setAlwaysOnTop(true, "screen-saver", 2);
  snippingWindow.setContentProtection(true);
  snippingWindow.loadFile(path.join(__dirname, "snipper.html"));
}

app.whenReady().then(() => {
  createAssistantWindow();
  createSnippingWindow();

  // Grant microphone & media permissions to the renderer
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      const allowed = [
        "media",
        "mediaKeySystem",
        "geolocation",
        "audioCapture",
        "videoCapture",
      ];
      callback(allowed.includes(permission));
    },
  );
});

// IPC: window controls
ipcMain.on("close-window", () => assistantWindow.hide());
ipcMain.on("minimize-window", () => assistantWindow.minimize());
ipcMain.on("set-always-on-top", (_, value) => {
  assistantWindow.setAlwaysOnTop(value, "screen-saver", 1);
});

// IPC: securely send API keys from main process (dotenv is loaded here)
ipcMain.handle("get-keys", () => ({
  geminiKey: process.env.GEMINI_API_KEY || "",
  tavilyKey: process.env.TAVILY_API_KEY || "",
  groqKey: process.env.GROQ_API_KEY || "",
  assemblyKey: process.env.ASSEMBLY_API_KEY || "",
  rapidKey: process.env.RAPID_API_KEY || "",
  openrouterKey: process.env.OPENROUTER_API_KEY || "",
  openrouterModel: process.env.OPENROUTER_MODEL || "",
  customLlmBaseUrl: process.env.CUSTOM_LLM_BASE_URL || "",
  customLlmApiKey: process.env.CUSTOM_LLM_API_KEY || "",
  customLlmModel: process.env.CUSTOM_LLM_MODEL || "",
  customLlmHeaderName: process.env.CUSTOM_LLM_HEADER_NAME || "",
  customLlmHeaderValue: process.env.CUSTOM_LLM_HEADER_VALUE || "",
  anthropicKey: process.env.ANTHROPIC_API_KEY || "",
  anthropicModel: process.env.ANTHROPIC_MODEL || "",
}));

ipcMain.on("copy-to-clipboard", (_, text) => {
  clipboard.writeText(text);
});

ipcMain.on("start-snip", (event, type = "ocr") => {
  currentSnipType = type;
  if (assistantWindow) assistantWindow.hide();
  if (snippingWindow) {
    snippingWindow.show();
  }
});

ipcMain.on("cancel-snip", () => {
  if (snippingWindow) {
    snippingWindow.hide();
  }
  if (assistantWindow) assistantWindow.show();
});

ipcMain.on("complete-snip", async (event, bounds) => {
  if (snippingWindow) {
    snippingWindow.hide();
  }

  // Small delay to ensure windows are hidden from OS capture
  await new Promise((resolve) => setTimeout(resolve, 150));

  try {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: screen.getPrimaryDisplay().size,
    });

    const primarySource = sources[0];
    if (primarySource) {
      const image = primarySource.thumbnail;
      const cropped = image.crop(bounds);
      if (currentSnipType === "image") {
        clipboard.writeImage(cropped);
        assistantWindow.webContents.send(
          "snip-image-captured",
          cropped.toDataURL(),
        );
      } else {
        assistantWindow.webContents.send("snip-captured", cropped.toDataURL());
      }
    }
  } catch (err) {
    console.error("Screen capture failed:", err);
  } finally {
    if (assistantWindow) assistantWindow.show();
  }
});

app.on("window-all-closed", (e) => e.preventDefault());
app.on("will-quit", () => globalShortcut.unregisterAll());
