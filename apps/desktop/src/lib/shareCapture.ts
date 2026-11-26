// Snapvere by Brendigo
const SHARE_ENDPOINT = "https://snpv.re/api/v1/shares";
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const grantPattern = /^\d{13}\.[A-Za-z0-9_-]{32}\.[A-Za-z0-9_-]{43}$/;
const mime: Record<string, string> = { png:"image/png", jpg:"image/jpeg", jpeg:"image/jpeg", webp:"image/webp", gif:"image/gif", mp4:"video/mp4" };
export function shareMime(format: string) { return mime[format.toLowerCase()]; }
export async function uploadCapture(bytes: ArrayBuffer, format: string, grant: string, ttl: number, signal: AbortSignal) {
  const type = shareMime(format);
  if (!type || bytes.byteLength < 1 || bytes.byteLength > 16 * 1024 * 1024 || !grantPattern.test(grant) || ![3600,86400,604800].includes(ttl)) throw new Error("Invalid share request");
  const response = await fetch(SHARE_ENDPOINT, {
    method: "POST", credentials: "omit", redirect: "error", cache: "no-store",
    referrerPolicy: "no-referrer", signal,
    headers: { Authorization: "Bearer " + grant, "Content-Type": type, "X-Share-TTL": String(ttl) },
    body: bytes,
  });
  if (!response.ok) throw new Error("Share rejected");
  const data = await response.json() as { url?: unknown; expiresAt?: unknown; revocation?: unknown };
  if (typeof data.url !== "string" || typeof data.expiresAt !== "number" || !Number.isSafeInteger(data.expiresAt) || typeof data.revocation !== "string" || !tokenPattern.test(data.revocation)) throw new Error("Invalid share response");
  const link = new URL(data.url);
  if (link.origin !== "https://snpv.re" || link.username || link.password || link.search || link.hash || !tokenPattern.test(link.pathname.slice(1))) throw new Error("Invalid share URL");
  return { url: link.href, expiresAt: data.expiresAt, revocation: data.revocation };
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
