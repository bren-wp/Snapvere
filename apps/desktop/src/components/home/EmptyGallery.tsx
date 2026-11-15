import { ImageOff } from "lucide-react";
import { useLanguage } from "../../lib/LanguageProvider";

export default function EmptyGallery({ onCapture, hasQuery }: { onCapture: () => void; hasQuery: boolean }) {
  const { t } = useLanguage();
  return (
    <div className="grid h-full place-items-center text-center">
      <div className="max-w-sm">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-elevated/60 ring-1 ring-white/10">
          <ImageOff size={26} className="text-muted" />
        </div>
        <h2 className="mb-1 text-lg font-semibold tracking-tight">{hasQuery ? t("No results") : t("No screenshots yet")}</h2>
        <p className="mb-5 text-sm text-muted">
          {t(hasQuery ? "Try a different term." : "Use a shortcut or the button to take your first screenshot.")}
        </p>
        {!hasQuery && (
          <button onClick={onCapture} className="snapvere-btn-primary rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 active:scale-95">
            {t("Capture region")}
          </button>
        )}
      </div>
    </div>
  );
}
