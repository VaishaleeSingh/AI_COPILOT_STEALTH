const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  closeWindow: () => ipcRenderer.send("close-window"),
  minimizeWindow: () => ipcRenderer.send("minimize-window"),
  setAlwaysOnTop: (val) => ipcRenderer.send("set-always-on-top", val),
  // Keys come securely from main process via IPC (dotenv is reliable there)
  getKeys: () => ipcRenderer.invoke("get-keys"),
  copyToClipboard: (text) => ipcRenderer.send("copy-to-clipboard", text),
  startSnip: (type = "ocr") => ipcRenderer.send("start-snip", type),
  completeSnip: (bounds) => ipcRenderer.send("complete-snip", bounds),
  cancelSnip: () => ipcRenderer.send("cancel-snip"),
  onSnipCaptured: (callback) =>
    ipcRenderer.on("snip-captured", (event, dataUrl) => callback(dataUrl)),
  onSnipImageCaptured: (callback) =>
    ipcRenderer.on("snip-image-captured", (event, dataUrl) =>
      callback(dataUrl),
    ),
  onOcrResult: (callback) =>
    ipcRenderer.on("ocr-result", (event, text) => callback(text)),
});
