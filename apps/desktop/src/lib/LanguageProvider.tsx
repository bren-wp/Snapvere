import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { ipc } from "./ipc";
import { normalizeLanguage, translate, type Language } from "./i18n";

interface LanguageContextValue {
  language: Language;
  t: (englishText: string) => string;
  changeLanguage: (language: Language) => Promise<void>;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  // English always renders immediately; a saved valid locale replaces it.
  const [language, setLanguage] = useState<Language>("en");

  useEffect(() => {
    let mounted = true;
    let changedByEvent = false;
    const subscription = listen<string>("snapvere:language-changed", (event) => {
      changedByEvent = true;
      if (mounted) setLanguage(normalizeLanguage(event.payload));
    });
    // Prevent an unavailable native event bridge from producing an unhandled rejection.
    void subscription.catch(() => {});
    void ipc.getAppLanguage()
      .then((saved) => {
        if (mounted && !changedByEvent) setLanguage(normalizeLanguage(saved));
      })
      .catch(() => { /* Use English when the native bridge is unavailable. */ });
    return () => {
      mounted = false;
      void subscription.then((unlisten) => unlisten()).catch(() => {});
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const changeLanguage = useCallback(async (next: Language) => {
    const validated = normalizeLanguage(next);
    await ipc.setAppLanguage(validated);
    setLanguage(validated);
  }, []);

  const t = useCallback((englishText: string) => translate(language, englishText), [language]);
  const value = useMemo(() => ({ language, t, changeLanguage }), [language, t, changeLanguage]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("LanguageProvider must wrap the application");
  return context;
}
