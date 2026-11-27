// Snapvere by Brendigo
import assert from "node:assert/strict";
import test from "node:test";
import { SHARE_VAULT_KEY, sealShareVault, openShareVault, editShareVault, TRANSFER_VAULT_KEY, saveTransferCheckpoint, loadTransferCheckpoint, removeTransferCheckpoint, checkpointMatchesCapture, captureDigest } from "../src/lib/shareVault.ts";
const password="fixture passphrase only";
const record={url:"https://snpv.re/"+"a".repeat(43),revocation:"b".repeat(43),expiresAt:1700003600000};
test("local share vault encrypts links and revocation secrets and rejects tampering",async()=>{
 const raw=await sealShareVault([record],password);
 assert.ok(!raw.includes(record.url)&&!raw.includes(record.revocation)&&!raw.includes(password));
 assert.deepEqual(await openShareVault(raw,password),[record]);
 assert.notEqual(await sealShareVault([record],password),raw);
 await assert.rejects(openShareVault(raw,"another long password"));
 const changed=JSON.parse(raw);
 const bytes=Uint8Array.from(atob(changed.ciphertext),ch=>ch.charCodeAt(0));
 bytes[0]^=1;changed.ciphertext=btoa(String.fromCharCode(...bytes));
 await assert.rejects(openShareVault(JSON.stringify(changed),password));
 await assert.rejects(sealShareVault([{...record,url:"https://other.invalid/"+ "a".repeat(43)}],password));
 await assert.rejects(sealShareVault([record,record],password));
 await assert.rejects(openShareVault("x".repeat(65537),password));
});
test("vault edit preserves previous ciphertext on bad password and removes only selected record",async()=>{
 const values=new Map();
 const store={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 const second={...record,url:"https://snpv.re/"+"c".repeat(43)};
 await editShareVault(store,password,{kind:"save",record});
 const old=values.get(SHARE_VAULT_KEY);
 await assert.rejects(editShareVault(store,"incorrect long password",{kind:"save",record:second}));
 assert.equal(values.get(SHARE_VAULT_KEY),old);
 await editShareVault(store,password,{kind:"save",record:second});
 assert.deepEqual(await openShareVault(values.get(SHARE_VAULT_KEY),password),[second,record]);
 await editShareVault(store,password,{kind:"remove",url:second.url});
 assert.deepEqual(await openShareVault(values.get(SHARE_VAULT_KEY),password),[record]);
});

test("encrypted checkpoint binds capture and digest and refuses overwriting a different session",async()=>{
 const values=new Map();
 const store={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const sha256=await captureDigest(new Uint8Array([1,2,3]).buffer);
 const pending={captureId:"capture-1",format:"png",size:3,sha256,grant:"1700003600000."+"a".repeat(32)+"."+"b".repeat(43),ttl:3600};
 const capture={id:"capture-1",format:"PNG",sizeBytes:3};
 assert.equal(await loadTransferCheckpoint(store,password),null);
 await saveTransferCheckpoint(store,password,pending);
 const raw=values.get(TRANSFER_VAULT_KEY);
 assert.ok(!raw.includes(pending.grant)&&!raw.includes(pending.captureId)&&!raw.includes(sha256));
 assert.deepEqual(await loadTransferCheckpoint(store,password),pending);
 assert.ok(checkpointMatchesCapture(pending,capture));
 assert.ok(!checkpointMatchesCapture(pending,{...capture,sizeBytes:4}));
 await assert.rejects(loadTransferCheckpoint(store,"wrong long password"));
 await assert.rejects(saveTransferCheckpoint(store,password,{...pending,ttl:86400}));
 assert.equal(values.get(TRANSFER_VAULT_KEY),raw);
 await assert.rejects(removeTransferCheckpoint(store,password,{...capture,id:"other"}));
 await assert.rejects(openShareVault(raw,password));
 assert.equal(values.get(TRANSFER_VAULT_KEY),raw);
 await removeTransferCheckpoint(store,password,capture);
 assert.equal(await loadTransferCheckpoint(store,password),null);
});
