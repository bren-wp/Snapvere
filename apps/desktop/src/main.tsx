// Snapvere by Brendigo
import React from "react";
import ReactDOM from "react-dom/client";
import { listen } from "@tauri-apps/api/event";
import "./styles.css";

import Home from "./windows/Home";
import Overlay from "./windows/Overlay";
import Editor from "./windows/Editor";
import Settings from "./windows/Settings";
import RecBar from "./windows/RecBar";
import RecDraw from "./windows/RecDraw";
import RecFrame from "./windows/RecFrame";
import AppErrorBoundary from "./components/AppErrorBoundary";
import { LanguageProvider } from "./lib/LanguageProvider";

/**
 * Window router.
 * Svaki Tauri prozor učitava `index.html` s hashom koji određuje koji root mountamo:
 *   #overlay?mon=<id>   → selekcija regije
 *   #editor?p=<base64>  → annotation editor
 *   #recbar             → HUD traka dok snimanje traje
 *   #recdraw            → prozirni sloj za crtanje preko snimke
 *   #recframe           → okvir: zatamni sve oko snimanog područja
 *   #settings           → postavke
 *   (default)           → home / galerija
 */
function resolveWindow() {
  const hash = window.location.hash.replace(/^#/, "");
  const [kind, query] = hash.split("?");
  return { kind: kind || "home", params: new URLSearchParams(query ?? "") };
}

// Primijeni spremljenu temu što ranije (izbjegne bljesak).
let theme: "dark" | "light" = "dark";
try {
  // Storage can throw when WebView2 denies local access; never crash startup.
  if (localStorage.getItem("snapvere-theme") === "light") theme = "light";
} catch {
  // Use the secure default; Settings can still recover later.
}
document.documentElement.setAttribute("data-theme", theme);

// Settings updates other WebView2 windows as well as its own document. The
// storage event covers WebViews sharing an origin; the native event channel
// covers independent Tauri WebViews without assuming their storage is shared.
const applySharedTheme = (value: unknown) => {
  if (value === "dark" || value === "light") {
    document.documentElement.setAttribute("data-theme", value);
  }
};
window.addEventListener("storage", (event) => {
  if (event.key === "snapvere-theme") applySharedTheme(event.newValue);
});
void listen<"dark" | "light">("snapvere:theme-changed", ({ payload }) => {
  applySharedTheme(payload);
  try {
    localStorage.setItem("snapvere-theme", payload);
  } catch {
    // Keep the current window's appearance usable when local storage is blocked.
  }
}).catch((error) => console.error("Cannot subscribe to theme updates", error));

const { kind, params } = resolveWindow();

let node: React.ReactNode;
switch (kind) {
  case "overlay":
    document.body.classList.add("overlay");
    node = <Overlay />;
    break;
  case "editor":
    node = <Editor pathB64={params.get("p") ?? ""} />;
    break;
  case "recbar":
    document.body.classList.add("hud");
    node = <RecBar />;
    break;
  case "recdraw":
    document.body.classList.add("hud");
    node = <RecDraw />;
    break;
  case "recframe":
    document.body.classList.add("hud");
    node = <RecFrame />;
    break;
  case "settings":
    node = <Settings />;
    break;
  default:
    node = <Home />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary><LanguageProvider>{node}</LanguageProvider></AppErrorBoundary>,
);
