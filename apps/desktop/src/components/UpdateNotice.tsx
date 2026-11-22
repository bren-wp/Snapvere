// Snapvere by Brendigo
import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing } from "lucide-react";
import { ipc } from "../lib/ipc";
import type { Language } from "../lib/i18n";
import { useLanguage } from "../lib/LanguageProvider";
import { autoUpdateChecksEnabled, canCheckWindowsUpdates, checkForUpdates, shouldShowReleaseNotice, type AvailableUpdate } from "../lib/updateFeed";
import { version as installedVersion } from "../../package.json";

type TextSet = Readonly<{
  available: string; check: string; checking: string; upToDate: string;
  unreachable: string; download: string; settings: string; close: string; automatic: string; disabled: string;
}>;
const en: TextSet = {
  available: "New Snapvere version available", check: "Check for updates",
  checking: "Checking for updates…", upToDate: "You have the latest version.",
  unreachable: "Update server is unavailable. Try again later.",
  download: "Open official download", settings: "View update in Settings", close: "Dismiss",
  automatic: "Check automatically on startup",
  disabled: "Automatic checks are off. Use Check for updates to check manually.",
};
const words: Partial<Record<Language, TextSet>> = {
  hr: { available: "Dostupna je nova verzija Snapverea", check: "Provjeri ažuriranja",
    checking: "Provjeravam ažuriranja…", upToDate: "Imate najnoviju verziju.",
    unreachable: "Poslužitelj za ažuriranja nije dostupan. Pokušajte poslije.",
    download: "Otvori službeno preuzimanje", settings: "Pogledaj ažuriranje u postavkama", close: "Zatvori", automatic: "Provjeri automatski pri pokretanju", disabled: "Automatska provjera je isključena. Ažuriranja možete provjeriti ručno." },
  de: { available: "Neue Snapvere-Version verfügbar", check: "Auf Updates prüfen",
    checking: "Suche nach Updates…", upToDate: "Sie haben die neueste Version.",
    unreachable: "Update-Server nicht erreichbar. Später erneut versuchen.",
    download: "Offizielle Downloadseite öffnen", settings: "Update in Einstellungen ansehen", close: "Schließen", automatic: "Beim Start automatisch prüfen", disabled: "Automatische Updatesuche ist aus. Nutzen Sie die manuelle Prüfung." },
  es: { available: "Nueva versión de Snapvere disponible", check: "Buscar actualizaciones",
    checking: "Buscando actualizaciones…", upToDate: "Tienes la última versión.",
    unreachable: "Servidor de actualizaciones no disponible. Inténtalo más tarde.",
    download: "Abrir descarga oficial", settings: "Ver actualización en Ajustes", close: "Cerrar", automatic: "Comprobar automáticamente al iniciar", disabled: "La búsqueda automática está desactivada. Puede comprobar manualmente." },
  fr: { available: "Nouvelle version de Snapvere disponible", check: "Rechercher des mises à jour",
    checking: "Recherche de mises à jour…", upToDate: "Vous avez la dernière version.",
    unreachable: "Serveur de mises à jour indisponible. Réessayez plus tard.",
    download: "Ouvrir le téléchargement officiel", settings: "Voir la mise à jour dans Paramètres", close: "Fermer", automatic: "Vérifier automatiquement au démarrage", disabled: "La vérification automatique est désactivée. Vérifiez manuellement." },
  it: { available: "Nuova versione di Snapvere disponibile", check: "Controlla aggiornamenti",
    checking: "Ricerca aggiornamenti…", upToDate: "Hai l'ultima versione.",
    unreachable: "Server degli aggiornamenti non disponibile. Riprova più tardi.",
    download: "Apri download ufficiale", settings: "Visualizza aggiornamento in Impostazioni", close: "Chiudi", automatic: "Controlla automaticamente all'avvio", disabled: "La verifica automatica è disattivata. Controlla manualmente." },
  pt: { available: "Nova versão do Snapvere disponível", check: "Procurar atualizações",
    checking: "A procurar atualizações…", upToDate: "Tem a versão mais recente.",
    unreachable: "Servidor de atualizações indisponível. Tente mais tarde.",
    download: "Abrir transferência oficial", settings: "Ver atualização nas Definições", close: "Fechar", automatic: "Verificar automaticamente ao iniciar", disabled: "A verificação automática está desativada. Verifique manualmente." },
  nl: { available: "Nieuwe Snapvere-versie beschikbaar", check: "Controleren op updates",
    checking: "Updates controleren…", upToDate: "Je hebt de nieuwste versie.",
    unreachable: "Updateserver niet beschikbaar. Probeer het later opnieuw.",
    download: "Officiële download openen", settings: "Update in Instellingen bekijken", close: "Sluiten", automatic: "Automatisch controleren bij starten", disabled: "Automatisch controleren staat uit. Controleer handmatig." },
  pl: { available: "Dostępna jest nowa wersja Snapvere", check: "Sprawdź aktualizacje",
    checking: "Sprawdzanie aktualizacji…", upToDate: "Masz najnowszą wersję.",
    unreachable: "Serwer aktualizacji jest niedostępny. Spróbuj później.",
    download: "Otwórz oficjalną stronę pobierania", settings: "Pokaż aktualizację w Ustawieniach", close: "Zamknij", automatic: "Sprawdzaj automatycznie przy uruchomieniu", disabled: "Automatyczne sprawdzanie jest wyłączone. Sprawdź ręcznie." },
  cs: { available: "Je dostupná nová verze Snapvere", check: "Zkontrolovat aktualizace",
    checking: "Kontrola aktualizací…", upToDate: "Máte nejnovější verzi.",
    unreachable: "Aktualizační server není dostupný. Zkuste to později.",
    download: "Otevřít oficiální stažení", settings: "Zobrazit aktualizaci v Nastavení", close: "Zavřít", automatic: "Automaticky kontrolovat při spuštění", disabled: "Automatická kontrola je vypnutá. Zkontrolujte ručně." },
  sk: { available: "Je dostupná nová verzia Snapvere", check: "Skontrolovať aktualizácie",
    checking: "Kontrola aktualizácií…", upToDate: "Máte najnovšiu verziu.",
    unreachable: "Aktualizačný server nie je dostupný. Skúste to neskôr.",
    download: "Otvoriť oficiálne stiahnutie", settings: "Zobraziť aktualizáciu v Nastaveniach", close: "Zavrieť", automatic: "Automaticky kontrolovať pri spustení", disabled: "Automatická kontrola je vypnutá. Skontrolujte ručne." },
  sl: { available: "Na voljo je nova različica Snapvere", check: "Preveri posodobitve",
    checking: "Preverjanje posodobitev…", upToDate: "Imate najnovejšo različico.",
    unreachable: "Strežnik za posodobitve ni dosegljiv. Poskusite pozneje.",
    download: "Odpri uradni prenos", settings: "Poglej posodobitev v nastavitvah", close: "Zapri", automatic: "Samodejno preveri ob zagonu", disabled: "Samodejno preverjanje je izklopljeno. Preverite ročno." },
};

const AUTO_KEY = "snapvere-auto-update-check";
const DISMISS_KEY = "snapvere-dismissed-update-version";

export default function UpdateNotice({
  mode, onAction, raised = false,
}: {
  mode: "home" | "settings";
  onAction: () => void | Promise<void>;
  /** Raise the corner notice above a transient Home action toast. */
  raised?: boolean;
}) {
  const { language } = useLanguage();
  const w = words[language] ?? en;
  const [available, setAvailable] = useState<AvailableUpdate | null>(null);
  const [state, setState] = useState<"idle" | "checking" | "current" | "error">("idle");
  // Closing one release should not reopen its banner on every window focus
  // or hourly fetch; a newly published version is shown again.
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(() => {
    try { return localStorage.getItem(DISMISS_KEY); }
    catch { return null; }
  });
  const [autoEnabled, setAutoEnabled] = useState(() => {
    try { return autoUpdateChecksEnabled(localStorage.getItem(AUTO_KEY)); }
    catch { return false; }
  });
  const [platformOs, setPlatformOs] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    // Fail closed until the trusted native platform has been identified.
    void ipc.getPlatformCapabilities().then((caps) => {
      if (mounted) setPlatformOs(caps.os);
    }).catch((error) => {
      // A missing native bridge must not initiate networking or leak diagnostic details.
      void error;
    });
    return () => { mounted = false; };
  }, []);
  const controller = useRef<AbortController | null>(null);
  const lastAttemptAt = useRef(0);

  const check = useCallback(async () => {
    if (!canCheckWindowsUpdates(platformOs)) {
      controller.current?.abort();
      setAvailable(null);
      setState("idle");
      return;
    }
    lastAttemptAt.current = Date.now();
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    setState("checking");
    try {
      const info = await checkForUpdates(installedVersion, active.signal);
      if (!active.signal.aborted) {
        setAvailable(info);
        setState("current");
      }
    } catch (error) {
      if (!active.signal.aborted) {
        // Network errors must never interrupt capture, recording or Settings.
        // Network failures are displayed locally without forwarding logs.
        void error;
        setAvailable(null);
        setState("error");
      }
    }
  }, [platformOs]);
  useEffect(() => {
    if (!canCheckWindowsUpdates(platformOs)) {
      controller.current?.abort();
      setAvailable(null);
      setState("idle");
      return;
    }
    if (autoEnabled) void check();
    else setState("idle");
    // Check again while the app stays open. A minimized-to-tray window checks
    // when it regains focus, avoiding polling a hidden capture application.
    const onFocus = () => {
      // WebView2's distinct Settings/Home windows may share localStorage but
      // need not deliver a cross-window storage event consistently. Reconcile
      // both saved preferences before scheduling another network request.
      let enabledOnDisk = autoEnabled;
      try {
        enabledOnDisk = autoUpdateChecksEnabled(localStorage.getItem(AUTO_KEY));
        setDismissedVersion(localStorage.getItem(DISMISS_KEY));
      } catch { /* Keep current in-memory preference if storage is blocked. */ }
      if (enabledOnDisk !== autoEnabled) {
        setAutoEnabled(enabledOnDisk);
        if (!enabledOnDisk) {
          controller.current?.abort();
          setAvailable(null);
          setState("idle");
        }
        // Enabling triggers one request through the effect, not two.
        return;
      }
      if (enabledOnDisk && Date.now() - lastAttemptAt.current >= 5 * 60_000) {
        void check();
      }
    };
    const interval = window.setInterval(() => {
      if (autoEnabled && document.visibilityState === "visible") void check();
    }, 60 * 60_000);
    window.addEventListener("focus", onFocus);
    return () => {
      controller.current?.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [platformOs, autoEnabled, check]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === AUTO_KEY) {
        setAutoEnabled(autoUpdateChecksEnabled(event.newValue));
        if (!autoUpdateChecksEnabled(event.newValue)) {
          controller.current?.abort();
          setAvailable(null);
          setState("idle");
        }
      }
      if (event.key === DISMISS_KEY) setDismissedVersion(event.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const dismiss = () => {
    if (!available) return;
    setDismissedVersion(available.version);
    try { localStorage.setItem(DISMISS_KEY, available.version); }
    catch { /* Dismiss still works for this session. */ }
  };

  const changeAuto = (enabled: boolean) => {
    setAutoEnabled(enabled);
    try { localStorage.setItem(AUTO_KEY, String(enabled)); }
    catch { /* A blocked store must not break Settings. */ }
    if (!enabled) {
      controller.current?.abort();
      setAvailable(null);
      setState("idle");
    }
  };

  // Linux previews do not consume the Windows-only version feed.
  // Until there is a separate authenticated Linux feed, use manual
  // GitHub Releases navigation via Settings / About instead.
  if (!canCheckWindowsUpdates(platformOs)) return null;
  if (mode === "home" && !shouldShowReleaseNotice(available, dismissedVersion)) return null;
  return (
    <section
      role="status"
      aria-live="polite"
      aria-label={available ? w.available : w.check}
      className={mode === "home"
        ? `fixed ${raised ? "bottom-20" : "bottom-4"} right-4 z-30 w-[min(380px,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-4 text-sm shadow-card ring-1 ring-white/10`
        : "rounded-xl border border-border bg-elevated/80 px-4 py-3 text-sm"}
    >
      {available ? (
        <div className="flex flex-wrap items-center gap-3">
          {mode === "home" && <BellRing size={20} className="shrink-0 text-accent" aria-hidden="true" />}
          <div className="min-w-0 flex-1">
            <strong className="text-text">{w.available}: {available.version}</strong>
            {available.notes && <p className="mt-1 line-clamp-2 text-xs text-muted">{available.notes}</p>}
          </div>
          <button type="button" onClick={() => void onAction()}
            className="rounded-lg bg-accent px-3 py-2 font-semibold text-white focus-visible:ring-2 focus-visible:ring-accent">
            {mode === "settings" ? w.download : w.settings}
          </button>
          <button type="button" onClick={dismiss}
            className="rounded-lg px-2 py-2 text-muted hover:text-text"
            aria-label={w.close}>{w.close}</button>
        </div>
      ) : mode === "settings" && (
        <p className="text-muted">{state === "checking" ? w.checking : state === "error" ? w.unreachable : state === "idle" ? w.disabled : w.upToDate}</p>
      )}
      {mode === "settings" && (
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <button type="button" disabled={state === "checking"} onClick={() => void check()}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50">
            {w.check}
          </button>
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={autoEnabled} onChange={(e) => changeAuto(e.target.checked)} />
            {w.automatic}
          </label>
        </div>
      )}
    </section>
  );
}
