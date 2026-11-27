// Snapvere by Brendigo
import assert from "node:assert/strict";
import test from "node:test";
import { SHARE_VAULT_KEY, sealShareVault, openShareVault, editShareVault } from "../src/lib/shareVault.ts";
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
