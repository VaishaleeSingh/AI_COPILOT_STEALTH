import { SYSTEM_PROMPTS, RESUME } from "./js/prompts.js";
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
  refreshMicList,
  startSystemAudio,
  stopSystemAudio,
  isSystemActive,
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
  document.getElementById("sys-btn").onclick = toggleSystemAudio;
  document.getElementById("auto-btn").onclick = toggleAutoAnswer;
  document.querySelector(".v-clear").onclick = clearTranscript;

  const micSelectCustom = document.getElementById("mic-select-custom");
  if (micSelectCustom) {
    refreshMicList().then(() => {
      const savedMic = localStorage.getItem("selectedDeviceId");
      if (savedMic) {
        const option = micSelectCustom.querySelector(`.options-container div[data-value="${savedMic}"]`);
        if (option) {
          micSelectCustom.querySelector(".selected-option").textContent = option.textContent;
          micSelectCustom.setAttribute("data-value", savedMic);
        }
      }
    });

    micSelectCustom.onclick = (e) => {
      e.stopPropagation();
      micSelectCustom.querySelector(".options-container").classList.toggle("show");
    };
  }

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

  // Custom Dropdowns (Global Click to Close)
  document.addEventListener("click", () => {
    document.querySelectorAll(".options-container").forEach((el) => el.classList.remove("show"));
  });

  // Language Custom Dropdown
  const langSelectCustom = document.getElementById("lang-select-custom");
  if (langSelectCustom) {
    langSelectCustom.onclick = (e) => {
      e.stopPropagation();
      langSelectCustom.querySelector(".options-container").classList.toggle("show");
    };

    langSelectCustom.querySelectorAll(".options-container div").forEach((opt) => {
      opt.onclick = (e) => {
        e.stopPropagation();
        const val = opt.getAttribute("data-value");
        langSelectCustom.querySelector(".selected-option").textContent = opt.textContent;
        langSelectCustom.setAttribute("data-value", val);
        langSelectCustom.querySelector(".options-container").classList.remove("show");
      };
    });
  }

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

function toggleSystemAudio() {
  if (isSystemActive()) {
    stopSystemAudio();
  } else {
    startSystemAudio(async (base64, blob) => {
      await transcribeAudio(
        base64,
        blob,
        "Interviewer",
        KEYS,
        handleDictationResult,
      );
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

// Detect if the question is asking for a self-introduction
function isIntroductionQuestion(q) {
  const lower = q.toLowerCase();
  const patterns = [
    "tell me about yourself",
    "introduce yourself",
    "tell us about yourself",
    "walk me through your background",
    "walk us through your background",
    "give me a brief introduction",
    "give us a brief introduction",
    "can you introduce yourself",
    "who are you",
    "say something about yourself",
    "tell me a little about yourself",
    "brief intro",
    "your introduction",
    "self introduction",
    "your background",
  ];
  return patterns.some((p) => lower.includes(p));
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

  // Auto-detect introduction questions and use resume-based prompt
  const isIntro = isIntroductionQuestion(q);
  const activeMode = isIntro ? "introduction" : currentMode;
  const systemPrompt = SYSTEM_PROMPTS[activeMode] || SYSTEM_PROMPTS[currentMode];

  let userPrompt;
  if (isIntro) {
    userPrompt = `Here is my resume:\n${RESUME}\n\nInterview question: "${q}"\n\nUsing ONLY the resume above, give a confident, natural spoken introduction in 4-6 sentences.`;
    setStatus("● GENERATING (Introduction)…", "rgba(130, 200, 255, 0.9)");
  } else {
    userPrompt = ctx
      ? `Candidate background: ${ctx}\n\nInterview question: "${q}"\n\nGive a strong spoken answer in 3-4 sentences.`
      : `Interview question: "${q}"\n\nGive a strong spoken answer in 3-4 sentences.`;
  }

  const maxTokens = isIntro ? 500 : 250;

  // ── Build all provider promises and race them simultaneously ─────────────
  const providers = [];

  // Anthropic Claude
  const anthropicKey = KEYS.anthropicKey || "";
  if (anthropicKey) {
    const anthropicModel = KEYS.anthropicModel || "claude-haiku-4-20250514";
    providers.push(
      fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: anthropicModel,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
          temperature: 0.5,
        }),
      }).then(async (res) => {
        const data = await res.json();
        if (res.ok && data.content?.[0]?.text)
          return { text: data.content[0].text, label: `Claude (${anthropicModel})`, color: "rgba(180, 130, 255, 0.8)" };
        throw new Error(data.error?.message || `Claude HTTP ${res.status}`);
      })
    );
  }

  // Custom LLM / OpenRouter / Groq
  const customBase = KEYS.customLlmBaseUrl || "";
  const openrouterKey = KEYS.openrouterKey || "";
  const groqKey = KEYS.groqKey || "";

  let llmUrl, llmModel, llmHeaders, llmLabel, llmColor;
  if (customBase) {
    llmUrl = `${customBase.replace(/\/+$/, "")}/chat/completions`;
    llmModel = KEYS.customLlmModel || "gpt-4o-mini";
    llmHeaders = { "Content-Type": "application/json" };
    if (KEYS.customLlmApiKey) llmHeaders["Authorization"] = `Bearer ${KEYS.customLlmApiKey}`;
    if (KEYS.customLlmHeaderName && KEYS.customLlmHeaderValue)
      llmHeaders[KEYS.customLlmHeaderName] = KEYS.customLlmHeaderValue;
    llmLabel = `Custom (${llmModel})`; llmColor = "rgba(100, 200, 255, 0.8)";
  } else if (openrouterKey) {
    llmUrl = "https://openrouter.ai/api/v1/chat/completions";
    llmModel = KEYS.openrouterModel || "google/gemini-flash-1.5";
    llmHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${openrouterKey}` };
    llmLabel = `OpenRouter (${llmModel})`; llmColor = "rgba(100, 200, 255, 0.8)";
  } else if (groqKey) {
    llmUrl = "https://api.groq.com/openai/v1/chat/completions";
    llmModel = "llama-3.3-70b-versatile"; // fastest high-quality Groq model
    llmHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` };
    llmLabel = `Groq (${llmModel})`; llmColor = "rgba(255, 180, 100, 0.8)";
  }

  if (llmUrl) {
    providers.push(
      fetch(llmUrl, {
        method: "POST",
        headers: llmHeaders,
        body: JSON.stringify({
          model: llmModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.5,
          max_tokens: maxTokens,
        }),
      }).then(async (res) => {
        const data = await res.json();
        const t = data.choices?.[0]?.message?.content || "";
        if (res.ok && t) return { text: t, label: llmLabel, color: llmColor };
        throw new Error(`LLM HTTP ${res.status}`);
      })
    );
  }

  // Gemini flash-lite (very fast)
  const geminiKey = KEYS.geminiKey || "";
  if (geminiKey) {
    providers.push(
      fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            generationConfig: { maxOutputTokens: maxTokens, temperature: 0.5 },
          }),
        }
      ).then(async (res) => {
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        const t = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (t) return { text: t, label: "Gemini (flash-lite)", color: "rgba(100, 220, 180, 0.8)" };
        throw new Error("Gemini: empty response");
      })
    );
  }

  // ── Race: use whichever provider responds first ──────────────────────────
  if (providers.length > 0) {
    try {
      const winner = await Promise.any(providers);
      text = winner.text;
      setActiveAPI(winner.label, winner.color);
    } catch {
      console.warn("All LLM providers failed, falling back to Tavily");
    }
  }

  // Tavily — only if every LLM provider failed
  if (!text) {
    try {
      setStatus("● SEARCHING (Tavily)…", "rgba(120,200,255,0.8)");
      text = await tavilyAnswer(q, ctx, KEYS);
      if (text) { setActiveAPI("Tavily (search)", "rgba(120, 200, 255, 0.8)"); usedFallback = true; }
    } catch (err) {
      answerEl.innerHTML = `<span style="color:rgba(255,100,100,0.7)">All providers failed: ${escHtml(err.message)}</span>`;
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
