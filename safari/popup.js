"use strict";
const api = globalThis.browser || globalThis.chrome;
const buttons = [...document.querySelectorAll("[data-action]")];
const status = document.getElementById("status");
const note = document.getElementById("note");
let busy = false;
function setStatus(message, type = "info") {
  status.textContent = message;
  status.dataset.state = type;
}
async function act(mode) {
  if (busy) return;
  busy = true;
  buttons.forEach(button => { button.disabled = true; });
  setStatus("Preparing local screenshot…");
  try {
    if (mode === "visible") {
      const result = await globalThis.SnapvereCapture.captureVisibleTab(api);
      setStatus("Screenshot saved to Downloads.", "success");
      note.textContent = result.filename;
    } else if (mode === "area" || mode === "edit") {
      await globalThis.SnapvereWorkspace.captureForEditor(api, mode === "area" ? "crop" : "draw");
      setStatus("Screenshot opened in private editor.", "success");
      note.textContent = mode === "area"
        ? "Drag across your screenshot and select Apply crop."
        : "Annotate, crop or export from the local editor.";
    } else if (mode === "full") {
      await globalThis.SnapvereWorkspace.captureFullPage(api, (done, total) => {
        setStatus("Capturing webpage: " + done + " / " + total + " views…");
      });
      setStatus("Full webpage opened in private editor.", "success");
      note.textContent = "Some animated pages and sticky headers may not stitch perfectly.";
    } else throw new Error("Unknown capture action");
  } catch (error) {
    console.error("SNAPVERE screenshot failed:", error);
    setStatus("Could not capture this page. Try another page.", "error");
    note.textContent = String(error?.message || error).slice(0, 220);
  } finally {
    busy = false;
    buttons.forEach(button => { button.disabled = false; });
  }
}
buttons.forEach(button => {
  button.addEventListener("click", () => { void act(button.dataset.action); });
});
