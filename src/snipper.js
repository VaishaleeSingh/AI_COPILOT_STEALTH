const selection = document.getElementById("selection");
const cursor = document.getElementById("cursor");
let startX, startY;
let isDragging = false;

document.addEventListener("mousemove", (e) => {
  // Move custom cursor
  if (cursor) {
    cursor.style.left = `${e.clientX}px`;
    cursor.style.top = `${e.clientY}px`;
  }

  if (!isDragging) return;

  const currentX = e.clientX;
  const currentY = e.clientY;

  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);
  const left = Math.min(currentX, startX);
  const top = Math.min(currentY, startY);

  selection.style.width = `${width}px`;
  selection.style.height = `${height}px`;
  selection.style.left = `${left}px`;
  selection.style.top = `${top}px`;
});

document.addEventListener("mousedown", (e) => {
  isDragging = true;
  startX = e.clientX;
  startY = e.clientY;
  selection.style.left = `${startX}px`;
  selection.style.top = `${startY}px`;
  selection.style.width = "0px";
  selection.style.height = "0px";
  selection.style.display = "block";
});

document.addEventListener("mouseup", (e) => {
  if (!isDragging) return;
  isDragging = false;

  const currentX = e.clientX;
  const currentY = e.clientY;

  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);
  const left = Math.min(currentX, startX);
  const top = Math.min(currentY, startY);

  if (width > 5 && height > 5) {
    // Send bounds to main process
    window.electronAPI.completeSnip({ x: left, y: top, width, height });
  } else {
    window.electronAPI.cancelSnip();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    window.electronAPI.cancelSnip();
  }
});
