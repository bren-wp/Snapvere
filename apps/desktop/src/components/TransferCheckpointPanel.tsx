// Snapvere by Brendigo
import { useRef, useState } from "react";
import { checkpointMatchesCapture, loadTransferCheckpoint, removeTransferCheckpoint, saveTransferCheckpoint, type TransferCheckpoint } from "../lib/shareVault";
import type { Screenshot } from "../lib/types";

const labels:Record<string,readonly [string,string,string,string,string,string,string,string]>={
 en:["Resume after closing","Optional passphrase (12+ characters)","Enter a passphrase before uploading to save an encrypted checkpoint. Restore using the same capture and passphrase. Saved checkpoints must be removed manually after completion.","Save checkpoint","Restore checkpoint","Remove saved checkpoint","Checkpoint updated","No matching checkpoint, incorrect passphrase, or storage unavailable."],
 hr:["Nastavak nakon zatvaranja","Neobavezna lozinka (12+ znakova)","Unesite lozinku prije prijenosa za šifriranu pohranu. Obnovite zapis uz istu snimku i lozinku. Nakon dovršetka zapis uklonite ručno.","Spremi zapis","Obnovi zapis","Ukloni spremljeni zapis","Zapis ažuriran","Nema odgovarajućeg zapisa, lozinka je pogrešna ili pohrana nije dostupna."],
 de:["Nach dem Schließen fortsetzen","Optionale Passphrase (12+ Zeichen)","Vor dem Upload eine Passphrase eingeben, um den Stand verschlüsselt zu speichern. Mit derselben Aufnahme wiederherstellen. Nach Abschluss manuell entfernen.","Stand speichern","Stand wiederherstellen","Stand entfernen","Stand aktualisiert","Kein passender Stand, falsche Passphrase oder Speicher nicht verfügbar."],
 es:["Reanudar tras cerrar","Contraseña opcional (12+ caracteres)","Introduce una contraseña antes de subir para guardar el progreso cifrado. Restaura con la misma captura. Elimina el registro manualmente al terminar.","Guardar progreso","Restaurar progreso","Eliminar registro","Registro actualizado","Sin registro compatible, contraseña incorrecta o almacenamiento no disponible."],
 fr:["Reprendre après fermeture","Phrase secrète facultative (12+ caractères)","Saisissez une phrase secrète avant l’envoi pour conserver un état chiffré. Restaurez avec la même capture. Supprimez manuellement après la fin.","Enregistrer l’état","Restaurer l’état","Supprimer l’état","État mis à jour","État introuvable, phrase secrète incorrecte ou stockage indisponible."],
 it:["Riprendi dopo la chiusura","Passphrase facoltativa (12+ caratteri)","Inserisci una passphrase prima dell’invio per salvare lo stato cifrato. Ripristina con la stessa cattura. Rimuovi manualmente al termine.","Salva stato","Ripristina stato","Rimuovi stato","Stato aggiornato","Stato non trovato, passphrase errata o spazio non disponibile."],
 pt:["Retomar após fechar","Frase-passe opcional (12+ caracteres)","Introduza uma frase-passe antes do envio para guardar o estado cifrado. Restaure com a mesma captura. Remova manualmente após concluir.","Guardar estado","Restaurar estado","Remover estado","Estado atualizado","Estado incompatível, frase-passe incorreta ou armazenamento indisponível."],
 nl:["Hervatten na sluiten","Optioneel wachtwoord (12+ tekens)","Voer vóór upload een wachtwoord in om de status versleuteld op te slaan. Herstel met dezelfde opname. Verwijder na afloop handmatig.","Status opslaan","Status herstellen","Status verwijderen","Status bijgewerkt","Geen passende status, onjuist wachtwoord of opslag niet beschikbaar."],
 pl:["Wznów po zamknięciu","Opcjonalne hasło (12+ znaków)","Podaj hasło przed wysłaniem, aby zapisać zaszyfrowany stan. Przywróć z tym samym zrzutem. Usuń ręcznie po zakończeniu.","Zapisz stan","Przywróć stan","Usuń stan","Stan zaktualizowany","Brak pasującego stanu, błędne hasło lub niedostępna pamięć."],
 cs:["Pokračovat po zavření","Volitelné heslo (12+ znaků)","Před nahráním zadejte heslo pro uložení šifrovaného stavu. Obnovte se stejným snímkem. Po dokončení stav ručně odstraňte.","Uložit stav","Obnovit stav","Odstranit stav","Stav aktualizován","Chybí odpovídající stav, chybné heslo nebo nedostupné úložiště."],
 sk:["Pokračovať po zatvorení","Voliteľné heslo (12+ znakov)","Pred nahrávaním zadajte heslo na uloženie šifrovaného stavu. Obnovte s rovnakou snímkou. Po dokončení stav ručne odstráňte.","Uložiť stav","Obnoviť stav","Odstrániť stav","Stav aktualizovaný","Chýba zodpovedajúci stav, nesprávne heslo alebo nedostupné úložisko."],
 sl:["Nadaljuj po zaprtju","Izbirno geslo (12+ znakov)","Pred nalaganjem vnesite geslo za šifrirano shranjevanje stanja. Obnovite z istim posnetkom. Po koncu stanje ročno odstranite.","Shrani stanje","Obnovi stanje","Odstrani stanje","Stanje posodobljeno","Ni ustreznega stanja, napačno geslo ali nedostopna shramba."],
};
type Props={shot:Screenshot;language:string;checkpoint:TransferCheckpoint|null;password:string;setPassword:(value:string)=>void;disabled:boolean;completed:boolean;onSaved:()=>void;onBusy:(busy:boolean)=>void;onRestore:(checkpoint:TransferCheckpoint)=>void};
export default function TransferCheckpointPanel({shot,language,checkpoint,password,setPassword,disabled,completed,onSaved,onBusy,onRestore}:Props){
 const [title,pass,help,save,restore,remove,success,failure]=labels[language]??labels.en;
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState(false);
 const running=useRef(false);
 async function act(action:"save"|"restore"|"remove"){
  if(running.current||disabled||password.length<12)return;
  running.current=true;setBusy(true);onBusy(true);setMessage("");setError(false);
  const secret=password;setPassword("");
  try{
   if(action==="save"&&checkpoint&&!completed){await saveTransferCheckpoint(localStorage,secret,checkpoint);onSaved();}
   else if(action==="restore"&&!completed){
    const value=await loadTransferCheckpoint(localStorage,secret);
    if(!value||!checkpointMatchesCapture(value,shot))throw new Error("Checkpoint mismatch");
    onRestore(value);
   }else if(action==="remove")await removeTransferCheckpoint(localStorage,secret,shot);
   setMessage(success);
  }catch{setMessage(failure);setError(true);}
  finally{running.current=false;setBusy(false);onBusy(false);}
 }
 return <details className="mt-4 border-t border-border pt-3">
  <summary className="cursor-pointer text-sm font-medium">{title}</summary>
  <p className="my-2 text-xs text-muted">{help}</p>
  <label className="block text-xs text-muted">{pass}<input type="password" autoComplete="off" maxLength={256} disabled={disabled||busy} value={password} onChange={e=>setPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-black/15 p-2 text-sm text-text"/></label>
  <div className="mt-2 flex flex-wrap gap-2">
   {checkpoint&&!completed&&<button type="button" disabled={disabled||busy||password.length<12} onClick={()=>void act("save")} className="snapvere-btn-secondary rounded-full px-3 py-1 text-xs disabled:opacity-50">{save}</button>}
   {!checkpoint&&!completed&&<button type="button" disabled={disabled||busy||password.length<12} onClick={()=>void act("restore")} className="snapvere-btn-secondary rounded-full px-3 py-1 text-xs disabled:opacity-50">{restore}</button>}
   <button type="button" disabled={disabled||busy||password.length<12} onClick={()=>void act("remove")} className="snapvere-btn-secondary rounded-full px-3 py-1 text-xs disabled:opacity-50">{remove}</button>
  </div>
  {message&&<p role={error?"alert":"status"} className={error?"mt-2 text-xs text-danger":"mt-2 text-xs text-muted"}>{message}</p>}
 </details>;
}
