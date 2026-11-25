// Snapvere by Brendigo
import { useState } from "react";
import type { Language } from "../lib/i18n";
import { SAVED_LIMIT } from "../lib/proSavedWorkspaces";

const labels: Record<Language, readonly [string, string, string, string, string, string]> = {
  en: ["Smart collections", "Custom export profiles", "Name", "Save current", "Remove", "Unable to save. Use a unique name (1–48 characters) or remove an existing entry."],
  hr: ["Pametne kolekcije", "Prilagođeni profili izvoza", "Naziv", "Spremi trenutno", "Ukloni", "Spremanje nije uspjelo. Unesite jedinstven naziv (1–48 znakova) ili uklonite postojeći unos."],
  de: ["Intelligente Sammlungen", "Eigene Exportprofile", "Name", "Aktuelle speichern", "Entfernen", "Speichern fehlgeschlagen. Eindeutigen Namen (1–48 Zeichen) verwenden oder einen Eintrag entfernen."],
  es: ["Colecciones inteligentes", "Perfiles de exportación", "Nombre", "Guardar actual", "Eliminar", "No se pudo guardar. Usa un nombre único (1–48 caracteres) o elimina una entrada."],
  fr: ["Collections intelligentes", "Profils d’export personnalisés", "Nom", "Enregistrer", "Supprimer", "Échec de l’enregistrement. Utilisez un nom unique (1–48 caractères) ou supprimez une entrée."],
  it: ["Raccolte intelligenti", "Profili di esportazione", "Nome", "Salva corrente", "Rimuovi", "Salvataggio non riuscito. Usa un nome univoco (1–48 caratteri) o rimuovi una voce."],
  pt: ["Coleções inteligentes", "Perfis de exportação", "Nome", "Guardar atual", "Remover", "Não foi possível guardar. Use um nome único (1–48 caracteres) ou remova uma entrada."],
  nl: ["Slimme collecties", "Aangepaste exportprofielen", "Naam", "Huidige opslaan", "Verwijderen", "Opslaan mislukt. Gebruik een unieke naam (1–48 tekens) of verwijder een item."],
  pl: ["Inteligentne kolekcje", "Własne profile eksportu", "Nazwa", "Zapisz bieżące", "Usuń", "Nie zapisano. Użyj unikalnej nazwy (1–48 znaków) lub usuń wpis."],
  cs: ["Chytré kolekce", "Vlastní profily exportu", "Název", "Uložit aktuální", "Odebrat", "Uložení selhalo. Použijte jedinečný název (1–48 znaků) nebo odeberte položku."],
  sk: ["Inteligentné kolekcie", "Vlastné profily exportu", "Názov", "Uložiť aktuálne", "Odstrániť", "Uloženie zlyhalo. Použite jedinečný názov (1–48 znakov) alebo odstráňte položku."],
  sl: ["Pametne zbirke", "Profili izvoza po meri", "Ime", "Shrani trenutno", "Odstrani", "Shranjevanje ni uspelo. Uporabite enolično ime (1–48 znakov) ali odstranite vnos."],
};

export default function ProSavedWorkspace<T extends { name: string }>({ language, kind, entries, disabled, onSave, onApply, onDelete }: {
  language: Language; kind: "collection" | "export"; entries: readonly T[]; disabled: boolean;
  onSave: (name: string) => void; onApply: (entry: T) => void; onDelete: (name: string) => void;
}) {
  const copy = labels[language] ?? labels.en;
  const [name, setName] = useState("");
  const [error, setError] = useState(false);
  const title = copy[kind === "collection" ? 0 : 1];
  const buttonClass = "snapvere-btn-secondary rounded-full px-3 py-2 text-xs disabled:opacity-50";
  return (
    <details className="basis-full rounded-lg border border-border px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium">{title} · {entries.length}/{SAVED_LIMIT}</summary>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input value={name} maxLength={48} disabled={disabled} aria-label={copy[2]}
          placeholder={copy[2]} onChange={event => { setName(event.target.value); setError(false); }}
          className="min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        <button type="button" className={buttonClass} disabled={disabled || !name.trim() || entries.length >= SAVED_LIMIT}
          onClick={() => { try { onSave(name); setName(""); setError(false); } catch { setError(true); } }}>{copy[3]}</button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {entries.map(entry => <div key={entry.name} className="flex max-w-full items-center gap-1 rounded-lg border border-border p-1">
          <button type="button" className={buttonClass + " min-w-0 truncate"} disabled={disabled}
            title={entry.name} onClick={() => onApply(entry)}>{entry.name}</button>
          <button type="button" className={buttonClass} disabled={disabled} aria-label={copy[4] + ": " + entry.name}
            onClick={() => { try { onDelete(entry.name); setError(false); } catch { setError(true); } }}>{copy[4]}</button>
        </div>)}
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-danger">{copy[5]}</p>}
    </details>
  );
}
