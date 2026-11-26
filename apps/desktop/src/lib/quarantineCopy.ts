// Snapvere by Brendigo
const copy: Record<string, readonly [string, string, string, string]> = {
  en: ["Restore last removed capture", "Capture restored.", "No capture restored.", "Could not restore the capture. Recovery records are retained."],
  hr: ["Vrati posljednju uklonjenu snimku", "Snimka vraćena.", "Nijedna snimka nije vraćena.", "Snimku nije moguće vratiti. Zapisi za oporavak su sačuvani."],
  de: ["Zuletzt entfernte Aufnahme wiederherstellen", "Aufnahme wiederhergestellt.", "Keine Aufnahme wiederhergestellt.", "Wiederherstellung fehlgeschlagen. Wiederherstellungseinträge bleiben erhalten."],
  es: ["Restaurar última captura retirada", "Captura restaurada.", "No se restauró ninguna captura.", "No se pudo restaurar. Se conservan los registros de recuperación."],
  fr: ["Restaurer la dernière capture retirée", "Capture restaurée.", "Aucune capture restaurée.", "Restauration impossible. Les données de récupération sont conservées."],
  it: ["Ripristina l’ultima acquisizione rimossa", "Acquisizione ripristinata.", "Nessuna acquisizione ripristinata.", "Ripristino non riuscito. I registri di recupero sono conservati."],
  pt: ["Restaurar última captura removida", "Captura restaurada.", "Nenhuma captura restaurada.", "Não foi possível restaurar. Os registos de recuperação são preservados."],
  nl: ["Laatst verwijderde opname herstellen", "Opname hersteld.", "Geen opname hersteld.", "Herstellen mislukt. Herstelgegevens blijven bewaard."],
  pl: ["Przywróć ostatnio usunięty zapis", "Zapis przywrócony.", "Nie przywrócono żadnego zapisu.", "Przywracanie nie powiodło się. Dane odzyskiwania są zachowane."],
  cs: ["Obnovit poslední odebraný snímek", "Snímek obnoven.", "Žádný snímek nebyl obnoven.", "Obnovení se nezdařilo. Záznamy obnovení zůstávají zachovány."],
  sk: ["Obnoviť poslednú odstránenú snímku", "Snímka obnovená.", "Žiadna snímka nebola obnovená.", "Obnovenie zlyhalo. Záznamy obnovy sú zachované."],
  sl: ["Obnovi zadnji odstranjeni posnetek", "Posnetek obnovljen.", "Noben posnetek ni bil obnovljen.", "Obnovitev ni uspela. Zapisi obnovitve so ohranjeni."],
};
export function quarantineCopy(language: string) {
  const [restore, restored, noChange, failed] = copy[language] ?? copy.en;
  return { restore, restored, noChange, failed };
}
