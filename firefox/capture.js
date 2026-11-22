/* Snapvere by Brendigo */
/* SNAPVERE — local-only visible-tab PNG capture. */
"use strict";
(function installSnapvereCapture(root) {
  const PREFIX = "data:image/png;base64,";
  function timestamp(now) {
    if (Object.prototype.toString.call(now) !== "[object Date]" ||
        !Number.isFinite(now.getTime())) {
      throw new TypeError("Valid timestamp required");
    }
    return now.toISOString().replace(/[:.]/g, "-");
  }
  function filename(now = new Date()) {
    return "Snapvere/Snapvere-" + timestamp(now) + ".png";
  }
  async function captureVisibleTab(api = root.browser || root.chrome) {
    if (!api?.tabs?.captureVisibleTab || !api?.tabs?.query ||
        !api?.downloads?.download) {
      throw new Error("Browser does not support tab capture or local download");
    }
    // Tie the result to the exact tab that initiated the user gesture.
    // Capturing the *current* window by default could save another tab's
    // pixels when the user switches windows before the async API resolves.
    const [original] = await api.tabs.query({ active: true, currentWindow: true });
    if (!original || !Number.isInteger(original.id) ||
        !Number.isInteger(original.windowId)) {
      throw new Error("No active browser tab is available");
    }
    const checkOriginal = async () => {
      const active = await api.tabs.query({ active: true, windowId: original.windowId });
      if (active.length !== 1 || active[0].id !== original.id ||
          (typeof original.url === "string" && active[0].url !== original.url)) {
        throw new Error("Active tab changed or navigated; screenshot was not saved");
      }
    };
    // activeTab only: capture is triggered by a toolbar click or extension
    // keyboard command; never request permanent access to all web pages.
    await checkOriginal();
    const image = await api.tabs.captureVisibleTab(original.windowId, { format: "png" });
    await checkOriginal();
    if (typeof image !== "string" || !image.startsWith(PREFIX)) {
      throw new Error("Browser did not return a PNG screenshot");
    }
    const path = filename();
    const downloadId = await api.downloads.download({
      url: image,
      filename: path,
      conflictAction: "uniquify",
      saveAs: false,
    });
    if (!Number.isInteger(downloadId) || downloadId < 0) {
      throw new Error("Browser did not confirm the screenshot download");
    }
    return { filename: path, downloadId };
  }
  root.SnapvereCapture = Object.freeze({ captureVisibleTab, filename });
})(globalThis);
