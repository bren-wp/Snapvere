"use strict";
(function () {
  const workspace = globalThis.SnapvereWorkspace;
  const api = globalThis.browser || globalThis.chrome;
  const canvas = document.getElementById("editor-canvas");
  const ctx = canvas.getContext("2d");
  const status = document.getElementById("status");
  const cropBtn = document.getElementById("apply-crop");
  const buttons = [...document.querySelectorAll("[data-tool]")];
  let base, initial, tool = "pen", color = "#a87aff", size = 4;
  let operations = [], pending = null, selection = null, dragging = false, busy = false;

  function message(text) { status.textContent = text; }
  function selected(next) {
    tool = next;
    buttons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.tool === next)));
    selection = null;
    cropBtn.hidden = true;
    draw();
  }
  function point(event) {
    const r = canvas.getBoundingClientRect();
    return {
      x: Math.round((event.clientX - r.left) * canvas.width / r.width),
      y: Math.round((event.clientY - r.top) * canvas.height / r.height),
    };
  }
  function rectangle(a, b) {
    const x = Math.max(0, Math.min(a.x, b.x));
    const y = Math.max(0, Math.min(a.y, b.y));
    const right = Math.min(canvas.width, Math.max(a.x, b.x));
    const bottom = Math.min(canvas.height, Math.max(a.y, b.y));
    return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
  }
  function stroke(target, op) {
    target.save();
    target.strokeStyle = op.color;
    target.fillStyle = op.color;
    target.lineWidth = op.size;
    target.lineJoin = target.lineCap = "round";
    if (op.kind === "pen") {
      target.beginPath();
      op.points.forEach((p, i) => i ? target.lineTo(p.x, p.y) : target.moveTo(p.x, p.y));
      if (op.points.length === 1) {
        const p = op.points[0];
        target.arc(p.x, p.y, op.size / 2, 0, Math.PI * 2);
        target.fill();
      } else target.stroke();
    } else if (op.kind === "rectangle") {
      const rect = rectangle(op.start, op.end);
      target.strokeRect(rect.x, rect.y, rect.width, rect.height);
    } else if (op.kind === "text") {
      target.font = "bold " + Math.max(14, op.size * 5) + "px system-ui";
      target.fillText(op.value, op.start.x, op.start.y);
    }
    target.restore();
  }
  function paint(target, showEditingGuides) {
    if (!base) return;
    target.clearRect(0, 0, canvas.width, canvas.height);
    target.drawImage(base, 0, 0);
    operations.forEach(op => stroke(target, op));
    // The dashed crop border and an unfinished pointer stroke belong only
    // to the screen preview, never to a saved or clipboard-shared PNG.
    if (showEditingGuides && pending && tool !== "crop") stroke(target, pending);
    if (showEditingGuides && selection) {
      const r = rectangle(selection.start, selection.end);
      target.save();
      target.setLineDash([9, 6]);
      target.strokeStyle = "#e0b0ff";
      target.lineWidth = Math.max(2, canvas.width / 1000);
      target.strokeRect(r.x, r.y, r.width, r.height);
      target.restore();
    }
  }
  function draw() { paint(ctx, true); }
  function snapshot() {
    if (!base) throw new Error("No image is loaded");
    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    const cleanContext = out.getContext("2d");
    if (!cleanContext) throw new Error("Canvas export unavailable");
    paint(cleanContext, false);
    return out;
  }
  function toBlob(source = canvas) {
    return new Promise((resolve, reject) => source.toBlob(
      value => value ? resolve(value) : reject(new Error("PNG export failed")), "image/png"
    ));
  }
  function updateBase(newCanvas) {
    base = newCanvas;
    canvas.width = base.width; canvas.height = base.height;
    operations = []; pending = selection = null;
    cropBtn.hidden = true;
    draw();
  }

  canvas.addEventListener("pointerdown", event => {
    if (busy || !base || event.button !== 0) return;
    const start = point(event);
    if (tool === "text") {
      const value = window.prompt("Annotation text (max 200 characters):", "");
      if (value && value.trim()) {
        operations.push({ kind: "text", start, value: value.slice(0, 200), color, size });
        draw(); message("Text added");
      }
      return;
    }
    dragging = true;
    canvas.setPointerCapture(event.pointerId);
    if (tool === "crop") {
      selection = { start, end: start };
    } else if (tool === "pen") {
      pending = { kind: "pen", points: [start], color, size };
    } else {
      pending = { kind: "rectangle", start, end: start, color, size };
    }
    draw();
  });
  canvas.addEventListener("pointermove", event => {
    if (!dragging) return;
    const end = point(event);
    if (tool === "crop" && selection) selection.end = end;
    else if (pending?.kind === "pen") pending.points.push(end);
    else if (pending) pending.end = end;
    draw();
  });
  function release(event) {
    if (!dragging) return;
    dragging = false;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    const end = point(event);
    if (tool === "crop" && selection) {
      selection.end = end;
      const r = rectangle(selection.start, selection.end);
      cropBtn.hidden = r.width < 3 || r.height < 3;
      message(cropBtn.hidden ? "Drag to select a larger area." : "Area selected. Apply crop.");
    } else if (pending) {
      if (pending.kind === "pen") pending.points.push(end);
      else pending.end = end;
      operations.push(pending);
      pending = null;
    }
    draw();
  }
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", () => { dragging = false; pending = null; draw(); });

  buttons.forEach(button => button.addEventListener("click", () => selected(button.dataset.tool)));
  document.getElementById("color").addEventListener("input", e => { color = e.target.value; });
  document.getElementById("thickness").addEventListener("input", e => { size = Number(e.target.value); });
  document.getElementById("undo").addEventListener("click", () => {
    if (operations.length) { operations.pop(); draw(); message("Last annotation removed."); }
    else message("Nothing to undo. Reset restores the original image.");
  });
  document.getElementById("reset").addEventListener("click", () => {
    if (initial) { updateBase(initial); message("Original screenshot restored."); }
  });
  cropBtn.addEventListener("click", () => {
    if (!selection || !base) return;
    const r = rectangle(selection.start, selection.end);
    if (r.width < 3 || r.height < 3) return;
    // Never bake the purple crop-selection outline into the exported pixels.
    selection = null;
    draw();
    const source = snapshot();
    const cropped = document.createElement("canvas");
    cropped.width = r.width; cropped.height = r.height;
    cropped.getContext("2d").drawImage(source, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
    updateBase(cropped);
    selected("pen");
    message("Image cropped. You can add annotations or save it.");
  });

  document.getElementById("save").addEventListener("click", async () => {
    if (!base || busy) return;
    busy = true;
    draw();
    try {
      const url = snapshot().toDataURL("image/png");
      const filename = "Snapvere/Snapvere-" + new Date().toISOString().replace(/[:.]/g, "-") + ".png";
      const id = await api.downloads.download({ url, filename, conflictAction: "uniquify", saveAs: false });
      if (!Number.isInteger(id)) throw new Error("Browser did not start download");
      message("PNG saved locally to Downloads/Snapvere.");
    } catch (error) {
      console.error("SNAPVERE editor export", error);
      message("Could not save screenshot. Check your browser download permissions.");
    } finally { busy = false; }
  });

  document.getElementById("copy-desktop").addEventListener("click", async () => {
    if (!base || busy) return;
    busy = true;
    draw();
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
        throw new Error("Image clipboard write is not supported here");
      }
      // User initiated; clipboard is the only bridge. No local network server,
      // nativeMessaging permission, file-system path or hidden data transfer.
      const png = toBlob(snapshot());
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      message("Image copied. In Snapvere for Windows, choose Import from clipboard.");
    } catch (error) {
      console.error("SNAPVERE clipboard export", error);
      message("Clipboard unavailable in this browser. Save PNG and import it manually.");
    } finally { busy = false; }
  });

  async function begin() {
    const id = new URLSearchParams(location.search).get("capture");
    if (!id) { message("No screenshot selected"); return; }
    try {
      const draft = await workspace.loadDraft(id);
      const url = URL.createObjectURL(draft.blob);
      const image = new Image();
      try {
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = () => reject(new Error("Cannot decode private screenshot"));
          image.src = url;
        });
      } finally { URL.revokeObjectURL(url); }
      const bitmap = document.createElement("canvas");
      bitmap.width = image.naturalWidth; bitmap.height = image.naturalHeight;
      if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 28_000_000) {
        throw new Error("Screenshot dimensions exceed safety limit");
      }
      bitmap.getContext("2d").drawImage(image, 0, 0);
      initial = bitmap;
      updateBase(bitmap);
      selected(draft.mode === "crop" ? "crop" : "pen");
      message("Loaded " + bitmap.width + " × " + bitmap.height + " PNG. Edit locally.");
    } catch (error) {
      console.error("SNAPVERE editor", error);
      message(String(error.message || error));
    }
  }
  void begin();
})();
