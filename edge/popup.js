"use strict";
const api = globalThis.browser || globalThis.chrome;
const action = document.getElementById("capture");
const status = document.getElementById("status");
const note = document.getElementById("note");
let busy = false;

function setStatus(message, type = "info") {
  status.textContent = message;
  status.dataset.state = type;
}

action.addEventListener("click", async () => {
  if (busy) return;
  busy = true;
  action.disabled = true;
  setStatus("Capturing the visible tab…");
  try {
    if (!globalThis.SnapvereCapture) throw new Error("Capture module unavailable");
    const result = await globalThis.SnapvereCapture.captureVisibleTab(api);
    setStatus("Screenshot saved to Downloads.", "success");
    note.textContent = result.filename;
  } catch (error) {
    console.error("SNAPVERE screenshot failed:", error);
    setStatus("Could not save this tab. Try another page or check download permissions.", "error");
    note.textContent = "Some protected browser pages cannot be captured.";
  } finally {
    busy = false;
    action.disabled = false;
  }
});
