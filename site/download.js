// Snapvere by Brendigo
/* ─────────────────────────────────────────────────────────────
   Snapvere — /download/ (thank-you) stranica

   /download/?os=windows&from=hero
     → download počinje nakon korisničkog odabira, bez analitike.
   /download/ bez ?os
     → samo gumb, ništa se ne skida samo od sebe (sigurno za linkove
       poput /download/#install i za posjetitelje iz tražilice).
   Mobitel / OS bez builda → bez auto-downloada, jasna poruka.
   ───────────────────────────────────────────────────────────── */
const CFG = window.SNAPVERE || { version: "", downloads: {} };
const OS_LABEL = Object.freeze({ windows: "Windows", mac: "macOS" });

// URL parameters must match explicit keys: objects also inherit names such as
// "constructor", "toString" and "__proto__", which are not operating systems.
function supportedOS(value) {
  return typeof value === "string" && Object.hasOwn(OS_LABEL, value) ? value : null;
}
const AUTO_DELAY_MS = 900;

function detectOS() {
  const p = (navigator.userAgentData?.platform || navigator.platform || "")
    .toLowerCase();
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod|android/.test(ua)) return "mobile";
  if (p.includes("mac") || ua.includes("mac")) return "mac";
  if (p.includes("win") || ua.includes("win")) return "windows";
  return null;
}

const $ = (id) => document.getElementById(id);

function fileName(url) {
  return decodeURIComponent(url.split("/").pop() || "");
}

// Gumb pokazuje ikonu, tekst i ime fajla za zadani OS.
function setButton(os) {
  const url = CFG.downloads[os] || "";
  const v = CFG.version ? ` · v${CFG.version}` : "";
  $("dl-btn").href = url;
  $("dl-btn-text").textContent = `Download for ${OS_LABEL[os]}`;
  $("dl-file").textContent = `${fileName(url)}${v}`;
  document.querySelectorAll("#dl-btn [data-icon]").forEach((svg) => {
    svg.hidden = svg.dataset.icon !== os;
  });
  return url;
}

function wireEditionLinks() {
  document.querySelectorAll("[data-download-edition]").forEach((el) => {
    const key = el.dataset.downloadEdition;
    const url = CFG.downloads[key];
    if (!url) { el.hidden = true; return; }
    el.href = url;
  });
}

function render() {
  wireEditionLinks();
  const q = new URLSearchParams(location.search);
  const wanted = supportedOS(q.get("os"));
  const device = detectOS();
  const v = CFG.version ? `v${CFG.version} ` : "";

  const card = $("dl-card");
  const title = $("dl-title");
  const sub = $("dl-sub");
  const note = $("dl-note");
  const started = () => {
    card.dataset.state = "started";
    title.textContent = "Thanks for downloading!";
  };

  // Traženi OS bez builda (zasad macOS) → poruka + Windows kao alternativa.
  const target = wanted || (device === "mac" ? "mac" : "windows");
  if (!CFG.downloads[target]) {
    card.dataset.state = "soon";
    title.textContent = `Snapvere for ${OS_LABEL[target]} is in testing`;
    sub.textContent =
      "It lands here as soon as it’s cleared for release. The Windows build is ready today.";
    const winUrl = setButton("windows");
    note.textContent = "Windows editions are available below. Other platforms will appear here after release testing.";
    $("dl-btn").addEventListener("click", () => {
      started();
    });
    return;
  }

  const url = setButton(target);
  // Auto-download samo kad je posjetitelj kliknuo gumb za taj OS i nije na mobitelu
  // ni na očito drugom OS-u (Mac korisnik koji klikne Windows dobije gumb, ne fajl).
  const auto = wanted === target && device !== "mobile" && (device === target || device === null);

  if (auto) {
    card.dataset.state = "starting";
    title.textContent = "Your download is starting…";
    sub.textContent = `Snapvere ${v}for ${OS_LABEL[target]} — free, no account, no ads.`;
    // DOM API only: no HTML string injection in the download flow.
    const retry = document.createElement("a");
    retry.id = "dl-retry";
    retry.textContent = "Download it directly";
    retry.href = url;
    note.replaceChildren(document.createTextNode("Didn’t start? "), retry, document.createTextNode("."));

    setTimeout(() => {
      window.location.assign(url);
      started();
    }, AUTO_DELAY_MS);
  } else {
    card.dataset.state = "ready";
    if (device === "mobile") {
      sub.textContent = `Snapvere is a desktop app. Open this page on your ${OS_LABEL[target]} computer to install it.`;
    } else if (wanted && device && device !== target) {
      sub.textContent = `This looks like a ${OS_LABEL[device]} computer — the installer below is for ${OS_LABEL[target]}.`;
    }
    $("dl-btn").addEventListener("click", () => {
      started();
    });
  }
}

function wireNav() {
  const nav = $("nav");
  if (!nav) return;
  const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 12);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
}

document.addEventListener("DOMContentLoaded", () => {
  render();
  wireNav();
  const y = $("year");
  if (y) y.textContent = new Date().getFullYear();
});
