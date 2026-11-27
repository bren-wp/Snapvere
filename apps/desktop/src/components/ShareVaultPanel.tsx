// Snapvere by Brendigo
import { useRef, useState } from "react";
import { SHARE_VAULT_KEY, editShareVault, openShareVault, type SavedShare } from "../lib/shareVault";

const copy: Record<string, readonly [string,string,string,string,string,string,string,string,string,string]> = {
 en:["Saved share links","Vault passphrase (12+ characters)","Unlock history","Save current link","Open link","Remove local entry","Remove this local entry? The public link will not be revoked.","Vault could not be opened or saved. Check the passphrase and available storage.","No saved links","Lock history"],
 hr:["Spremljene poveznice","Lozinka trezora (12+ znakova)","Otključaj povijest","Spremi trenutnu poveznicu","Otvori poveznicu","Ukloni lokalni zapis","Ukloniti lokalni zapis? Javna poveznica neće biti opozvana.","Trezor nije moguće otvoriti ili spremiti. Provjerite lozinku i slobodan prostor.","Nema spremljenih poveznica","Zaključaj povijest"],
 de:["Gespeicherte Freigaben","Tresor-Passphrase (12+ Zeichen)","Verlauf entsperren","Aktuellen Link speichern","Link öffnen","Lokalen Eintrag entfernen","Lokalen Eintrag entfernen? Der öffentliche Link bleibt gültig.","Tresor konnte nicht geöffnet oder gespeichert werden. Passwort und Speicher prüfen.","Keine gespeicherten Links","Verlauf sperren"],
 es:["Enlaces guardados","Contraseña de la bóveda (12+ caracteres)","Desbloquear historial","Guardar enlace actual","Abrir enlace","Eliminar registro local","¿Eliminar el registro local? El enlace público no se revocará.","No se pudo abrir o guardar la bóveda. Comprueba la contraseña y el espacio.","No hay enlaces guardados","Bloquear historial"],
 fr:["Liens enregistrés","Phrase secrète du coffre (12+ caractères)","Déverrouiller l’historique","Enregistrer le lien actuel","Ouvrir le lien","Supprimer l’entrée locale","Supprimer l’entrée locale ? Le lien public ne sera pas révoqué.","Impossible d’ouvrir ou d’enregistrer le coffre. Vérifiez le mot de passe et l’espace.","Aucun lien enregistré","Verrouiller l’historique"],
 it:["Link salvati","Passphrase del vault (12+ caratteri)","Sblocca cronologia","Salva link corrente","Apri link","Rimuovi voce locale","Rimuovere la voce locale? Il link pubblico non verrà revocato.","Impossibile aprire o salvare il vault. Controlla password e spazio.","Nessun link salvato","Blocca cronologia"],
 pt:["Ligações guardadas","Frase-passe do cofre (12+ caracteres)","Desbloquear histórico","Guardar ligação atual","Abrir ligação","Remover registo local","Remover o registo local? A ligação pública não será revogada.","Não foi possível abrir ou guardar o cofre. Verifique a palavra-passe e o espaço.","Sem ligações guardadas","Bloquear histórico"],
 nl:["Opgeslagen links","Kluiswachtwoord (12+ tekens)","Geschiedenis ontgrendelen","Huidige link opslaan","Link openen","Lokale vermelding verwijderen","Lokale vermelding verwijderen? De openbare link wordt niet ingetrokken.","Kluis kan niet worden geopend of opgeslagen. Controleer wachtwoord en opslagruimte.","Geen opgeslagen links","Geschiedenis vergrendelen"],
 pl:["Zapisane linki","Hasło sejfu (12+ znaków)","Odblokuj historię","Zapisz bieżący link","Otwórz link","Usuń wpis lokalny","Usunąć wpis lokalny? Link publiczny nie zostanie unieważniony.","Nie można otworzyć lub zapisać sejfu. Sprawdź hasło i miejsce.","Brak zapisanych linków","Zablokuj historię"],
 cs:["Uložené odkazy","Heslo trezoru (12+ znaků)","Odemknout historii","Uložit aktuální odkaz","Otevřít odkaz","Odstranit místní záznam","Odstranit místní záznam? Veřejný odkaz nebude zneplatněn.","Trezor nelze otevřít nebo uložit. Zkontrolujte heslo a úložiště.","Žádné uložené odkazy","Zamknout historii"],
 sk:["Uložené odkazy","Heslo trezoru (12+ znakov)","Odomknúť históriu","Uložiť aktuálny odkaz","Otvoriť odkaz","Odstrániť miestny záznam","Odstrániť miestny záznam? Verejný odkaz nebude zneplatnený.","Trezor sa nedá otvoriť alebo uložiť. Skontrolujte heslo a úložisko.","Žiadne uložené odkazy","Zamknúť históriu"],
 sl:["Shranjene povezave","Geslo trezorja (12+ znakov)","Odkleni zgodovino","Shrani trenutno povezavo","Odpri povezavo","Odstrani lokalni zapis","Odstranim lokalni zapis? Javna povezava ne bo preklicana.","Trezorja ni mogoče odpreti ali shraniti. Preverite geslo in prostor.","Ni shranjenih povezav","Zakleni zgodovino"],
};

export default function ShareVaultPanel({language,result,disabled,onSelect}:{language:string;result:SavedShare|null;disabled:boolean;onSelect:(record:SavedShare)=>void}) {
 const [title,password,unlock,save,open,remove,confirmText,failed,empty,lock]=copy[language]??copy.en;
 const [passphrase,setPassphrase]=useState("");
 const [records,setRecords]=useState<SavedShare[]|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState(false);
 const [pendingRemove,setPendingRemove]=useState<string|null>(null);
 const running=useRef(false);
 async function perform(kind:"unlock"|"save"|"remove", url?:string){
  if(running.current||disabled||passphrase.length<12)return;
  running.current=true;setBusy(true);setError(false);
  const secret=passphrase;setPassphrase("");
  try{
   if(kind==="unlock"){
    const raw=localStorage.getItem(SHARE_VAULT_KEY);
    setRecords(raw===null?[]:await openShareVault(raw,secret));
   }else if(kind==="save"&&result){
    setRecords(await editShareVault(localStorage,secret,{kind:"save",record:result}));
   }else if(kind==="remove"&&url){
    setRecords(await editShareVault(localStorage,secret,{kind:"remove",url}));
    setPendingRemove(null);
   }
  }catch{setError(true);}
  finally{running.current=false;setBusy(false);}
 }
 return <details className="mt-4 border-t border-border pt-3" onToggle={e=>{if(!e.currentTarget.open&&!running.current){setRecords(null);setPassphrase("");setPendingRemove(null);setError(false);}}}>
  <summary className="cursor-pointer text-sm font-medium">{title}</summary>
  <div className="mt-3 space-y-3">
   <label className="block text-xs text-muted">{password}<input type="password" autoComplete="off" maxLength={256} value={passphrase} disabled={disabled||busy} onChange={e=>setPassphrase(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-black/15 p-2 text-sm text-text"/></label>
   <div className="flex flex-wrap gap-2">
    <button type="button" disabled={disabled||busy||passphrase.length<12} onClick={()=>void perform("unlock")} className="snapvere-btn-secondary rounded-full px-3 py-2 text-xs disabled:opacity-50">{unlock}</button>
    {result&&<button type="button" disabled={disabled||busy||passphrase.length<12} onClick={()=>void perform("save")} className="snapvere-btn-primary rounded-full px-3 py-2 text-xs disabled:opacity-50">{save}</button>}
    {records!==null&&<button type="button" disabled={busy} onClick={()=>{setRecords(null);setPassphrase("");setPendingRemove(null);}} className="snapvere-btn-secondary rounded-full px-3 py-2 text-xs">{lock}</button>}
   </div>
   {error&&<p role="alert" className="text-xs text-danger">{failed}</p>}
   {records!==null&&(records.length===0?<p className="text-xs text-muted">{empty}</p>:<div className="max-h-48 space-y-2 overflow-auto">
    {records.map(record=><div key={record.url} className="rounded-lg border border-border p-2">
     <p className="truncate text-xs text-text">{record.url}</p>
     <p className="text-xs text-muted">{new Date(record.expiresAt).toLocaleString(language)}</p>
     <div className="mt-2 flex flex-wrap gap-2">
      <button type="button" disabled={disabled||busy} onClick={()=>onSelect(record)} className="snapvere-btn-secondary rounded-full px-3 py-1 text-xs disabled:opacity-50">{open}</button>
      <button type="button" disabled={disabled||busy} onClick={()=>setPendingRemove(record.url)} className="snapvere-btn-secondary rounded-full px-3 py-1 text-xs disabled:opacity-50">{remove}</button>
     </div>
     {pendingRemove===record.url&&<div className="mt-2 text-xs text-muted"><p>{confirmText}</p><button type="button" disabled={disabled||busy||passphrase.length<12} onClick={()=>void perform("remove",record.url)} className="snapvere-btn-secondary mt-2 rounded-full px-3 py-1 disabled:opacity-50">{remove}</button></div>}
    </div>)}
   </div>)}
  </div>
 </details>;
}
