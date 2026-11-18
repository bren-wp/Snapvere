import type { Language } from "./i18n";

/** This is an OS hotkey, not an always-running low-level keyboard hook. */
type PrintScreenCopy = Readonly<{
  enable: string;
  active: string;
  blocked: string;
  startup: string;
}>;
const copy: Record<Language, PrintScreenCopy> = {
  en: {
    enable: "Use Print Screen",
    active: "Print Screen opens Snapvere's screen selection.",
    blocked: "Print Screen is not registered. If Windows opens Snipping Tool, turn off “Use the Print screen key to open screen snipping” in Windows Settings → Accessibility → Keyboard, then try again.",
    startup: "To use Print Screen after signing in, enable Launch on startup under General. Snapvere stays in the tray. A fully closed app cannot receive keyboard shortcuts.",
  },
  hr: {
    enable: "Koristi Print Screen",
    active: "Print Screen otvara Snapvereov odabir područja zaslona.",
    blocked: "Print Screen nije registriran. Ako Windows otvara Alat za izrezivanje, u Postavke sustava Windows → Pristupačnost → Tipkovnica isključite mogućnost otvaranja izrezivanja tipkom Print Screen i pokušajte ponovno.",
    startup: "Za korištenje nakon prijave u Windows uključite Pokreni pri prijavi u odjeljku Općenito. Snapvere će raditi u sistemskoj traci. Potpuno zatvoren program ne može primati tipkovne prečace.",
  },
  de: {
    enable: "Druck-Taste verwenden", active: "Die Druck-Taste öffnet die Snapvere-Bereichsauswahl.",
    blocked: "Druck ist nicht registriert. Deaktivieren Sie die Druck-Taste für das Snipping Tool unter Windows-Einstellungen → Barrierefreiheit → Tastatur und versuchen Sie es erneut.",
    startup: "Für Druck nach der Anmeldung aktivieren Sie Autostart unter Allgemein. Snapvere bleibt im Infobereich. Eine vollständig beendete App kann keine Tastenkürzel empfangen.",
  },
  es: {
    enable: "Usar Impr Pant", active: "Impr Pant abre la selección de pantalla de Snapvere.",
    blocked: "Impr Pant no está registrada. Desactiva su uso para Recortes en Configuración de Windows → Accesibilidad → Teclado y vuelve a intentarlo.",
    startup: "Para usar Impr Pant al iniciar sesión, activa el inicio automático en General. Snapvere seguirá en la bandeja. Una aplicación cerrada no puede recibir atajos.",
  },
  fr: {
    enable: "Utiliser Impr. écran", active: "Impr. écran ouvre la sélection de zone Snapvere.",
    blocked: "Impr. écran n’est pas enregistrée. Désactivez l’ouverture de l’outil Capture avec cette touche dans Paramètres Windows → Accessibilité → Clavier, puis réessayez.",
    startup: "Pour utiliser cette touche dès la connexion, activez le démarrage automatique dans Général. Snapvere reste dans la zone de notification. Une application quittée ne reçoit aucun raccourci.",
  },
  it: {
    enable: "Usa Stamp", active: "Stamp apre la selezione dello schermo di Snapvere.",
    blocked: "Stamp non è registrato. Disattiva l’uso di Stamp per Strumento di cattura in Impostazioni Windows → Accessibilità → Tastiera e riprova.",
    startup: "Per usare Stamp dopo l’accesso, attiva l’avvio automatico in Generali. Snapvere rimane nella barra delle notifiche. Un’app completamente chiusa non riceve scorciatoie.",
  },
  pt: {
    enable: "Usar Print Screen", active: "Print Screen abre a seleção de ecrã do Snapvere.",
    blocked: "Print Screen não está registado. Desative a associação à Ferramenta de Recorte em Definições do Windows → Acessibilidade → Teclado e tente novamente.",
    startup: "Para usar a tecla depois de iniciar sessão, ative Iniciar automaticamente em Geral. O Snapvere permanece na área de notificação. Uma aplicação encerrada não recebe atalhos.",
  },
  nl: {
    enable: "Print Screen gebruiken", active: "Print Screen opent de schermafbeeldingsselectie van Snapvere.",
    blocked: "Print Screen is niet geregistreerd. Schakel de koppeling met Knipprogramma uit onder Windows Instellingen → Toegankelijkheid → Toetsenbord en probeer opnieuw.",
    startup: "Schakel Starten bij aanmelden in onder Algemeen om Print Screen na het aanmelden te gebruiken. Snapvere blijft in het systeemvak. Een afgesloten app ontvangt geen sneltoetsen.",
  },
  pl: {
    enable: "Użyj Print Screen", active: "Print Screen otwiera wybór obszaru w Snapvere.",
    blocked: "Nie zarejestrowano Print Screen. Wyłącz przypisanie do Narzędzia Wycinanie w Ustawienia Windows → Ułatwienia dostępu → Klawiatura i spróbuj ponownie.",
    startup: "Aby korzystać z Print Screen po zalogowaniu, włącz uruchamianie przy logowaniu w Ogólne. Snapvere pozostaje w zasobniku. Zamknięta aplikacja nie odbiera skrótów.",
  },
  cs: {
    enable: "Používat Print Screen", active: "Print Screen otevře výběr oblasti v Snapvere.",
    blocked: "Print Screen není registrována. V Nastavení Windows → Přístupnost → Klávesnice vypněte její přiřazení k nástroji Výstřižky a zkuste to znovu.",
    startup: "Pro používání po přihlášení zapněte spouštění při přihlášení v Obecné. Snapvere zůstane v oznamovací oblasti. Ukončená aplikace nemůže reagovat na zkratky.",
  },
  sk: {
    enable: "Používať Print Screen", active: "Print Screen otvorí výber oblasti v Snapvere.",
    blocked: "Print Screen nie je zaregistrovaný. V Nastavenia Windows → Zjednodušenie ovládania → Klávesnica vypnite jeho priradenie k nástroju na výstrižky a skúste znova.",
    startup: "Na použitie po prihlásení povoľte spustenie pri prihlásení v časti Všeobecné. Snapvere zostane v systémovej lište. Ukončená aplikácia nemôže prijímať skratky.",
  },
  sl: {
    enable: "Uporabi Print Screen", active: "Print Screen odpre izbiro območja v Snapvere.",
    blocked: "Print Screen ni registriran. V Nastavitve Windows → Dostopnost → Tipkovnica izklopite vezavo na Orodje za izrezovanje in poskusite znova.",
    startup: "Za uporabo po prijavi vključite samodejni zagon v Splošno. Snapvere ostane v sistemskem pladnju. Zaprt program ne more prejemati bližnjic.",
  },
};
export function printScreenCopy(language: Language): PrintScreenCopy {
  return copy[language] ?? copy.en;
}
