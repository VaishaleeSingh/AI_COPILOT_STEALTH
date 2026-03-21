export function setQ(q) {
  document.getElementById("question").value = q;
}

export async function copyText(elementId, btn) {
  const el = document.getElementById(elementId);
  let textToCopy = "";

  if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
    textToCopy = el.value;
  } else {
    textToCopy = el.innerText || el.textContent;
    if (textToCopy.includes("Your answer will appear here")) textToCopy = "";
  }

  if (!textToCopy.trim()) return;

  try {
    if (window.electronAPI?.copyToClipboard) {
      window.electronAPI.copyToClipboard(textToCopy);
    } else {
      await navigator.clipboard.writeText(textToCopy);
    }

    const originalHtml = btn.innerHTML;
    btn.innerHTML = "✅ Copied";
    btn.classList.add("success");
    setTimeout(() => {
      btn.innerHTML = originalHtml;
      btn.classList.remove("success");
    }, 2000);
  } catch (err) {
    console.error("Failed to copy: ", err);
    const temp = document.createElement("textarea");
    temp.value = textToCopy;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand("copy");
    document.body.removeChild(temp);
  }
}

export function setOpacity(v) {
  document.getElementById("app").style.background = `rgba(8,10,18,${v / 100})`;
  document.getElementById("opacityVal").textContent = v + "%";
}

export function setStatus(s, color = "var(--green)") {
  const el = document.getElementById("status");
  if (el) {
    el.textContent = s;
    el.style.color = color;
  }
}

export function setActiveAPI(name, color = "rgba(180, 160, 255, 0.7)") {
  const el = document.getElementById("api-log");
  const label = document.getElementById("api-log-label");
  if (el) {
    const time = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    el.value = `[${time}]  ${name}`;
    el.style.color = color;
    el.style.borderColor = color.replace(/[\d.]+\)$/, "0.15)");
  }
  if (label) label.style.color = color;
}

export function clearInputs() {
  document.getElementById("question").value = "";
  document.getElementById("context").value = "";
  const execCode = document.getElementById("exec-code");
  if (execCode) execCode.value = "";
  const execFormat = document.getElementById("exec-output-format");
  if (execFormat) execFormat.value = "";
  const execLogic = document.getElementById("exec-logic");
  if (execLogic) execLogic.value = "";
  document.getElementById("answer").innerHTML =
    '<span class="ph">Your answer will appear here — read it naturally…</span>';

  // Clear image previews
  document.querySelectorAll(".img-preview").forEach((el) => el.remove());

  setStatus("● READY");
}

export function clearAll() {
  clearInputs();
  // We'll leave this empty or intact just in case other modules depend on it,
  // but ui.js no longer implicitly clears everything at once.
}

export function typewrite(answerEl, text, onDone) {
  answerEl.textContent = text;
  answerEl.scrollTop = 0;
  onDone?.();
}

export function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
