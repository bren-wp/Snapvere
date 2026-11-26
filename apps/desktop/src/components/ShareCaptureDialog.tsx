// Snapvere by Brendigo
import { useEffect, useRef, useState } from "react";
import { Share2 } from "lucide-react";
import { ipc } from "../lib/ipc";
import { shareCopy, shareMime, uploadCapture } from "../lib/shareCapture";
import type { Screenshot } from "../lib/types";

export default function ShareCaptureDialog({shot,language,onClose}:{shot:Screenshot;language:string;onClose:()=>void}) {
 const t=shareCopy(language);
 const dialog=useRef<HTMLDialogElement>(null);
 const controller=useRef<AbortController|null>(null);
 const [grant,setGrant]=useState("");
 const [ttl,setTtl]=useState(86400);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState(false);
 const [copied,setCopied]=useState(false);
 const [result,setResult]=useState<Awaited<ReturnType<typeof uploadCapture>>|null>(null);
 const supported=Boolean(shareMime(shot.format)) && shot.sizeBytes <= 16*1024*1024;
 useEffect(()=>{dialog.current?.showModal();return()=>controller.current?.abort();},[]);
 async function submit(){
  if(controller.current||!supported)return;
  const abort=new AbortController();controller.current=abort;setBusy(true);setError(false);
  const timeout=setTimeout(()=>abort.abort(),60000);
  try{
   const bytes=await ipc.readShareMedia(shot.id);
   if(abort.signal.aborted)return;
   const shared=await uploadCapture(bytes,shot.format,grant.trim(),ttl,abort.signal);
   setResult(shared);setGrant("");
  }catch{setError(true);}
  finally{clearTimeout(timeout);controller.current=null;setBusy(false);}
 }
 return <dialog ref={dialog} onCancel={e=>{e.preventDefault();if(!busy)onClose();}} className="fixed inset-0 m-auto w-[min(94vw,480px)] max-h-[90vh] overflow-auto rounded-2xl border border-border bg-elevated p-6 text-text shadow-card backdrop:bg-black/65">
  <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold"><Share2 size={19}/>{t.title}</h2>
  <p className="mb-3 truncate text-sm font-medium">{shot.name}</p>
  <p className="mb-4 text-sm text-muted">{t.warning}</p>
  {result ? <div className="space-y-3">
   <label className="block text-sm">{t.link}<input readOnly value={result.url} onFocus={e=>e.currentTarget.select()} className="mt-1 w-full rounded-lg border border-border bg-black/15 p-2"/></label>
   <button type="button" className="snapvere-btn-secondary rounded-full px-4 py-2 text-sm" onClick={()=>{void navigator.clipboard.writeText(result.url).then(()=>setCopied(true)).catch(()=>setError(true));}}>{copied?t.copied:t.copy}</button>
   <label className="block text-sm">{t.revoke}<input readOnly value={result.revocation} onFocus={e=>e.currentTarget.select()} className="mt-1 w-full rounded-lg border border-border bg-black/15 p-2"/></label>
  </div>:<form onSubmit={e=>{e.preventDefault();void submit();}} className="space-y-3">
   <label className="block text-sm">{t.code}<input type="password" autoComplete="off" required maxLength={96} disabled={busy} value={grant} onChange={e=>setGrant(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-black/15 p-2"/></label>
   <label className="block text-sm">{t.expiry}<select disabled={busy} value={ttl} onChange={e=>setTtl(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-border bg-elevated p-2"><option value={3600}>{t.hour}</option><option value={86400}>{t.day}</option><option value={604800}>{t.week}</option></select></label>
   <button type="submit" disabled={!grant.trim()||busy||!supported} className="snapvere-btn-primary rounded-full px-4 py-2 text-sm disabled:opacity-50">{busy?t.busy:t.upload}</button>
  </form>}
  {(error||!supported)&&<p role="alert" className="mt-3 text-sm text-danger">{t.failed}</p>}
  <button type="button" disabled={busy} onClick={onClose} className="snapvere-btn-secondary mt-4 rounded-full px-4 py-2 text-sm disabled:opacity-50">{t.close}</button>
 </dialog>;
}
