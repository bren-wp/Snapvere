/* Snapvere by Brendigo */
/* SNAPVERE — browser-side capture workspace. All pixels remain on device.
 * A user must explicitly invoke every capture; no page is observed in the background.
 */
"use strict";
(function (root) {
  const DB_NAME = "snapvere-local-captures";
  const STORE = "images";
  const MAX_BLOB = 32 * 1024 * 1024;
  const MAX_PIXELS = 28_000_000;
  const MAX_FRAMES = 25;
  const MAX_HEIGHT = 20000;
  const FRAME_DELAY_MS = 650; // Chromium captureVisibleTab allows at most 2 calls/s.
  const PREFIX = "data:image/png;base64,";

  function planPageCapture(width, height, viewportWidth, viewportHeight) {
    const values = [width, height, viewportWidth, viewportHeight];
    if (values.some((v) => !Number.isSafeInteger(v) || v <= 0)) {
      throw new Error("This page has invalid screenshot dimensions.");
    }
    if (width > viewportWidth + 2) {
      throw new Error("Horizontal-scrolling pages require a separate capture.");
    }
    if (height > MAX_HEIGHT || width * height > MAX_PIXELS) {
      throw new Error("This page is too large for safe local capture.");
    }
    const frames = Math.ceil(height / viewportHeight);
    if (frames > MAX_FRAMES) {
      throw new Error("Page requires too many screenshots.");
    }
    return Array.from({ length: frames }, (_, index) =>
      Math.min(index * viewportHeight, Math.max(0, height - viewportHeight)));
  }

  function areaPixels(region, viewport, bitmap) {
    if (!region || !viewport || !bitmap) throw new Error("Missing area geometry");
    const { x, y, width, height } = region;
    if ([x, y, width, height, viewport.width, viewport.height,
         bitmap.width, bitmap.height].some(v => !Number.isFinite(v))) {
      throw new Error("Invalid area geometry");
    }
    const scaleX = bitmap.width / viewport.width;
    const scaleY = bitmap.height / viewport.height;
    const left = Math.round(Math.max(0, x) * scaleX);
    const top = Math.round(Math.max(0, y) * scaleY);
    const right = Math.round(Math.min(viewport.width, x + width) * scaleX);
    const bottom = Math.round(Math.min(viewport.height, y + height) * scaleY);
    if (right <= left || bottom <= top) throw new Error("Empty area");
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("Local capture storage unavailable"));
    });
  }

  async function saveDraft(blob, mode) {
    if (!(blob instanceof Blob) || blob.type !== "image/png" ||
        blob.size === 0 || blob.size > MAX_BLOB) {
      throw new Error("PNG capture is missing or exceeds the 32 MB safety limit.");
    }
    const id = crypto.randomUUID();
    const db = await openDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put({ id, blob, mode, created: Date.now() });
        // Bound local storage to eight recent captures, and prune expired
        // drafts on every new capture. A browser closed while idle may retain
        // stale entries until its next use; nothing is uploaded.
        const candidates = [];
        const request = tx.objectStore(STORE).openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) {
            candidates.sort((a, b) => a.created - b.created);
            for (const entry of candidates.slice(0, Math.max(0, candidates.length - 8))) {
              tx.objectStore(STORE).delete(entry.id);
            }
            return;
          }
          if (Date.now() - cursor.value.created > 30 * 60 * 1000) cursor.delete();
          else candidates.push({ id: cursor.value.id, created: cursor.value.created });
          cursor.continue();
        };
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error("Unable to save local preview"));
        tx.onabort = () => reject(tx.error || new Error("Local preview aborted"));
      });
    } finally { db.close(); }
    return id;
  }

  async function loadDraft(id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid capture identifier");
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        const req = tx.objectStore(STORE).get(id);
        req.onsuccess = () => {
          const entry = req.result;
          if (!entry || Date.now() - entry.created > 30 * 60 * 1000) {
            if (entry) tx.objectStore(STORE).delete(id);
            reject(new Error("This capture expired. Take a new screenshot."));
          } else {
            resolve(entry);
          }
        };
        req.onerror = () => reject(req.error || new Error("Capture could not be opened"));
      });
    } finally { db.close(); }
  }

  function loadPng(url) {
    if (typeof url !== "string" || !url.startsWith(PREFIX)) {
      return Promise.reject(new Error("Browser did not return a PNG screenshot"));
    }
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not decode screenshot"));
      image.src = url;
    });
  }

  function asPng(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not encode PNG")), "image/png");
    });
  }

  function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

  function currentTab(api) {
    return api.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (!tab || !Number.isInteger(tab.id) || !Number.isInteger(tab.windowId)) {
        throw new Error("No active browser tab is available");
      }
      return tab;
    });
  }

  async function ensureOriginalTab(api, original) {
    // Check the original window, never the foreground browser window. A
    // background switch or another window opening must not yield pixels from
    // a different tab under the original page's screenshot identity.
    const active = await api.tabs.query({ active: true, windowId: original.windowId });
    // A navigation keeps the same numeric tab id; compare the URL whenever
    // the temporary activeTab grant exposes it, not just the tab identity.
    if (active.length !== 1 || active[0].id !== original.id ||
        (typeof original.url === "string" && active[0].url !== original.url)) {
      throw new Error("Active tab changed or navigated during capture; no screenshot was saved.");
    }
  }

  async function openEditor(api, blob, mode) {
    const id = await saveDraft(blob, mode);
    await api.tabs.create({
      url: api.runtime.getURL("editor.html") + "?capture=" + encodeURIComponent(id)
    });
    return id;
  }

  async function captureForEditor(api, mode = "draw") {
    const tab = await currentTab(api);
    // A user can switch tabs while the extension is preparing the editor.
    // Never label another tab's pixels as the originally selected page.
    await ensureOriginalTab(api, tab);
    const url = await api.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    await ensureOriginalTab(api, tab);
    const img = await loadPng(url);
    if (img.naturalWidth * img.naturalHeight > MAX_PIXELS) {
      throw new Error("Visible tab exceeds the safe pixel limit");
    }
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d").drawImage(img, 0, 0);
    return openEditor(api, await asPng(canvas), mode);
  }

  // The injected functions are deliberately serializable and isolated from any
  // extension state. Only the active tab obtains this temporary access.
  function measureDocument() {
    const html = document.documentElement;
    const body = document.body;
    return {
      width: Math.max(html.scrollWidth, body?.scrollWidth || 0),
      height: Math.max(html.scrollHeight, body?.scrollHeight || 0),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      originalX: window.scrollX,
      originalY: window.scrollY,
      url: window.location.href,
    };
  }
  function moveDocument(y) {
    window.scrollTo({ left: 0, top: y, behavior: "instant" });
    return { y: window.scrollY, url: window.location.href };
  }
  // In-page fail-safe survives a user accidentally closing the extension
  // popup during a multi-strip capture. It runs in the extension isolated
  // world and restores scroll after 30s even if the popup's finally is lost.
  function armScrollRestore(x, y) {
    if (window.__snapvereScrollRestore) clearTimeout(window.__snapvereScrollRestore);
    window.__snapvereScrollRestore = setTimeout(() => {
      window.scrollTo({ left: x, top: y, behavior: "instant" });
      delete window.__snapvereScrollRestore;
    }, 30_000);
  }
  function restoreDocument(x, y) {
    if (window.__snapvereScrollRestore) {
      clearTimeout(window.__snapvereScrollRestore);
      delete window.__snapvereScrollRestore;
    }
    window.scrollTo({ left: x, top: y, behavior: "instant" });
  }

  async function execute(api, tabId, func, args = []) {
    const results = await api.scripting.executeScript({
      target: { tabId }, func, args,
    });
    if (!results || !results.length) throw new Error("Cannot access this browser page");
    return results[0].result;
  }

  async function captureFullPage(api, onProgress = () => {}) {
    if (!api?.scripting?.executeScript) {
      throw new Error("Page capture is unsupported in this browser");
    }
    const tab = await currentTab(api);
    const metrics = await execute(api, tab.id, measureDocument);
    const positions = planPageCapture(
      metrics.width, metrics.height, metrics.viewportWidth, metrics.viewportHeight
    );
    const canvas = document.createElement("canvas");
    let ctx;
    let scale;
    let completed = 0;
    try {
      for (let index = 0; index < positions.length; index++) {
        // Refresh the page-side 30 second restoration watchdog each frame.
        // A slow full-page capture must not reset scroll in mid-stitch.
        await execute(api, tab.id, armScrollRestore, [metrics.originalX, metrics.originalY]);
        // Prevent leaking a screenshot of a different tab if the user changes focus.
        await ensureOriginalTab(api, tab);
        const state = await execute(api, tab.id, moveDocument, [positions[index]]);
        if (state.url !== metrics.url) throw new Error("Page navigated during capture");
        if (Math.abs(state.y - positions[index]) > 3) {
          throw new Error("Page layout changed while scrolling");
        }
        await sleep(FRAME_DELAY_MS);
        // The user might switch tabs during the 650 ms compositor delay.
        // Checking only before scrolling is insufficient, especially on the
        // last frame where no next iteration exists to catch that switch.
        await ensureOriginalTab(api, tab);
        const png = await api.tabs.captureVisibleTab(tab.windowId, { format: "png" });
        await ensureOriginalTab(api, tab);
        const currentUrl = await execute(api, tab.id, () => window.location.href);
        if (currentUrl !== metrics.url) {
          throw new Error("Page navigated during screenshot; frame discarded.");
        }
        const img = await loadPng(png);
        if (index === 0) {
          scale = img.naturalWidth / metrics.viewportWidth;
          const height = Math.round(metrics.height * scale);
          if (img.naturalWidth * height > MAX_PIXELS || height > 32767) {
            throw new Error("Image exceeds browser canvas memory limit");
          }
          canvas.width = img.naturalWidth;
          canvas.height = height;
          ctx = canvas.getContext("2d", { alpha: false });
          if (!ctx) throw new Error("Browser canvas is unavailable");
        }
        if (Math.abs(img.naturalWidth - canvas.width) > 2) {
          throw new Error("Viewport scale changed during capture");
        }
        const y = Math.round(state.y * scale);
        ctx.drawImage(img, 0, y);
        completed += 1;
        onProgress(completed, positions.length);
      }
      if (completed !== positions.length) throw new Error("Incomplete screenshot");
      return await openEditor(api, await asPng(canvas), "draw");
    } finally {
      // Even on failed capture, restore the user's original scroll position.
      try { await execute(api, tab.id, restoreDocument, [metrics.originalX, metrics.originalY]); }
      catch (error) { console.warn("Could not restore page scroll", error); }
    }
  }

  root.SnapvereWorkspace = Object.freeze({
    planPageCapture, areaPixels, saveDraft, loadDraft, captureForEditor,
    captureFullPage, openEditor,
  });
})(globalThis);
