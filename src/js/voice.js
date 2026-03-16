import { setStatus, escHtml } from "./ui.js";

let micActive = false;
let micStream = null;
let currentRecorder = null;
let sysStream = null;
let sysRecorder = null;
let recordedChunks = [];
let sysChunks = [];
let txEntries = [];
let interimEntry = null;
let isSysActive = false;
let audioCtx = null;
let analyser = null;
let volumeInterval = null;

export function isMicActive() {
  return micActive;
}

export function isSystemActive() {
  return isSysActive;
}

export function setVoiceStatus(msg, cls = "") {
  const el = document.getElementById("voice-status");
  if (el) {
    el.textContent = msg;
    el.className = cls ? `vs-${cls}` : "";
  }
}

export function renderTranscript() {
  const el = document.getElementById("transcript");
  if (!el) return;
  const rows = txEntries.slice(-12);
  if (!rows.length) {
    el.innerHTML =
      '<span class="ph">Live transcript — questions auto-fill below…</span>';
    return;
  }
  el.innerHTML = rows
    .map((r) => {
      const spCls = r.speaker === "You" ? "tx-you" : "tx-int";
      const rowCls = r.interim ? " tx-interim" : "";
      return `<div class="tx-row${rowCls}"><span class="tx-speaker ${spCls}">${r.speaker}</span><span class="tx-text">${escHtml(r.text)}</span></div>`;
    })
    .join("");
  el.scrollTop = el.scrollHeight;
}

export function addFinal(speaker, text, autoAnswer, generateCallback) {
  text = text.trim();
  if (!text) return;
  txEntries = txEntries.filter((e) => !(e.speaker === speaker && e.interim));
  interimEntry = null;
  txEntries.push({ speaker, text, interim: false });
  renderTranscript();

  const isCodeMode = document
    .getElementById("code-mode-container")
    ?.classList.contains("active");
  let qBox = document.getElementById("question");

  if (isCodeMode) {
    // Determine which code text area is currently targeted by checking activeElement, fallback to exec-code
    const activeEl = document.activeElement;
    if (activeEl && activeEl.classList.contains("code-textarea")) {
      qBox = activeEl;
    } else {
      qBox = document.getElementById("exec-code");
    }
  }

  qBox.value = text;
  setStatus("● QUESTION CAPTURED ✓");

  if (autoAnswer && looksLikeQuestion(text)) {
    setTimeout(() => generateCallback(), 400);
  }
}

export function updateInterim(speaker, text) {
  const existing = txEntries.find((e) => e.speaker === speaker && e.interim);
  if (existing) {
    existing.text = text;
  } else {
    txEntries.push({ speaker, text, interim: true });
  }
  renderTranscript();
}

export function clearTranscript() {
  txEntries = [];
  interimEntry = null;
  renderTranscript();
}

export function looksLikeQuestion(t) {
  const s = t.trim().toLowerCase();
  return (
    s.endsWith("?") ||
    /^(what|how|why|when|where|who|tell me|describe|explain|walk me|can you|could you|would you|talk about|give me|have you|are you|do you)/i.test(
      s,
    )
  );
}

export async function transcribeAudio(
  base64Data,
  blob,
  speaker,
  KEYS,
  handleDictationResult,
) {
  const groqKey = KEYS.groqKey;
  const assemblyKey = KEYS.assemblyKey;
  const geminiKey = KEYS.geminiKey;

  if (!groqKey && !assemblyKey && !geminiKey) {
    setVoiceStatus("No API Keys available for transcription", "err");
    return;
  }

  try {
    let text = "";

    // 1. Groq
    if (groqKey && blob) {
      try {
        setVoiceStatus("Transcribing (Groq)...", "");
        const formData = new FormData();
        formData.append("file", blob, "audio.webm");
        formData.append("model", "whisper-large-v3");
        formData.append("temperature", "0");
        formData.append("response_format", "json");

        const res = await fetch(
          "https://api.groq.com/openai/v1/audio/transcriptions",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${groqKey}` },
            body: formData,
          },
        );
        const data = await res.json();
        if (!res.ok)
          throw new Error(data.error?.message || `Groq HTTP ${res.status}`);
        text = data.text || "";
      } catch (e) {
        console.error("Groq Transcription Error:", e);
      }
    }

    // 2. AssemblyAI
    if (!text && assemblyKey && blob) {
      try {
        setVoiceStatus("Uploading to AssemblyAI...", "vs-warn");
        const uploadRes = await fetch("https://api.assemblyai.com/v2/upload", {
          method: "POST",
          headers: { Authorization: assemblyKey },
          body: blob,
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok)
          throw new Error(
            uploadData.error || `Upload failed: HTTP ${uploadRes.status}`,
          );

        setVoiceStatus("Transcribing (AssemblyAI)...", "vs-warn");
        const transcriptRes = await fetch(
          "https://api.assemblyai.com/v2/transcript",
          {
            method: "POST",
            headers: {
              Authorization: assemblyKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ audio_url: uploadData.upload_url }),
          },
        );
        const transcriptData = await transcriptRes.json();
        const transcriptId = transcriptData.id;

        while (true && micActive) {
          const pollingRes = await fetch(
            `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
            {
              method: "GET",
              headers: { Authorization: assemblyKey },
            },
          );
          const pollingData = await pollingRes.json();
          if (pollingData.status === "completed") {
            text = pollingData.text || "";
            break;
          } else if (pollingData.status === "error") {
            throw new Error(pollingData.error || "AssemblyAI failed remotely");
          }
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      } catch (e) {
        console.error("AssemblyAI Transcription Error:", e);
      }
    }

    // 3. Gemini
    if (!text && geminiKey) {
      try {
        setVoiceStatus("Transcribing (Gemini)...", "vs-warn");
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  role: "user",
                  parts: [
                    {
                      text: "Transcribe the following speech exactly as spoken. Return ONLY the transcription. If there is no human speech, return an empty string.",
                    },
                    {
                      inlineData: { mimeType: "audio/webm", data: base64Data },
                    },
                  ],
                },
              ],
              generationConfig: { temperature: 0.1 },
            }),
          },
        );
        const data = await res.json();
        text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      } catch (e) {
        console.error("Gemini Transcription Error:", e);
      }
    }

    if (text.trim() && text.toLowerCase() !== "empty string.") {
      handleDictationResult(text.trim(), true, speaker);
      setVoiceStatus("Audio captured...", "");
    } else {
      setVoiceStatus("No speech detected.", "vs-warn");
    }
  } catch (e) {
    console.error("Transcription error cascade", e);
    setVoiceStatus(`${e.message}`, "err");
  }
}

export async function startMic(onFinish) {
  try {
    const micSelectCustom = document.getElementById("mic-select-custom");
    const selectedDeviceId = micSelectCustom?.getAttribute("data-value");
    const constraints = {
      audio: selectedDeviceId
        ? {
            deviceId: { exact: selectedDeviceId },
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: { ideal: 48000 },
            channelCount: { ideal: 1 },
          }
        : {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: { ideal: 48000 },
            channelCount: { ideal: 1 },
          },
    };

    console.log("Requesting mic with constraints:", constraints);
    micStream = await navigator.mediaDevices.getUserMedia(constraints);
    console.log("Mic stream acquired:", micStream.id);

    startVolumeMeter(micStream);
    const track = micStream.getAudioTracks()[0];
    if (track) {
      console.log("Track settings:", track.getSettings());
      console.log("Track constraints:", track.getConstraints());
    }

    micActive = true;
    recordedChunks = [];

    const btn = document.getElementById("mic-btn");
    btn.textContent = "⏹ Stop";
    btn.classList.add("v-active");
    setVoiceStatus("🔴 Recording... Click Stop to transcribe.", "");

    txEntries.push({ speaker: "You", text: "Recording...", interim: true });
    renderTranscript();

    currentRecorder = new MediaRecorder(micStream, {
      mimeType: "audio/webm; codecs=opus",
    });
    console.log("MediaRecorder started with mimeType:", currentRecorder.mimeType);

    currentRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        console.log("Data available:", e.data.size, "bytes");
        recordedChunks.push(e.data);
      }
    };

    currentRecorder.onstop = async () => {
      console.log("MediaRecorder stopped. Total chunks:", recordedChunks.length);
      const blob = new Blob(recordedChunks, { type: "audio/webm; codecs=opus" });
      if (blob.size === 0) {
        console.warn("Recorded blob is empty!");
        setVoiceStatus("Empty audio captured.", "vs-warn");
        return;
      }
      console.log("Blob created:", blob.size, "bytes");
      setVoiceStatus("⏳ Transcribing audio...", "");

      const base64 = await getBase64(blob);
      await onFinish(base64, blob);

      txEntries = txEntries.filter((e) => !(e.speaker === "You" && e.interim));
      renderTranscript();
    };

    currentRecorder.start();
  } catch (err) {
    console.error("Mic start failed:", err);
    setVoiceStatus(`Mic error: ${err.message}`, "err");
  }
}

export async function startSystemAudio(onFinish) {
  try {
    console.log("Starting system audio capture...");
    // Attempt to capture with audio only if possible, or video+audio and stop video
    const constraints = {
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
        },
      },
      audio: {
        mandatory: {
          chromeMediaSource: "desktop",
        },
      },
    };

    // Note: getDisplayMedia is preferred in modern Chromium, but Electron 
    // may need standard getUserMedia with chromeMediaSource for desktop audio fallback.
    try {
      sysStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
    } catch (gdmErr) {
      console.warn("getDisplayMedia failed, trying getUserMedia fallback:", gdmErr);
      // Fallback for some Electron environments
      sysStream = await navigator.mediaDevices.getUserMedia(constraints);
    }

    const audioTrack = sysStream.getAudioTracks()[0];
    if (!audioTrack) {
      sysStream.getTracks().forEach((t) => t.stop());
      throw new Error("No system audio track found. Ensure 'Share Audio' is checked.");
    }

    // Stop video track since we only want audio
    sysStream.getVideoTracks().forEach((t) => t.stop());

    isSysActive = true;
    sysChunks = [];

    const btn = document.getElementById("sys-btn");
    btn.textContent = "⏹ Stop";
    btn.classList.add("v-active");
    setVoiceStatus("🔵 Capturing System Audio...", "");

    sysRecorder = new MediaRecorder(sysStream, {
      mimeType: "audio/webm;codecs=opus",
    });

    sysRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) sysChunks.push(e.data);
    };

    sysRecorder.onstop = async () => {
      const blob = new Blob(sysChunks, { type: "audio/webm;codecs=opus" });
      setVoiceStatus("⏳ Transcribing system audio...", "");
      const base64 = await getBase64(blob);
      await onFinish(base64, blob);
    };

    sysRecorder.start();

    audioTrack.onended = () => stopSystemAudio();
  } catch (err) {
    console.error("System audio capture failed:", err);
    setVoiceStatus(`Sys Error: ${err.message}`, "err");
  }
}

export function stopSystemAudio() {
  isSysActive = false;
  if (sysRecorder && sysRecorder.state !== "inactive") sysRecorder.stop();
  if (sysStream) sysStream.getTracks().forEach((t) => t.stop());

  const btn = document.getElementById("sys-btn");
  if (btn) {
    btn.textContent = "🔊 Sys";
    btn.classList.remove("v-active");
  }
}

export function stopMic() {
  micActive = false;
  stopVolumeMeter();
  if (currentRecorder && currentRecorder.state !== "inactive")
    currentRecorder.stop();
  if (micStream) micStream.getTracks().forEach((t) => t.stop());

  const btn = document.getElementById("mic-btn");
  btn.textContent = "🎤 Mic";
  btn.classList.remove("v-active");
}

function getBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function startVolumeMeter(stream) {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const bar = document.getElementById("volume-meter-bar");

    volumeInterval = setInterval(() => {
      if (!micActive) return;
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const average = sum / bufferLength;
      const volume = Math.min(100, Math.pow(average / 128, 0.5) * 100);
      if (bar) bar.style.width = `${volume}%`;
    }, 50);
  } catch (err) {
    console.error("Volume meter error:", err);
  }
}

function stopVolumeMeter() {
  if (volumeInterval) {
    clearInterval(volumeInterval);
    volumeInterval = null;
  }
  if (audioCtx) {
    audioCtx.close();
    audioCtx = null;
  }
  const bar = document.getElementById("volume-meter-bar");
  if (bar) bar.style.width = "0%";
}

export async function refreshMicList() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter((d) => d.kind === "audioinput");
    const micSelectCustom = document.getElementById("mic-select-custom");
    if (!micSelectCustom) return;

    const optionsContainer = micSelectCustom.querySelector(".options-container");
    const selectedDisplay = micSelectCustom.querySelector(".selected-option");
    
    const currentVal = micSelectCustom.getAttribute("data-value");
    
    optionsContainer.innerHTML = mics
      .map(
        (m) =>
          `<div data-value="${m.deviceId}" class="${m.deviceId === currentVal ? "selected" : ""}">${m.label || "Unknown Mic"}</div>`,
      )
      .join("");

    if (!optionsContainer.innerHTML) {
      optionsContainer.innerHTML = '<div data-value="">No Mic Found</div>';
    }

    // Add click handlers for new options
    optionsContainer.querySelectorAll("div").forEach(div => {
      div.onclick = (e) => {
        e.stopPropagation();
        const val = div.getAttribute("data-value");
        const label = div.textContent;
        selectedDisplay.textContent = label;
        micSelectCustom.setAttribute("data-value", val);
        localStorage.setItem("selectedDeviceId", val);
        optionsContainer.classList.remove("show");
      };
    });

  } catch (err) {
    console.error("Error refreshing mic list:", err);
  }
}

// Auto-refresh on device change
if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
  navigator.mediaDevices.addEventListener("devicechange", refreshMicList);
}
