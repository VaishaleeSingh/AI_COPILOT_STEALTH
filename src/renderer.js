import { SYSTEM_PROMPTS } from "./js/prompts.js";
import { executeCodeAgentFlow, tavilyAnswer, performOCR } from "./js/api.js";
import {
  setQ,
  copyText,
  setOpacity,
  setStatus,
  setActiveAPI,
  clearAll,
  clearInputs,
  typewrite,
  escHtml,
} from "./js/ui.js";
import {
  startMic,
  stopMic,
  isMicActive,
  transcribeAudio,
  addFinal,
  updateInterim,
  clearTranscript,
} from "./js/voice.js";

let KEYS = {
  geminiKey: "",
  tavilyKey: "",
  groqKey: "",
  assemblyKey: "",
  rapidKey: "",
  openrouterKey: "",
  openrouterModel: "",
  customLlmBaseUrl: "",
  customLlmApiKey: "",
  customLlmModel: "",
  customLlmHeaderName: "",
  customLlmHeaderValue: "",
  anthropicKey: "",
  anthropicModel: "",
};
let currentMode = "general";
let autoAnswer = false;
let inputBeforeDictation = "";
let lastFocusedCodeBox = "exec-code"; // Default to exec-code

// Init
window.electronAPI?.getKeys?.().then((k) => {
  if (k) KEYS = { ...KEYS, ...k };
});

// Event Bindings
document.addEventListener("DOMContentLoaded", () => {
  // Titlebar
  document.querySelector(".wc:not(.red)").onclick = () =>
    window.electronAPI?.minimizeWindow();
  document.querySelector(".wc.red").onclick = () =>
    window.electronAPI?.closeWindow();

  // Voice
  document.getElementById("mic-btn").onclick = toggleMic;
  document.getElementById("auto-btn").onclick = toggleAutoAnswer;
  document.querySelector(".v-clear").onclick = clearTranscript;

  // Generate
  document.getElementById("gen-btn").onclick = generate;

  // Clear Inputs Only
  document.getElementById("clear-inputs-btn").onclick = clearInputs;

  // Snip
  document.getElementById("snip-btn").onclick = () => {
    window.electronAPI?.startSnip("ocr");
  };

  // Capture Image
  const captureImageBtn = document.getElementById("capture-image-btn");
  if (captureImageBtn) {
    captureImageBtn.onclick = () => {
      window.electronAPI?.startSnip("image");
    };
  }

  // Copy Buttons
  document.querySelectorAll(".copy-btn").forEach((btn) => {
    const target = btn.getAttribute("data-target");
    if (target) {
      btn.onclick = () => copyText(target, btn);
    }
  });

  // Custom Protected Cursor
  const customCursor = document.getElementById("cursor");
  document.addEventListener("mousemove", (e) => {
    if (customCursor) {
      customCursor.style.left = `${e.clientX}px`;
      customCursor.style.top = `${e.clientY}px`;
    }
  });

  // Hotkeys
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      generate();
    }
  });

  // Opacity
  const slider = document.getElementById("opacitySlider");
  slider.oninput = () => setOpacity(slider.value);

  // Quick Chips
  document.querySelectorAll(".chip").forEach((chip) => {
    const q = chip.getAttribute("data-q");
    if (q) {
      chip.onclick = () => setQ(q);
    }
  });

  // Tab Switcher
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.onclick = () => {
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      document
        .querySelectorAll(".mode-container")
        .forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
      const tabId = btn.getAttribute("data-tab");
      document
        .getElementById(`${tabId}-mode-container`)
        .classList.add("active");
    };
  });

  // Track focused code box
  const codeBoxes = ["exec-code", "exec-output-format", "exec-logic"];
  codeBoxes.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("focus", () => {
        lastFocusedCodeBox = id;
      });
    }
  });

  // Snip Capture Handler
  window.electronAPI?.onSnipCaptured?.(async (dataUrl) => {
    setStatus("● PROCESSING OCR…", "var(--green)");
    try {
      const text = await performOCR(dataUrl, KEYS);
      if (text) {
        const isCodeMode = document
          .getElementById("code-mode-container")
          ?.classList.contains("active");
        const qBox = isCodeMode
          ? document.getElementById(lastFocusedCodeBox)
          : document.getElementById("question");
        const currentVal = qBox.value.trim();
        qBox.value = currentVal ? `${currentVal}\n${text}` : text;
        inputBeforeDictation = qBox.value; // Sync for voice dictation
        setStatus("● OCR DONE ✓");

        if (autoAnswer) {
          setTimeout(() => generate(), 500);
        }
      } else {
        setStatus("● OCR: NO TEXT FOUND", "rgba(255,200,100,0.8)");
      }
    } catch (err) {
      console.error("OCR Error:", err);
      setStatus(`● OCR ERROR: ${err.message}`, "rgba(255,100,100,0.8)");
    }
  });

  // Helper to show image preview
  function showImagePreview(dataUrl) {
    const isCodeMode = document
      .getElementById("code-mode-container")
      ?.classList.contains("active");
    const containerId = isCodeMode
      ? lastFocusedCodeBox || "exec-code"
      : "question";

    const activeTextarea = document.getElementById(containerId);
    if (!activeTextarea) return;

    // Find or create preview container just after the textarea
    let previewContainer = activeTextarea.nextElementSibling;
    if (
      !previewContainer ||
      !previewContainer.classList.contains("img-preview")
    ) {
      previewContainer = document.createElement("div");
      previewContainer.className = "img-preview";
      activeTextarea.parentNode.insertBefore(
        previewContainer,
        activeTextarea.nextSibling,
      );
    }

    // Add image
    const wrapper = document.createElement("div");
    wrapper.className = "img-wrapper";

    const img = document.createElement("img");
    img.src = dataUrl;

    const removeBtn = document.createElement("button");
    removeBtn.innerHTML = "×";
    removeBtn.className = "img-remove";
    removeBtn.title = "Remove Image";
    removeBtn.onclick = () => {
      wrapper.remove();
      if (previewContainer.children.length === 0) {
        previewContainer.remove();
      }
    };

    wrapper.appendChild(img);
    wrapper.appendChild(removeBtn);
    previewContainer.appendChild(wrapper);
  }

  // Snip Image Capture Handler
  window.electronAPI?.onSnipImageCaptured?.((dataUrl) => {
    setStatus("● IMAGE COPIED ✓", "var(--green)");
    showImagePreview(dataUrl);
  });

  // Handle paste events to capture images
  document.addEventListener("paste", (e) => {
    if (e.clipboardData && e.clipboardData.files.length > 0) {
      const file = e.clipboardData.files[0];
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (event) => {
          showImagePreview(event.target.result);
        };
        reader.readAsDataURL(file);
      }
    }
  });
});

// Logic
function toggleAutoAnswer() {
  autoAnswer = !autoAnswer;
  const btn = document.getElementById("auto-btn");
  btn.classList.toggle("v-active", autoAnswer);
  btn.textContent = autoAnswer ? "⚡ Auto ON" : "⚡ Auto";
}

function toggleMic() {
  if (isMicActive()) {
    stopMic();
  } else {
    inputBeforeDictation = document.getElementById("question").value;
    startMic(async (base64, blob) => {
      await transcribeAudio(base64, blob, "You", KEYS, handleDictationResult);
      if (autoAnswer && document.getElementById("question").value.trim()) {
        setTimeout(() => generate(), 400);
      }
    });
  }
}

function handleDictationResult(transcript, isFinal, speaker = "You") {
  if (speaker === "You") {
    const isCodeMode = document
      .getElementById("code-mode-container")
      ?.classList.contains("active");
    const qBox = isCodeMode
      ? document.getElementById(lastFocusedCodeBox)
      : document.getElementById("question");
    const previous = inputBeforeDictation;
    qBox.value = previous ? `${previous} ${transcript}`.trim() : transcript;

    if (isFinal) {
      inputBeforeDictation = qBox.value;
      addFinal(speaker, transcript, autoAnswer, generate);
    } else {
      updateInterim(speaker, transcript);
    }
  } else {
    if (isFinal) {
      addFinal(speaker, transcript, autoAnswer, generate);
    } else {
      updateInterim(speaker, transcript);
    }
  }
}

async function generate() {
  const isCodeMode = document
    .getElementById("code-mode-container")
    ?.classList.contains("active");
  const ctx = document.getElementById("context").value.trim();

  let q = "";

  if (isCodeMode) {
    const execCode = document.getElementById("exec-code").value.trim();
    const execFormat = document
      .getElementById("exec-output-format")
      .value.trim();
    const execLogic = document.getElementById("exec-logic").value.trim();
    if (!execCode) {
      document.getElementById("exec-code").focus();
      return;
    }
    q = `EXECUTE CODE:\n${execCode}`;
    if (execFormat) q += `\n\nOUTPUT FORMAT:\n${execFormat}`;
    if (execLogic) q += `\n\nLOGIC OF CODE:\n${execLogic}`;
  } else {
    q = document.getElementById("question").value.trim();
    if (!q) {
      document.getElementById("question").focus();
      return;
    }
  }

  if (q.toUpperCase().includes("EXECUTE CODE") || isCodeMode) {
    return executeCodeAgentFlow(q, ctx, KEYS);
  }

  const btn = document.getElementById("gen-btn");
  btn.disabled = true;
  setStatus("● GENERATING…");

  const answerEl = document.getElementById("answer");
  answerEl.innerHTML =
    '<div class="ld"><span></span><span></span><span></span></div>';

  let text = "";
  let usedFallback = false;

  const userPrompt = ctx
    ? `Candidate background: ${ctx}\n\nInterview question: "${q}"\n\nGive a strong spoken answer in 3-4 sentences.`
    : `Interview question: "${q}"\n\nGive a strong spoken answer in 3-4 sentences.`;

  // 0. Anthropic Claude API (highest priority, different format)
  const anthropicKey = KEYS.anthropicKey || "";
  if (anthropicKey) {
    try {
      const anthropicModel = KEYS.anthropicModel || "claude-sonnet-4-20250514";
      setActiveAPI(`Calling Claude (${anthropicModel})…`, "rgba(180, 130, 255, 0.5)");
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: anthropicModel,
          max_tokens: 400,
          system: SYSTEM_PROMPTS[currentMode],
          messages: [{ role: "user", content: userPrompt }],
          temperature: 0.7,
        }),
      });
      const data = await res.json();
      if (res.ok && data.content?.[0]?.text) {
        text = data.content[0].text;
        setActiveAPI(`Claude (${anthropicModel})`, "rgba(180, 130, 255, 0.8)");
      } else {
        console.warn("Anthropic failed:", data.error?.message || `HTTP ${res.status}`);
      }
    } catch (e) {
      console.error("Anthropic Generation Error:", e);
    }
  }

  // 1. Custom provider (priority) > OpenRouter > Groq
  let llmUrl, llmModel, llmHeaders;
  const customBase = KEYS.customLlmBaseUrl || "";
  const openrouterKey = KEYS.openrouterKey || "";
  const groqKey = KEYS.groqKey || "";

  if (customBase) {
    llmUrl = `${customBase.replace(/\/+$/, "")}/chat/completions`;
    llmModel = KEYS.customLlmModel || "gpt-4o";
    llmHeaders = { "Content-Type": "application/json" };
    if (KEYS.customLlmApiKey) llmHeaders["Authorization"] = `Bearer ${KEYS.customLlmApiKey}`;
    if (KEYS.customLlmHeaderName && KEYS.customLlmHeaderValue) {
      llmHeaders[KEYS.customLlmHeaderName] = KEYS.customLlmHeaderValue;
    }
  } else if (openrouterKey) {
    llmUrl = "https://openrouter.ai/api/v1/chat/completions";
    llmModel = KEYS.openrouterModel || "deepseek/deepseek-r1";
    llmHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${openrouterKey}` };
  } else if (groqKey) {
    llmUrl = "https://api.groq.com/openai/v1/chat/completions";
    llmModel = "moonshotai/kimi-k2-instruct-0905";
    llmHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` };
  }

  if (!text && llmUrl) {
    try {
      const res = await fetch(llmUrl, {
        method: "POST",
        headers: llmHeaders,
        body: JSON.stringify({
          model: llmModel,
          messages: [
            { role: "system", content: SYSTEM_PROMPTS[currentMode] },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: 400,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        text = data.choices?.[0]?.message?.content || "";
        if (text) {
          const providerName = customBase ? "Custom" : openrouterKey ? "OpenRouter" : "Groq";
          setActiveAPI(`${providerName} (${llmModel})`, providerName === "Groq" ? "rgba(255, 180, 100, 0.8)" : "rgba(100, 200, 255, 0.8)");
        }
      }
    } catch (e) {
      console.error("LLM Generation Error:", e);
    }
  }

  // 2. Gemini
  const geminiKey = KEYS.geminiKey || "";
  if (!text && geminiKey) {
    try {
      setStatus("● FALLBACK: GENERATING (Gemini)…", "rgba(255,200,100,0.8)");
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: {
              parts: [{ text: SYSTEM_PROMPTS[currentMode] }],
            },
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            generationConfig: { maxOutputTokens: 400, temperature: 0.7 },
          }),
        },
      );
      const data = await res.json();
      if (!data.error) {
        text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (text) setActiveAPI("Gemini (flash-lite)", "rgba(100, 220, 180, 0.8)");
        usedFallback = true;
      }
    } catch (e) {
      console.error("Gemini Generation Error:", e);
    }
  }

  // 3. Tavily
  if (!text) {
    try {
      setStatus("● SEARCHING (Tavily)…", "rgba(120,200,255,0.8)");
      text = await tavilyAnswer(q, ctx, KEYS);
      if (text) setActiveAPI("Tavily (search)", "rgba(120, 200, 255, 0.8)");
      usedFallback = true;
    } catch (err) {
      answerEl.innerHTML = `<span style="color:rgba(255,100,100,0.7)">Both Gemini and Tavily failed: ${escHtml(err.message)}</span>`;
      setStatus("● ERROR", "rgba(255,100,100,0.8)");
      btn.disabled = false;
      return;
    }
  }

  typewrite(answerEl, text, () => {
    setStatus(usedFallback ? "● DONE ✓ (via fallback)" : "● DONE ✓");
  });
  btn.disabled = false;
}
