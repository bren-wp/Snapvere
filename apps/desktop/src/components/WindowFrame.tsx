// Snapvere by Brendigo
import React from "react";
import BrandMark from "./BrandMark";
import { useLanguage } from "../lib/LanguageProvider";
import { APP_NAME, IS_PRO } from "../lib/edition";

/**
 * Shared brand shell for Home, Settings and Editor.
 * Transparent record/overlay windows are deliberately excluded so their
 * coordinate spaces and click-through behaviour cannot change.
 */
export default function WindowFrame({
  title, children,
}: { title?: string; children: React.ReactNode }) {
  const { t } = useLanguage();
  const context = title?.startsWith("Snapvere —") ? t("Editor")
    : title === "Settings" || title?.includes("— Settings") ? t("PREFERENCES") : t("CAPTURE LIBRARY");

  return (
    <div className={`snapvere-app-shell flex h-full w-full min-h-0 flex-col bg-bg text-text ${IS_PRO ? "snapvere-pro-shell" : ""}`}>
      <div className="snapvere-app-brandbar" aria-label={t("Snapvere application header")}>
        <div className="snapvere-app-identity">
          <BrandMark className="snapvere-app-logo" />
          <div className="snapvere-app-identity-text">
            <span className="snapvere-app-wordmark">SNAPVERE{IS_PRO ? " PRO" : ""}</span>
            <span className="snapvere-app-tagline">{t("Capture. Edit. Done.")}</span>
          </div>
        </div>
        <div className="snapvere-app-brandbar-end">
          {IS_PRO && <span className="snapvere-pro-edition-mark" aria-label={APP_NAME}>{APP_NAME}</span>}
          <span className="snapvere-app-context">{context}</span>

        </div>
      </div>
      {children}
    </div>
  );
}
