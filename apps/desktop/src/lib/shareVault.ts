// Snapvere by Brendigo
import { shareToken } from "./shareCapture.ts";

/** Explicit, passphrase-protected local history. No network or persisted key. */
export const SHARE_VAULT_KEY = "snapvere-share-vault-v1";
const ITERATIONS = 600_000;
const LIMIT = 64;
const MAX_TEXT = 65_536;
const AAD = new TextEncoder().encode("Snapvere local share vault v1");
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
export async function sealShareVault(records: readonly SavedShare[], passphrase: string): Promise<string> {
  const validated=validateRecords(records);
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await derive(passphrase,salt);
  const plain=new TextEncoder().encode(JSON.stringify(validated));
  try {
    const encrypted=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:AAD,tagLength:128},key,plain);
    const envelope=JSON.stringify({version:1,salt:toBase64(salt),iv:toBase64(iv),ciphertext:toBase64(new Uint8Array(encrypted))});
    if (envelope.length>MAX_TEXT) throw new Error("Vault full");
    return envelope;
  } finally { plain.fill(0); }
}
export async function openShareVault(raw: string, passphrase: string): Promise<SavedShare[]> {
  if (raw.length>MAX_TEXT) throw new Error("Oversized vault");
  const obj:unknown=JSON.parse(raw);
  if (!obj||typeof obj!=="object"||Array.isArray(obj)) throw new Error("Invalid vault envelope");
  const e=obj as Record<string,unknown>;
  if (e.version!==1||Object.keys(e).length!==4) throw new Error("Unknown vault format");
  const salt=fromBase64(e.salt,16,16);
  const iv=fromBase64(e.iv,12,12);
  const ciphertext=fromBase64(e.ciphertext,16,MAX_TEXT);
  const key=await derive(passphrase,salt);
  const plain=new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv,additionalData:AAD,tagLength:128},key,ciphertext));
  try {
    return validateRecords(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(plain)));
  } finally { plain.fill(0); }
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
