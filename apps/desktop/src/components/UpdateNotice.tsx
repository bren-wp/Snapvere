import { useCallback, useEffect, useRef, useState } from "react";
import type { Language } from "../lib/i18n";
import { useLanguage } from "../lib/LanguageProvider";
import { checkForUpdates, type AvailableUpdate } from "../lib/updateFeed";
import { version as installedVersion } from "../../package.json";

type TextSet = Readonly<{
  available: string; check: string; checking: string; upToDate: string;
  unreachable: string; download: string; settings: string; close: string; automatic: string;
}>;
const en: TextSet = {
  available: "New Snapvere version available", check: "Check for updates",
  checking: "Checking for updates…", upToDate: "You have the latest version.",
  unreachable: "Update server is unavailable. Try again later.",
  download: "Open official download", settings: "View update in Settings", close: "Dismiss",
  automatic: "Check automatically on startup",
};
const words: Partial<Record<Language, TextSet>> = {
  hr: { available: "Dostupna je nova verzija Snapverea", check: "Provjeri ažuriranja",
    checking: "Provjeravam ažuriranja…", upToDate: "Imate najnoviju verziju.",
    unreachable: "Poslužitelj za ažuriranja nije dostupan. Pokušajte poslije.",
    download: "Otvori službeno preuzimanje", settings: "Pogledaj ažuriranje u postavkama", close: "Zatvori", automatic: "Provjeri automatski pri pokretanju" },
  de: { available: "Neue Snapvere-Version verfügbar", check: "Auf Updates prüfen",
    checking: "Suche nach Updates…", upToDate: "Sie haben die neueste Version.",
    unreachable: "Update-Server nicht erreichbar. Später erneut versuchen.",
    download: "Offizielle Downloadseite öffnen", settings: "Update in Einstellungen ansehen", close: "Schließen", automatic: "Beim Start automatisch prüfen" },
  es: { available: "Nueva versión de Snapvere disponible", check: "Buscar actualizaciones",
    checking: "Buscando actualizaciones…", upToDate: "Tienes la última versión.",
    unreachable: "Servidor de actualizaciones no disponible. Inténtalo más tarde.",
    download: "Abrir descarga oficial", settings: "Ver actualización en Ajustes", close: "Cerrar", automatic: "Comprobar automáticamente al iniciar" },
  fr: { available: "Nouvelle version de Snapvere disponible", check: "Rechercher des mises à jour",
    checking: "Recherche de mises à jour…", upToDate: "Vous avez la dernière version.",
    unreachable: "Serveur de mises à jour indisponible. Réessayez plus tard.",
    download: "Ouvrir le téléchargement officiel", settings: "Voir la mise à jour dans Paramètres", close: "Fermer", automatic: "Vérifier automatiquement au démarrage" },
  it: { available: "Nuova versione di Snapvere disponibile", check: "Controlla aggiornamenti",
    checking: "Ricerca aggiornamenti…", upToDate: "Hai l'ultima versione.",
    unreachable: "Server degli aggiornamenti non disponibile. Riprova più tardi.",
    download: "Apri download ufficiale", settings: "Visualizza aggiornamento in Impostazioni", close: "Chiudi", automatic: "Controlla automaticamente all'avvio" },
  pt: { available: "Nova versão do Snapvere disponível", check: "Procurar atualizações",
    checking: "A procurar atualizações…", upToDate: "Tem a versão mais recente.",
    unreachable: "Servidor de atualizações indisponível. Tente mais tarde.",
    download: "Abrir transferência oficial", settings: "Ver atualização nas Definições", close: "Fechar", automatic: "Verificar automaticamente ao iniciar" },
  nl: { available: "Nieuwe Snapvere-versie beschikbaar", check: "Controleren op updates",
    checking: "Updates controleren…", upToDate: "Je hebt de nieuwste versie.",
    unreachable: "Updateserver niet beschikbaar. Probeer het later opnieuw.",
    download: "Officiële download openen", settings: "Update in Instellingen bekijken", close: "Sluiten", automatic: "Automatisch controleren bij starten" },
  pl: { available: "Dostępna jest nowa wersja Snapvere", check: "Sprawdź aktualizacje",
    checking: "Sprawdzanie aktualizacji…", upToDate: "Masz najnowszą wersję.",
    unreachable: "Serwer aktualizacji jest niedostępny. Spróbuj później.",
    download: "Otwórz oficjalną stronę pobierania", settings: "Pokaż aktualizację w Ustawieniach", close: "Zamknij", automatic: "Sprawdzaj automatycznie przy uruchomieniu" },
  cs: { available: "Je dostupná nová verze Snapvere", check: "Zkontrolovat aktualizace",
    checking: "Kontrola aktualizací…", upToDate: "Máte nejnovější verzi.",
    unreachable: "Aktualizační server není dostupný. Zkuste to později.",
    download: "Otevřít oficiální stažení", settings: "Zobrazit aktualizaci v Nastavení", close: "Zavřít", automatic: "Automaticky kontrolovat při spuštění" },
  sk: { available: "Je dostupná nová verzia Snapvere", check: "Skontrolovať aktualizácie",
    checking: "Kontrola aktualizácií…", upToDate: "Máte najnovšiu verziu.",
    unreachable: "Aktualizačný server nie je dostupný. Skúste to neskôr.",
    download: "Otvoriť oficiálne stiahnutie", settings: "Zobraziť aktualizáciu v Nastaveniach", close: "Zavrieť", automatic: "Automaticky kontrolovať pri spustení" },
  sl: { available: "Na voljo je nova različica Snapvere", check: "Preveri posodobitve",
    checking: "Preverjanje posodobitev…", upToDate: "Imate najnovejšo različico.",
    unreachable: "Strežnik za posodobitve ni dosegljiv. Poskusite pozneje.",
    download: "Odpri uradni prenos", settings: "Poglej posodobitev v nastavitvah", close: "Zapri", automatic: "Samodejno preveri ob zagonu" },
};

export default function UpdateNotice({
  mode, onAction,
}: {
  mode: "home" | "settings";
  onAction: () => void | Promise<void>;
}) {
  const { language } = useLanguage();
  const w = words[language] ?? en;
  const [available, setAvailable] = useState<AvailableUpdate | null>(null);
  const [state, setState] = useState<"checking" | "current" | "error">("checking");
  const [dismissed, setDismissed] = useState(false);
  const [autoEnabled, setAutoEnabled] = useState(() => {
    try { return localStorage.getItem("snapvere-auto-update-check") !== "false"; }
    catch { return true; }
  });
  const controller = useRef<AbortController | null>(null);

  const check = useCallback(async () => {
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    setState("checking");
    try {
      const info = await checkForUpdates(installedVersion, active.signal);
      if (!active.signal.aborted) {
        setAvailable(info);
        setDismissed(false);
        setState("current");
      }
    } catch (error) {
      if (!active.signal.aborted) {
        // Network errors must never interrupt capture, recording or Settings.
        console.warn("Snapvere update feed unavailable", error);
        setState("error");
      }
    }
  }, []);
  useEffect(() => {
    if (autoEnabled) void check();
    return () => controller.current?.abort();
  }, [autoEnabled, check]);

  const changeAuto = (enabled: boolean) => {
    setAutoEnabled(enabled);
    try { localStorage.setItem("snapvere-auto-update-check", String(enabled)); }
    catch { /* A blocked store must not break Settings. */ }
    if (!enabled) {
      controller.current?.abort();
      setState("current");
    }
  };

  if (mode === "home" && (!available || dismissed)) return null;
  return (
    <section role="status" aria-live="polite" className="rounded-xl border border-border bg-elevated/80 px-4 py-3 text-sm">
      {available ? (
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <strong className="text-text">{w.available}: {available.version}</strong>
            {available.notes && <p className="mt-1 line-clamp-2 text-xs text-muted">{available.notes}</p>}
          </div>
          <button type="button" onClick={() => void onAction()}
            className="rounded-lg bg-accent px-3 py-2 font-semibold text-white focus-visible:ring-2 focus-visible:ring-accent">
            {mode === "settings" ? w.download : w.settings}
          </button>
          <button type="button" onClick={() => setDismissed(true)}
            className="rounded-lg px-2 py-2 text-muted hover:text-text"
            aria-label={w.close}>{w.close}</button>
        </div>
      ) : mode === "settings" && (
        <p className="text-muted">{state === "checking" ? w.checking : state === "error" ? w.unreachable : w.upToDate}</p>
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
