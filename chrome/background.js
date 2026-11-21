/* Snapvere by Brendigo */
/* Chromium: loaded by a Manifest V3 service worker.
 * Firefox/Safari: capture.js is listed first as a background script.
 */
"use strict";
if (typeof importScripts === "function") {
  importScripts("capture.js");
}
const snapvereBrowser = globalThis.browser || globalThis.chrome;
if (!snapvereBrowser?.commands?.onCommand || !globalThis.SnapvereCapture) {
  console.error("SNAPVERE keyboard capture is unavailable in this browser");
} else {
  snapvereBrowser.commands.onCommand.addListener((command) => {
    if (command !== "capture-visible-tab") return;
    void globalThis.SnapvereCapture.captureVisibleTab(snapvereBrowser)
      .catch((error) => {
        // Never send screenshot pixels or active URLs to a server.
        console.error("SNAPVERE tab capture failed:", error);
      });
  });
}
