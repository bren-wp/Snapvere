// Snapvere by Brendigo
const SHARE_ENDPOINT = "https://snpv.re/api/v1/shares";
const MAX_SHARE_RESPONSE_BYTES = 4096;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const grantPattern = /^\d{13}\.[A-Za-z0-9_-]{32}\.[A-Za-z0-9_-]{43}$/;
const mime: Record<string, string> = { png:"image/png", jpg:"image/jpeg", jpeg:"image/jpeg", webp:"image/webp", gif:"image/gif", mp4:"video/mp4" };
export function shareMime(format: string) {
  const key = format.toLowerCase();
  return Object.prototype.hasOwnProperty.call(mime, key) ? mime[key] : undefined;
}
export function shareToken(url: string): string {
  const link = new URL(url);
  if (link.origin !== "https://snpv.re" || link.username || link.password || link.search || link.hash || !tokenPattern.test(link.pathname.slice(1))) throw new Error("Invalid share URL");
  return link.pathname.slice(1);
}
export async function revokeCapture(url: string, secret: string, signal: AbortSignal) {
  const token = shareToken(url);
  if (!tokenPattern.test(secret)) throw new Error("Invalid revocation secret");
  const response = await fetch(SHARE_ENDPOINT + "/" + token, {
    method: "DELETE", credentials: "omit", redirect: "error", cache: "no-store",
    referrerPolicy: "no-referrer", signal,
    headers: { Authorization: "Bearer " + secret },
  });
  if (response.status !== 204) throw new Error("Revocation not confirmed");
}
/** Bound an untrusted service response before allocating or decoding JSON. */
async function readShareJson(response: Response): Promise<unknown> {
  const type = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  const length = response.headers.get("content-length");
  if (type !== "application/json" || !response.body ||
      (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_SHARE_RESPONSE_BYTES))) {
    await response.body?.cancel().catch(() => {});
    throw new Error("Invalid sharing response");
  }
  const reader = response.body.getReader();
  const bytes = new Uint8Array(MAX_SHARE_RESPONSE_BYTES);
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value.byteLength > MAX_SHARE_RESPONSE_BYTES - size) {
        void reader.cancel().catch(() => {});
        throw new Error("Sharing response too large");
      }
      bytes.set(value, size);
      size += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  if (length !== null && response.headers.get("content-encoding") === null && Number(length) !== size) {
    throw new Error("Incomplete sharing response");
  }
  const data: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size)));
  if (data === null || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid sharing response");
  return data;
}
export async function requestShareGrant(signal: AbortSignal): Promise<string> {
  const response = await fetch(SHARE_ENDPOINT + "/grant", {
    method: "POST", credentials: "omit", redirect: "error", cache: "no-store",
    referrerPolicy: "no-referrer", signal,
  });
  if (response.status !== 201) throw new Error("Share service unavailable");
  const data = await readShareJson(response) as { grant?: unknown };
  if (typeof data.grant !== "string" || !grantPattern.test(data.grant)) throw new Error("Invalid grant");
  return data.grant;
}
export async function uploadCapture(bytes: ArrayBuffer, format: string, grant: string, ttl: number, signal: AbortSignal) {
  const type = shareMime(format);
  if (!type || bytes.byteLength < 1 || bytes.byteLength > 16 * 1024 * 1024 || !grantPattern.test(grant) || ![3600,86400,604800].includes(ttl)) throw new Error("Invalid share request");
  const response = await fetch(SHARE_ENDPOINT, {
    method: "POST", credentials: "omit", redirect: "error", cache: "no-store",
    referrerPolicy: "no-referrer", signal,
    headers: { Authorization: "Bearer " + grant, "Content-Type": type, "X-Share-TTL": String(ttl) },
    body: bytes,
  });
  if (response.status !== 201) throw new Error("Share rejected");
  return parseShareResponse(response);
}
export async function recoverCapture(grant: string, signal: AbortSignal) {
  if (!grantPattern.test(grant)) throw new Error("Invalid upload code");
  const response = await fetch(SHARE_ENDPOINT + "/recover", {
    method: "POST", credentials: "omit", redirect: "error", cache: "no-store",
    referrerPolicy: "no-referrer", signal,
    headers: { Authorization: "Bearer " + grant },
  });
  if (response.status !== 200) throw new Error("No recoverable share");
  return parseShareResponse(response);
}
/**
 * A lost upload acknowledgement may hide a committed link. Recover with the
 * same one-use grant, never resend media or issue a second grant. Respect
 * cancellation and retain the original failure if recovery is unavailable.
 */
export async function uploadOrRecoverCapture(bytes: ArrayBuffer, format: string, grant: string, ttl: number, signal: AbortSignal) {
  try {
    return await uploadCapture(bytes, format, grant, ttl, signal);
  } catch (originalError) {
    if (signal.aborted || !shareMime(format) || !grantPattern.test(grant) ||
        bytes.byteLength < 1 || bytes.byteLength > 16 * 1024 * 1024 ||
        ![3600,86400,604800].includes(ttl)) throw originalError;
    try {
      return await recoverCapture(grant, signal);
    } catch {
      throw originalError;
    }
  }
}
async function parseShareResponse(response: Response) {
  const data = await readShareJson(response) as { url?: unknown; expiresAt?: unknown; revocation?: unknown };
  if (typeof data.url !== "string" || typeof data.expiresAt !== "number" || !Number.isSafeInteger(data.expiresAt) || typeof data.revocation !== "string" || !tokenPattern.test(data.revocation)) throw new Error("Invalid share response");
  const token = shareToken(data.url);
  return { url: "https://snpv.re/" + token, expiresAt: data.expiresAt, revocation: data.revocation };
}
const labels: Record<string, readonly string[]> = {
 en:["Share capture","One-time upload code","Expires after","Upload and create link","Close","Uploading…","Sharing failed. Check your code, connection and file size (16 MiB maximum).","Anyone with the link can view the original. Check sensitive content before uploading.","Share link","Revocation code — keep private","Copy link","Copied","1 hour","24 hours","7 days"],
 hr:["Podijeli snimku","Jednokratni kod za prijenos","Istječe nakon","Prenesi i izradi poveznicu","Zatvori","Prijenos…","Dijeljenje nije uspjelo. Provjerite kod, vezu i veličinu datoteke (najviše 16 MiB).","Svatko s poveznicom može vidjeti izvornik. Provjerite osjetljivi sadržaj prije prijenosa.","Poveznica za dijeljenje","Kod za opoziv — čuvajte privatno","Kopiraj poveznicu","Kopirano","1 sat","24 sata","7 dana"],
 de:["Aufnahme teilen","Einmaliger Upload-Code","Läuft ab nach","Hochladen und Link erstellen","Schließen","Wird hochgeladen…","Teilen fehlgeschlagen. Code, Verbindung und Dateigröße prüfen (max. 16 MiB).","Jeder mit dem Link kann das Original sehen. Vor dem Upload sensible Inhalte prüfen.","Freigabelink","Widerrufscode — geheim halten","Link kopieren","Kopiert","1 Stunde","24 Stunden","7 Tage"],
 es:["Compartir captura","Código de subida de un solo uso","Caduca después de","Subir y crear enlace","Cerrar","Subiendo…","Error al compartir. Comprueba el código, la conexión y el tamaño (máx. 16 MiB).","Cualquiera con el enlace puede ver el original. Revisa los datos sensibles antes de subirlo.","Enlace para compartir","Código de revocación — mantenlo privado","Copiar enlace","Copiado","1 hora","24 horas","7 días"],
 fr:["Partager la capture","Code d’envoi à usage unique","Expire après","Envoyer et créer le lien","Fermer","Envoi…","Échec du partage. Vérifiez le code, la connexion et la taille (16 Mio max.).","Toute personne ayant le lien peut voir l’original. Vérifiez les données sensibles avant l’envoi.","Lien de partage","Code de révocation — à garder privé","Copier le lien","Copié","1 heure","24 heures","7 jours"],
 it:["Condividi acquisizione","Codice di caricamento monouso","Scade dopo","Carica e crea link","Chiudi","Caricamento…","Condivisione non riuscita. Controlla codice, connessione e dimensione (max 16 MiB).","Chiunque abbia il link può vedere l’originale. Controlla i dati sensibili prima del caricamento.","Link di condivisione","Codice di revoca — mantieni privato","Copia link","Copiato","1 ora","24 ore","7 giorni"],
 pt:["Partilhar captura","Código de envio de uso único","Expira após","Enviar e criar ligação","Fechar","A enviar…","Falha na partilha. Verifique código, ligação e tamanho (máx. 16 MiB).","Quem tiver a ligação pode ver o original. Verifique os dados sensíveis antes do envio.","Ligação de partilha","Código de revogação — mantenha privado","Copiar ligação","Copiado","1 hora","24 horas","7 dias"],
 nl:["Opname delen","Eenmalige uploadcode","Verloopt na","Uploaden en link maken","Sluiten","Uploaden…","Delen mislukt. Controleer code, verbinding en grootte (max. 16 MiB).","Iedereen met de link kan het origineel zien. Controleer gevoelige gegevens vóór upload.","Deellink","Intrekkingscode — privé houden","Link kopiëren","Gekopieerd","1 uur","24 uur","7 dagen"],
 pl:["Udostępnij zrzut","Jednorazowy kod przesyłania","Wygasa po","Prześlij i utwórz link","Zamknij","Przesyłanie…","Udostępnianie nie powiodło się. Sprawdź kod, połączenie i rozmiar (maks. 16 MiB).","Każdy z linkiem może zobaczyć oryginał. Sprawdź dane wrażliwe przed przesłaniem.","Link udostępniania","Kod unieważnienia — zachowaj w tajemnicy","Kopiuj link","Skopiowano","1 godzina","24 godziny","7 dni"],
 cs:["Sdílet snímek","Jednorázový kód pro nahrání","Vyprší za","Nahrát a vytvořit odkaz","Zavřít","Nahrávání…","Sdílení se nezdařilo. Zkontrolujte kód, připojení a velikost (max. 16 MiB).","Kdokoli s odkazem může vidět originál. Před nahráním zkontrolujte citlivá data.","Odkaz ke sdílení","Kód zrušení — uchovejte v soukromí","Kopírovat odkaz","Zkopírováno","1 hodina","24 hodin","7 dní"],
 sk:["Zdieľať snímku","Jednorazový kód nahrávania","Vyprší po","Nahrať a vytvoriť odkaz","Zavrieť","Nahrávanie…","Zdieľanie zlyhalo. Skontrolujte kód, pripojenie a veľkosť (max. 16 MiB).","Každý s odkazom môže vidieť originál. Pred nahraním skontrolujte citlivé údaje.","Odkaz na zdieľanie","Kód zrušenia — uchovajte v súkromí","Kopírovať odkaz","Skopírované","1 hodina","24 hodín","7 dní"],
 sl:["Deli posnetek","Enkratna koda za nalaganje","Poteče po","Naloži in ustvari povezavo","Zapri","Nalaganje…","Deljenje ni uspelo. Preverite kodo, povezavo in velikost (največ 16 MiB).","Vsak s povezavo lahko vidi izvirnik. Pred nalaganjem preverite občutljive podatke.","Povezava za deljenje","Koda preklica — hranite zasebno","Kopiraj povezavo","Kopirano","1 ura","24 ur","7 dni"],
};
export function shareCopy(language: string) {
 const [title,code,expiry,upload,close,busy,failed,warning,link,revoke,copy,copied,hour,day,week] = labels[language] ?? labels.en;
 return {title,code,expiry,upload,close,busy,failed,warning,link,revoke,copy,copied,hour,day,week};
}

const actionLabels: Record<string, readonly [string,string,string,string,string,string]> = {
 en:["Cancel transfer","Revoke link","Revoke this link? Existing downloads cannot be recalled.","Link revoked","Could not confirm revocation. Keep your revocation code.","Transfer stopped. If the server already accepted it, the link may remain active until expiry."],
 hr:["Otkaži prijenos","Opozovi poveznicu","Opozvati ovu poveznicu? Preuzete datoteke nije moguće povući.","Poveznica opozvana","Opoziv nije potvrđen. Sačuvajte kod za opoziv.","Prijenos zaustavljen. Ako ga je poslužitelj već prihvatio, poveznica može ostati aktivna do isteka."],
 de:["Übertragung abbrechen","Link widerrufen","Link widerrufen? Bereits heruntergeladene Dateien bleiben erhalten.","Link widerrufen","Widerruf nicht bestätigt. Widerrufscode aufbewahren.","Übertragung beendet. Bereits akzeptierte Links können bis zum Ablauf aktiv bleiben."],
 es:["Cancelar transferencia","Revocar enlace","¿Revocar enlace? Las descargas existentes no se pueden retirar.","Enlace revocado","Revocación no confirmada. Guarda el código.","Transferencia detenida. Un enlace ya aceptado puede seguir activo hasta caducar."],
 fr:["Annuler le transfert","Révoquer le lien","Révoquer ce lien ? Les téléchargements existants restent accessibles.","Lien révoqué","Révocation non confirmée. Gardez le code.","Transfert arrêté. Un lien déjà accepté peut rester actif jusqu’à expiration."],
 it:["Annulla trasferimento","Revoca link","Revocare il link? I download esistenti non possono essere ritirati.","Link revocato","Revoca non confermata. Conserva il codice.","Trasferimento interrotto. Un link già accettato può restare attivo fino alla scadenza."],
 pt:["Cancelar transferência","Revogar ligação","Revogar esta ligação? Não é possível recuperar ficheiros já descarregados.","Ligação revogada","Revogação não confirmada. Guarde o código.","Transferência interrompida. Uma ligação já aceite pode permanecer ativa até expirar."],
 nl:["Overdracht annuleren","Link intrekken","Link intrekken? Bestaande downloads kunnen niet worden teruggehaald.","Link ingetrokken","Intrekking niet bevestigd. Bewaar de code.","Overdracht gestopt. Een geaccepteerde link kan actief blijven tot de vervaldatum."],
 pl:["Anuluj przesyłanie","Unieważnij link","Unieważnić link? Pobranych plików nie można wycofać.","Link unieważniony","Nie potwierdzono unieważnienia. Zachowaj kod.","Przesyłanie zatrzymane. Zaakceptowany link może działać do wygaśnięcia."],
 cs:["Zrušit přenos","Zneplatnit odkaz","Zneplatnit odkaz? Stažené soubory nelze vzít zpět.","Odkaz zneplatněn","Zneplatnění nepotvrzeno. Uchovejte kód.","Přenos zastaven. Přijatý odkaz může zůstat aktivní do vypršení."],
 sk:["Zrušiť prenos","Zneplatniť odkaz","Zneplatniť odkaz? Stiahnuté súbory nemožno vziať späť.","Odkaz zneplatnený","Zneplatnenie nepotvrdené. Uchovajte kód.","Prenos zastavený. Prijatý odkaz môže zostať aktívny do vypršania."],
 sl:["Prekliči prenos","Prekliči povezavo","Preklic povezave? Prenesenih datotek ni mogoče priklicati nazaj.","Povezava preklicana","Preklic ni potrjen. Shranite kodo.","Prenos ustavljen. Sprejeta povezava lahko ostane aktivna do poteka."],
};
export function shareActionCopy(language: string) {
  const [cancel,revoke,confirm,revoked,revokeFailed,cancelled] = actionLabels[language] ?? actionLabels.en;
  return {cancel,revoke,confirm,revoked,revokeFailed,cancelled};
}

const recoveryLabels: Record<string, readonly [string,string,string]> = {
 en:["Recover existing link","Recover the link previously created with this upload code. No file is sent.","No link recovered. Check the code and its expiry."],
 hr:["Dohvati postojeću poveznicu","Dohvati poveznicu prethodno stvorenu ovim kodom. Datoteka se ne šalje.","Poveznica nije dohvaćena. Provjerite kod i njegov rok valjanosti."],
 de:["Vorhandenen Link wiederherstellen","Den mit diesem Upload-Code erstellten Link abrufen. Es wird keine Datei gesendet.","Kein Link gefunden. Code und Ablauf prüfen."],
 es:["Recuperar enlace existente","Recupera el enlace creado con este código. No se envía ningún archivo.","No se recuperó ningún enlace. Comprueba el código y su caducidad."],
 fr:["Récupérer le lien existant","Récupérez le lien créé avec ce code. Aucun fichier n’est envoyé.","Aucun lien récupéré. Vérifiez le code et son expiration."],
 it:["Recupera link esistente","Recupera il link creato con questo codice. Nessun file viene inviato.","Nessun link recuperato. Controlla il codice e la scadenza."],
 pt:["Recuperar ligação existente","Recupere a ligação criada com este código. Nenhum ficheiro é enviado.","Nenhuma ligação recuperada. Verifique o código e a validade."],
 nl:["Bestaande link herstellen","Haal de link op die met deze code is gemaakt. Er wordt geen bestand verzonden.","Geen link opgehaald. Controleer de code en vervaldatum."],
 pl:["Odzyskaj istniejący link","Odzyskaj link utworzony za pomocą tego kodu. Plik nie jest wysyłany.","Nie odzyskano linku. Sprawdź kod i jego ważność."],
 cs:["Obnovit existující odkaz","Obnovte odkaz vytvořený tímto kódem. Soubor se neodesílá.","Odkaz nebyl obnoven. Zkontrolujte kód a platnost."],
 sk:["Obnoviť existujúci odkaz","Obnovte odkaz vytvorený týmto kódom. Súbor sa neodosiela.","Odkaz nebol obnovený. Skontrolujte kód a platnosť."],
 sl:["Obnovi obstoječo povezavo","Pridobite povezavo, ustvarjeno s to kodo. Datoteka se ne pošlje.","Povezava ni bila obnovljena. Preverite kodo in veljavnost."],
};
export function shareRecoveryCopy(language:string){
 const [recover,explanation,failed]=recoveryLabels[language]??recoveryLabels.en;
 return {recover,explanation,failed};
}
