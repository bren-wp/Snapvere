// Snapvere by Brendigo
import { useEffect, useRef, useState } from "react";
import { Share2 } from "lucide-react";
import { ipc } from "../lib/ipc";
import { requestShareGrant, recoverCapture, revokeCapture, shareActionCopy, shareCopy, shareMime, shareRecoveryCopy, shareResumeCopy, uploadResumableCapture, abortResumableCapture } from "../lib/shareCapture";
import type { Screenshot } from "../lib/types";
import ShareVaultPanel from "./ShareVaultPanel";
import TransferCheckpointPanel from "./TransferCheckpointPanel";
import { captureDigest, checkpointMatchesCapture, saveTransferCheckpoint, type TransferCheckpoint } from "../lib/shareVault";

export default function ShareCaptureDialog({shot,language,onClose}:{shot:Screenshot;language:string;onClose:()=>void}) {
 const t=shareCopy(language);
 const actions=shareActionCopy(language);
 const recovery=shareRecoveryCopy(language);
 const resumable=shareResumeCopy(language);
 const [progress,setProgress]=useState<{offset:number;total:number}|null>(null);
 const [pendingGrant,setPendingGrant]=useState("");
 const [pendingTtl,setPendingTtl]=useState(86400);
 const [checkpoint,setCheckpoint]=useState<TransferCheckpoint|null>(null);
 const [checkpointPassword,setCheckpointPassword]=useState("");
 const [checkpointBusy,setCheckpointBusy]=useState(false);
 const dialog=useRef<HTMLDialogElement>(null);
 const controller=useRef<AbortController|null>(null);
 const [grant,setGrant]=useState("");
 const [ttl,setTtl]=useState(86400);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState(false);
 const [copied,setCopied]=useState(false);
 const [notice,setNotice]=useState("");
 const [confirmRevoke,setConfirmRevoke]=useState(false);
 const [revoked,setRevoked]=useState(false);
 const [recovered,setRecovered]=useState(false);
 const [result,setResult]=useState<Awaited<ReturnType<typeof uploadResumableCapture>>|null>(null);
 const supported=Boolean(shareMime(shot.format)) && shot.sizeBytes <= 16*1024*1024;
 useEffect(()=>{dialog.current?.showModal();return()=>controller.current?.abort();},[]);
 async function submit(resume=false){
  if(controller.current||checkpointBusy||!supported||(resume&&!pendingGrant)||(!resume&&pendingGrant))return;
  const abort=new AbortController();controller.current=abort;setBusy(true);setError(false);setNotice("");
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try{
   const bytes=await ipc.readShareMedia(shot.id);
   if(abort.signal.aborted)throw new Error("Cancelled");
   const password=checkpointPassword;setCheckpointPassword("");
   const sha256=await captureDigest(bytes);
   if(resume&&(!checkpoint||!checkpointMatchesCapture(checkpoint,shot)||checkpoint.sha256!==sha256||checkpoint.size!==bytes.byteLength))throw new Error("Capture changed");
   if(bytes.byteLength!==shot.sizeBytes)throw new Error("Capture changed");
   abort.signal.throwIfAborted();
   timeout=setTimeout(()=>abort.abort(),180000);
   const code=resume?pendingGrant:await requestShareGrant(abort.signal);
   const chosenTtl=resume?pendingTtl:ttl;
   const pending:TransferCheckpoint={captureId:shot.id,format:shot.format.toLowerCase(),size:bytes.byteLength,sha256,grant:code,ttl:chosenTtl};
   setCheckpoint(pending);setPendingGrant(code);setPendingTtl(chosenTtl);setGrant(code);
   // When opted in, persist the checkpoint BEFORE transmitting any media.
   // A storage error must not silently downgrade to an unprotected upload.
   if(password)await saveTransferCheckpoint(localStorage,password,pending);
   abort.signal.throwIfAborted();
   const shared=await uploadResumableCapture(bytes,shot.format,code,chosenTtl,abort.signal,(offset,total)=>setProgress({offset,total}));
   setResult(shared);setGrant("");setPendingGrant("");setProgress(null);setCheckpoint(null);
  }catch(error){
   if(abort.signal.aborted)setNotice(resumable.paused);
   else if(String(error)!=="Share cancelled")setError(true);
  }
  finally{clearTimeout(timeout);controller.current=null;setBusy(false);}
 }
 async function discard(){
  if(controller.current||checkpointBusy||!pendingGrant)return;
  const abort=new AbortController();controller.current=abort;setBusy(true);setError(false);setNotice("");
  const timeout=setTimeout(()=>abort.abort(),15000);
  try{
   await abortResumableCapture(pendingGrant,abort.signal);
   setPendingGrant("");setGrant("");setProgress(null);setCheckpoint(null);setNotice(resumable.discarded);
  }catch{setError(true);}
  finally{clearTimeout(timeout);controller.current=null;setBusy(false);}
 }
 async function recover(){
  if(controller.current||checkpointBusy||!grant.trim())return;
  const abort=new AbortController();controller.current=abort;setBusy(true);setError(false);setNotice("");
  const timeout=setTimeout(()=>abort.abort(),15000);
  try{
   const shared=await recoverCapture(grant.trim(),abort.signal);
   setResult(shared);if(grant.trim()===pendingGrant){setPendingGrant("");setProgress(null);setCheckpoint(null);}setGrant("");setRecovered(true);
  }catch{setNotice(recovery.failed);}
  finally{clearTimeout(timeout);controller.current=null;setBusy(false);}
 }
 async function revoke(){
  if(!result||controller.current)return;
  const abort=new AbortController();controller.current=abort;setBusy(true);setNotice("");setError(false);
  const timeout=setTimeout(()=>abort.abort(),15000);
  try{
   await revokeCapture(result.url,result.revocation,abort.signal);
   setResult(null);setRevoked(true);setNotice(actions.revoked);
  }catch{setNotice(actions.revokeFailed);}
  finally{clearTimeout(timeout);controller.current=null;setBusy(false);setConfirmRevoke(false);}
 }
 return <dialog ref={dialog} onCancel={e=>{e.preventDefault();if(!busy&&!checkpointBusy)onClose();}} className="fixed inset-0 m-auto w-[min(94vw,480px)] max-h-[90vh] overflow-auto rounded-2xl border border-border bg-elevated p-6 text-text shadow-card backdrop:bg-black/65">
  <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold"><Share2 size={19}/>{t.title}</h2>
  {!recovered&&<p className="mb-3 truncate text-sm font-medium">{shot.name}</p>}
  {recovered&&<p className="mb-3 text-sm text-muted">{recovery.explanation}</p>}
  <p className="mb-4 text-sm text-muted">{t.warning}</p>
  {result ? <div className="space-y-3">
   <label className="block text-sm">{t.link}<input readOnly value={result.url} onFocus={e=>e.currentTarget.select()} className="mt-1 w-full rounded-lg border border-border bg-black/15 p-2"/></label>
   <button type="button" className="snapvere-btn-secondary rounded-full px-4 py-2 text-sm" onClick={()=>{void navigator.clipboard.writeText(result.url).then(()=>setCopied(true)).catch(()=>setError(true));}}>{copied?t.copied:t.copy}</button>
   <label className="block text-sm">{t.revoke}<input readOnly value={result.revocation} onFocus={e=>e.currentTarget.select()} className="mt-1 w-full rounded-lg border border-border bg-black/15 p-2"/></label>
   <button type="button" disabled={busy} className="snapvere-btn-secondary rounded-full px-4 py-2 text-sm disabled:opacity-50" onClick={()=>setConfirmRevoke(true)}>{actions.revoke}</button>
   {confirmRevoke&&<div className="rounded-lg border border-border p-3 text-sm"><p>{actions.confirm}</p><div className="mt-2 flex gap-2"><button type="button" disabled={busy} className="snapvere-btn-secondary rounded-full px-3 py-2" onClick={()=>void revoke()}>{actions.revoke}</button><button type="button" disabled={busy} className="snapvere-btn-secondary rounded-full px-3 py-2" onClick={()=>setConfirmRevoke(false)}>{t.close}</button></div></div>}
  </div>:revoked?null:<form onSubmit={e=>{e.preventDefault();void submit();}} className="space-y-3">
   <label className="block text-sm">{t.expiry}<select disabled={busy||Boolean(pendingGrant)} value={ttl} onChange={e=>setTtl(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-border bg-elevated p-2"><option value={3600}>{t.hour}</option><option value={86400}>{t.day}</option><option value={604800}>{t.week}</option></select></label>
   <button type="submit" disabled={busy||checkpointBusy||!supported||Boolean(pendingGrant)||(checkpointPassword.length>0&&checkpointPassword.length<12)} className="snapvere-btn-primary rounded-full px-4 py-2 text-sm disabled:opacity-50">{busy?t.busy:t.upload}</button>
   {pendingGrant&&<div className="flex flex-wrap gap-2">
    <button type="button" disabled={busy||checkpointBusy||!supported||(checkpointPassword.length>0&&checkpointPassword.length<12)} onClick={()=>void submit(true)} className="snapvere-btn-primary rounded-full px-3 py-2 text-sm disabled:opacity-50">{resumable.resume}</button>
    <button type="button" disabled={busy||checkpointBusy} onClick={()=>void discard()} className="snapvere-btn-secondary rounded-full px-3 py-2 text-sm disabled:opacity-50">{resumable.discard}</button>
   </div>}
   {progress&&<div className="space-y-1"><progress aria-label={t.busy} className="w-full" value={progress.offset} max={progress.total}/><p className="text-xs text-muted tabular-nums">{Math.floor(progress.offset/progress.total*100)}% · {progress.offset.toLocaleString(language)} / {progress.total.toLocaleString(language)} B</p></div>}
   <details className="border-t border-border pt-3" open={Boolean(grant)||undefined}>
    <summary className="cursor-pointer text-sm text-muted">{recovery.recover}</summary>
    <p className="my-2 text-xs text-muted">{recovery.explanation}</p>
    <label className="block text-sm">{t.code}<input type="password" autoComplete="off" maxLength={96} disabled={busy||Boolean(pendingGrant)} value={grant} onChange={e=>setGrant(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-black/15 p-2"/></label>
    <button type="button" disabled={!grant.trim()||busy||checkpointBusy} onClick={()=>void recover()} className="snapvere-btn-secondary mt-2 rounded-full px-4 py-2 text-sm disabled:opacity-50">{recovery.recover}</button>
   </details>
  </form>}
  <TransferCheckpointPanel shot={shot} language={language} checkpoint={checkpoint} password={checkpointPassword} setPassword={setCheckpointPassword}
   disabled={busy||Boolean(result)} onBusy={setCheckpointBusy}
   onRestore={saved=>{setCheckpoint(saved);setPendingGrant(saved.grant);setGrant(saved.grant);setPendingTtl(saved.ttl);setTtl(saved.ttl);setProgress(null);setError(false);setNotice("");}}/>
  <ShareVaultPanel language={language} result={result} disabled={busy||checkpointBusy||Boolean(pendingGrant)} onSelect={record=>{setResult(record);setRecovered(true);setRevoked(false);setConfirmRevoke(false);setCopied(false);setError(false);setNotice("");}}/>
  {notice&&<p role="status" className="mt-3 text-sm text-muted">{notice}</p>}
  {busy&&!result&&<button type="button" onClick={()=>controller.current?.abort()} className="snapvere-btn-secondary mt-3 rounded-full px-4 py-2 text-sm">{actions.cancel}</button>}
  {(error||(!supported&&!result&&!revoked))&&<p role="alert" className="mt-3 text-sm text-danger">{t.failed}</p>}
  <button type="button" disabled={busy||checkpointBusy} onClick={onClose} className="snapvere-btn-secondary mt-4 rounded-full px-4 py-2 text-sm disabled:opacity-50">{t.close}</button>
 </dialog>;
}
