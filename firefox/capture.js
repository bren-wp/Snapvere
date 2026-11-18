/* SNAPVERE — local-only visible-tab PNG capture. */
"use strict";
(function installSnapvereCapture(root) {
  const PREFIX = "data:image/png;base64,";
  function timestamp(now) {
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
      throw new TypeError("Valid timestamp required");
    }
    return now.toISOString().replace(/[:.]/g, "-");
  }
  function filename(now = new Date()) {
    return "Snapvere/Snapvere-" + timestamp(now) + ".png";
  }
  async function captureVisibleTab(api = root.browser || root.chrome) {
    if (!api?.tabs?.captureVisibleTab || !api?.downloads?.download) {
      throw new Error("Browser does not support tab capture or local download");
    }
    // activeTab only: capture is triggered by a toolbar click or extension
    // keyboard command; never request permanent access to all web pages.
    const image = await api.tabs.captureVisibleTab(undefined, { format: "png" });
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
