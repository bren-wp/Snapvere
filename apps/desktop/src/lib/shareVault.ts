// Snapvere by Brendigo
import { shareToken } from "./shareCapture.ts";

/** Explicit, passphrase-protected local history. No network or persisted key. */
export const SHARE_VAULT_KEY = "snapvere-share-vault-v1";
const ITERATIONS = 600_000;
const LIMIT = 64;
const MAX_TEXT = 65_536;
const AAD = new TextEncoder().encode("Snapvere local share vault v1");
const TRANSFER_AAD = new TextEncoder().encode("Snapvere pending transfer v1");
export const TRANSFER_VAULT_KEY = "snapvere-pending-transfer-v1";
export type SavedShare = Readonly<{ url: string; revocation: string; expiresAt: number }>;

function validateRecords(raw: unknown): SavedShare[] {
  if (!Array.isArray(raw) || raw.length > LIMIT) throw new Error("Invalid vault records");
  const seen = new Set<string>();
  return raw.map((entry: unknown) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("Invalid vault entry");
    const r = entry as Record<string, unknown>;
    if (Object.keys(r).length !== 3 || typeof r.url !== "string" ||
        typeof r.revocation !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(r.revocation) ||
        typeof r.expiresAt !== "number" || !Number.isSafeInteger(r.expiresAt) ||
        r.expiresAt < 1 || r.expiresAt > 8_640_000_000_000_000) throw new Error("Invalid vault entry");
    const url = "https://snpv.re/" + shareToken(r.url);
    if (url !== r.url || seen.has(url)) throw new Error("Invalid or duplicate link");
    seen.add(url);
    return { url, revocation:r.revocation, expiresAt:r.expiresAt };
  });
}
function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const byte of bytes) s += String.fromCharCode(byte);
  return btoa(s);
}
function fromBase64(raw: unknown, min: number, max: number): Uint8Array<ArrayBuffer> {
  if (typeof raw !== "string" || raw.length > Math.ceil(max / 3) * 4 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) throw new Error("Invalid vault encoding");
  const s = atob(raw);
  if (s.length < min || s.length > max) throw new Error("Invalid vault size");
  const bytes = new Uint8Array(s.length);
  for (let i=0;i<s.length;i++) bytes[i]=s.charCodeAt(i);
  if (toBase64(bytes)!==raw) throw new Error("Noncanonical vault encoding");
  return bytes;
}
async function derive(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  if (passphrase.length < 12 || passphrase.length > 256) throw new Error("Invalid passphrase length");
  const input = new TextEncoder().encode(passphrase);
  try {
    const material = await crypto.subtle.importKey("raw",input,"PBKDF2",false,["deriveKey"]);
    return await crypto.subtle.deriveKey({name:"PBKDF2",hash:"SHA-256",iterations:ITERATIONS,salt},
      material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
  } finally { input.fill(0); }
}
async function sealValue(value: unknown, passphrase: string, aad: Uint8Array<ArrayBuffer>): Promise<string> {
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await derive(passphrase,salt);
  const plain=new TextEncoder().encode(JSON.stringify(value));
  try {
    const encrypted=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:aad,tagLength:128},key,plain);
    const envelope=JSON.stringify({version:1,salt:toBase64(salt),iv:toBase64(iv),ciphertext:toBase64(new Uint8Array(encrypted))});
    if (envelope.length>MAX_TEXT) throw new Error("Vault full");
    return envelope;
  } finally { plain.fill(0); }
}
async function openValue(raw: string, passphrase: string, aad: Uint8Array<ArrayBuffer>): Promise<unknown> {
  if (raw.length>MAX_TEXT) throw new Error("Oversized vault");
  const obj:unknown=JSON.parse(raw);
  if (!obj||typeof obj!=="object"||Array.isArray(obj)) throw new Error("Invalid vault envelope");
  const e=obj as Record<string,unknown>;
  if (e.version!==1||Object.keys(e).length!==4) throw new Error("Unknown vault format");
  const salt=fromBase64(e.salt,16,16);
  const iv=fromBase64(e.iv,12,12);
  const ciphertext=fromBase64(e.ciphertext,16,MAX_TEXT);
  const key=await derive(passphrase,salt);
  const plain=new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv,additionalData:aad,tagLength:128},key,ciphertext));
  try {
    return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(plain)) as unknown;
  } finally { plain.fill(0); }
}
export async function sealShareVault(records: readonly SavedShare[], passphrase: string): Promise<string> {
  return sealValue(validateRecords(records),passphrase,AAD);
}
export async function openShareVault(raw: string, passphrase: string): Promise<SavedShare[]> {
  return validateRecords(await openValue(raw,passphrase,AAD));
}
export async function editShareVault(storage: Pick<Storage,"getItem"|"setItem">, passphrase: string,
    change: {kind:"save";record:SavedShare}|{kind:"remove";url:string}): Promise<SavedShare[]> {
  const previous=storage.getItem(SHARE_VAULT_KEY);
  const records=previous===null?[]:await openShareVault(previous,passphrase);
  const url=change.kind==="save"?change.record.url:change.url;
  const next=records.filter(r=>r.url!==url);
  if(change.kind==="save") next.unshift(change.record);
  const encrypted=await sealShareVault(next,passphrase);
  // Same-process edits are serialized by the dialog. Detect stale writes
  // after asynchronous cryptography; localStorage is not a cross-process CAS.
  if(storage.getItem(SHARE_VAULT_KEY)!==previous) throw new Error("Vault changed; reopen");
  storage.setItem(SHARE_VAULT_KEY,encrypted);
  return next;
}

/** One encrypted checkpoint per edition. Deliberately refuse to replace a
 * different unfinished session, even for the same capture. */
export type TransferCheckpoint = Readonly<{
  captureId:string; format:string; size:number; sha256:string; grant:string; ttl:number;
}>;
function validateCheckpoint(raw:unknown): TransferCheckpoint {
  if (!raw||typeof raw!=="object"||Array.isArray(raw)) throw new Error("Invalid transfer checkpoint");
  const r=raw as Record<string,unknown>;
  if(Object.keys(r).length!==6||typeof r.captureId!=="string"||r.captureId.length<1||r.captureId.length>128||
     !/^[A-Za-z0-9_-]+$/.test(r.captureId)||typeof r.format!=="string"||
     !["png","jpg","jpeg","webp","gif","mp4"].includes(r.format)||
     typeof r.size!=="number"||!Number.isSafeInteger(r.size)||r.size<1||r.size>16*1024*1024||
     typeof r.sha256!=="string"||!/^[0-9a-f]{64}$/.test(r.sha256)||
     typeof r.grant!=="string"||!/^\d{13}\.[A-Za-z0-9_-]{32}\.[A-Za-z0-9_-]{43}$/.test(r.grant)||
     typeof r.ttl!=="number"||![3600,86400,604800].includes(r.ttl)) throw new Error("Invalid transfer checkpoint");
  return {captureId:r.captureId,format:r.format,size:r.size,sha256:r.sha256,grant:r.grant,ttl:r.ttl};
}
export function checkpointMatchesCapture(checkpoint:TransferCheckpoint,capture:{id:string;format:string;sizeBytes:number}):boolean {
  return checkpoint.captureId===capture.id&&checkpoint.format===capture.format.toLowerCase()&&checkpoint.size===capture.sizeBytes;
}
export async function captureDigest(bytes:ArrayBuffer):Promise<string>{
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),x=>x.toString(16).padStart(2,"0")).join("");
}
type CheckpointStore=Pick<Storage,"getItem"|"setItem"|"removeItem">;
export async function loadTransferCheckpoint(storage:CheckpointStore,passphrase:string):Promise<TransferCheckpoint|null>{
  const raw=storage.getItem(TRANSFER_VAULT_KEY);
  return raw===null?null:validateCheckpoint(await openValue(raw,passphrase,TRANSFER_AAD));
}
export async function saveTransferCheckpoint(storage:CheckpointStore,passphrase:string,checkpoint:TransferCheckpoint):Promise<void>{
  const validated=validateCheckpoint(checkpoint);
  const previous=storage.getItem(TRANSFER_VAULT_KEY);
  if(previous!==null){
    const old=validateCheckpoint(await openValue(previous,passphrase,TRANSFER_AAD));
    if(JSON.stringify(old)!==JSON.stringify(validated))throw new Error("Another transfer checkpoint exists");
  }
  const encrypted=await sealValue(validated,passphrase,TRANSFER_AAD);
  if(storage.getItem(TRANSFER_VAULT_KEY)!==previous)throw new Error("Transfer checkpoint changed");
  storage.setItem(TRANSFER_VAULT_KEY,encrypted);
}
export async function removeTransferCheckpoint(storage:CheckpointStore,passphrase:string,capture:{id:string;format:string;sizeBytes:number}):Promise<void>{
  const previous=storage.getItem(TRANSFER_VAULT_KEY);
  if(previous===null)return;
  const old=validateCheckpoint(await openValue(previous,passphrase,TRANSFER_AAD));
  if(!checkpointMatchesCapture(old,capture))throw new Error("Different capture checkpoint");
  if(storage.getItem(TRANSFER_VAULT_KEY)!==previous)throw new Error("Transfer checkpoint changed");
  storage.removeItem(TRANSFER_VAULT_KEY);
}
