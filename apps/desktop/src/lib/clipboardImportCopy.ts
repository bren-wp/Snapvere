// Snapvere by Brendigo
import type { Language } from "./i18n";

type ClipboardCopy = Readonly<{ action: string; saved: string; failed: string }>;
const words: Record<Language, ClipboardCopy> = {
  en: { action: "Import from clipboard", saved: "Clipboard screenshot saved in your gallery.", failed: "Clipboard import failed. Copy a PNG image from the browser editor and try again." },
  hr: { action: "Uvezi iz međuspremnika", saved: "Slika iz međuspremnika spremljena je u galeriju.", failed: "Uvoz nije uspio. Kopirajte PNG iz pregledničkog uređivača i pokušajte ponovno." },
  de: { action: "Aus Zwischenablage importieren", saved: "Screenshot aus der Zwischenablage in der Galerie gespeichert.", failed: "Import fehlgeschlagen. Kopieren Sie ein PNG aus dem Browsereditor und versuchen Sie es erneut." },
  es: { action: "Importar del portapapeles", saved: "Captura del portapapeles guardada en la galería.", failed: "No se pudo importar. Copia un PNG desde el editor del navegador e inténtalo de nuevo." },
  fr: { action: "Importer du presse-papiers", saved: "Capture du presse-papiers enregistrée dans la galerie.", failed: "Import impossible. Copiez un PNG depuis l’éditeur du navigateur et réessayez." },
  it: { action: "Importa dagli appunti", saved: "Schermata dagli appunti salvata nella galleria.", failed: "Importazione non riuscita. Copia un PNG dall’editor del browser e riprova." },
  pt: { action: "Importar da área de transferência", saved: "Captura da área de transferência guardada na galeria.", failed: "Falha ao importar. Copie um PNG do editor do navegador e tente novamente." },
  nl: { action: "Importeren van klembord", saved: "Schermafbeelding van klembord opgeslagen in galerij.", failed: "Import mislukt. Kopieer een PNG vanuit de browsereditor en probeer opnieuw." },
  pl: { action: "Importuj ze schowka", saved: "Zrzut ekranu ze schowka zapisany w galerii.", failed: "Import nieudany. Skopiuj PNG z edytora przeglądarki i spróbuj ponownie." },
  cs: { action: "Importovat ze schránky", saved: "Snímek ze schránky byl uložen do galerie.", failed: "Import se nezdařil. Zkopírujte PNG z editoru prohlížeče a zkuste to znovu." },
  sk: { action: "Importovať zo schránky", saved: "Snímka zo schránky bola uložená do galérie.", failed: "Import zlyhal. Skopírujte PNG z editora prehliadača a skúste to znova." },
  sl: { action: "Uvozi iz odložišča", saved: "Posnetek iz odložišča je shranjen v galerijo.", failed: "Uvoz ni uspel. Kopirajte PNG iz urejevalnika brskalnika in poskusite znova." },
};
export function clipboardImportCopy(language: Language): ClipboardCopy {
  return words[language] ?? words.en;
}
