// Snapvere by Brendigo
import { useEffect, useState } from "react";
import type { Store } from "@tauri-apps/plugin-store";
import type { AppSettings } from "../windows/settings/preferences";
import type { Language } from "../lib/i18n";
import { PRO_PROFILE_KEY, profileSlots, safeProfile, presetProfile, type Profile, type PresetName } from "../lib/proProfiles";
import { proProfileCopy } from "../lib/proProfileCopy";

export default function ProRecordingProfiles({ store, current, linux, language, apply }: {
  store: Store | null; current: AppSettings; linux: boolean;
  language: Language; apply: (settings: Profile) => Promise<void>;
}) {
  const copy = proProfileCopy(language);
  const [slots, setSlots] = useState<(Profile | null)[]>(() => profileSlots(null));
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    if (store) void store.get(PRO_PROFILE_KEY)
      .then(value => { if (active) setSlots(profileSlots(value)); })
      .catch(() => { if (active) setStatus(copy.failed); });
    return () => { active = false; };
  }, [store]);
  const perform = async (fn: () => Promise<string>) => {
    if (busy) return;
    setBusy(true);
    setStatus("");
    try { setStatus(await fn()); } catch { setStatus(copy.failed); }
    finally { setBusy(false); }
  };
  const persist = async (next: (Profile | null)[]) => {
    if (!store) throw new Error("Store is not available");
    await store.set(PRO_PROFILE_KEY, next);
    await store.save();
    setSlots(next);
  };
  return (
    <div className="mt-5 rounded-xl border border-border bg-elevated/30 p-4">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-text">{copy.title}</h3>
        <span className="rounded-md border border-accent/40 px-2 py-0.5 text-xs font-semibold text-accent">PRO</span>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-muted">{copy.description}</p>
      <div className="flex flex-wrap gap-2">
        {(["tutorial","presentation","compact"] as PresetName[]).map(p => (
          <button type="button" key={p} disabled={!store || busy}
            onClick={() => void perform(async () => { await apply(presetProfile(p,linux)); return copy.applied; })}
            className="rounded-lg border border-border px-3 py-2 text-xs font-medium hover:border-accent disabled:opacity-50">{copy[p]}</button>
        ))}
      </div>
      <div className="mt-4 grid gap-2">
        {slots.map((item,i) => (
          <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2">
            <span className="text-xs text-muted">{i+1} · {item ? "✓" : copy.empty}</span>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={!store||busy}
                onClick={() => void perform(async () => {
                  const profile = safeProfile(current,linux);
                  if (!profile) throw new Error("Invalid profile");
                  const next=[...slots];next[i]=profile;await persist(next);return copy.saved;
                })}
                className="rounded-md border border-border px-2.5 py-1.5 text-xs hover:border-accent disabled:opacity-50">{copy.save}</button>
              <button type="button" disabled={!item||!store||busy}
                onClick={() => void perform(async () => { const data=safeProfile(item,linux);if(!data)throw new Error("Invalid profile");await apply(data);return copy.applied; })}
                className="rounded-md border border-border px-2.5 py-1.5 text-xs hover:border-accent disabled:opacity-50">{copy.apply}</button>
              <button type="button" disabled={!item||!store||busy}
                onClick={() => void perform(async () => { const next=[...slots];next[i]=null;await persist(next);return copy.cleared; })}
                className="rounded-md border border-border px-2.5 py-1.5 text-xs hover:border-accent disabled:opacity-50">{copy.clear}</button>
            </div>
          </div>
        ))}
      </div>
      {linux && <p className="mt-3 text-xs text-muted">{copy.linux}</p>}
      {status && <p className="mt-3 text-xs text-muted" role="status" aria-live="polite">{status}</p>}
    </div>
  );
}
