// Snapvere by Brendigo
/* ─────────────────────────────────────────────────────────────
   Snapvere landing — interaktivnost

   Download linkovi i verzija žive u config.js.
   Gumbi s [data-os] vode na /download/?os=… (thank-you stranica).
   Nema analitike, praćenja klikova ni slanja korisničkih podataka.
   ───────────────────────────────────────────────────────────── */
const CFG = window.SNAPVERE || { version: "", downloads: {} };
const OS_LABEL = { windows: "Windows", mac: "macOS" };

/* ── detekcija operativnog sustava posjetitelja ──────────────── */
function detectOS() {
  const p = (navigator.userAgentData?.platform || navigator.platform || "")
    .toLowerCase();
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod|android/.test(ua)) return null; // mobitel → ne nameći ništa
  if (p.includes("mac") || ua.includes("mac")) return "mac";
  if (p.includes("win") || ua.includes("win")) return "windows";
  return null; // Linux / nepoznato
}

/* ── poveži download gumbe ───────────────────────────────────── */
function wireDownloads() {
  const os = detectOS();
  const ready = (target) => Boolean(CFG.downloads[target]);

  document.querySelectorAll("[data-os]").forEach((el) => {
    const target = el.dataset.os;

    if (ready(target)) {
      el.setAttribute("href", `/download/?os=${target}`);
    } else {
      // Unreleased platform: show only a local message.
      el.addEventListener("click", (e) => {
        e.preventDefault();
        flashHint(`The ${OS_LABEL[target]} build is still in testing. Windows is ready now.`);
      });
    }

    // istakni gumb za posjetiteljev OS — samo ako se stvarno može skinuti
    if (os === target && ready(os) && el.classList.contains("btn")) {
      el.setAttribute("data-recommended", "");
    }
  });

  // stiša "drugi" gumb da preporučeni dominira
  if (os && ready(os)) {
    document
      .querySelectorAll(`.btn[data-os]:not([data-os="${os}"])`)
      .forEach((el) => el.classList.replace("btn--primary", "btn--ghost"));
    document
      .querySelectorAll(`.btn[data-os="${os}"]`)
      .forEach((el) => el.classList.replace("btn--ghost", "btn--primary"));
  }

  const hint = document.getElementById("os-hint");
  if (hint) {
    const v = CFG.version ? `v${CFG.version} · ` : "";
    if (os && ready(os)) {
      hint.textContent = `Detected: ${OS_LABEL[os]} · ${v}free, no account`;
    } else if (os === "mac") {
      hint.textContent = "The macOS build is in testing — Windows 10/11 is ready now.";
    } else {
      hint.textContent = `${v}Windows 10/11, 64-bit · free, no account`;
    }
  }
}

let hintTimer;
function flashHint(msg) {
  const hint = document.getElementById("os-hint");
  if (!hint) return;
  hint.textContent = msg;
  hint.style.color = "#3d9bff";
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => {
    hint.style.color = "";
  }, 2600);
}

/* ── reveal na scroll ────────────────────────────────────────── */
function wireReveal() {
  const els = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    els.forEach((el) => el.classList.add("is-in"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
  );
  els.forEach((el) => io.observe(el));
}

/* ── nav dobiva pozadinu nakon scrolla ───────────────────────── */
function wireNav() {
  const nav = document.getElementById("nav");
  if (!nav) return;
  const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 12);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
}

/* ── init ────────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  wireDownloads();
  wireReveal();
  wireNav();
  const y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();
});
