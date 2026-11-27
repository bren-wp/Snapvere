// Snapvere by Brendigo
import assert from "node:assert/strict";
import test from "node:test";
import { shareToken, shareMime, revokeCapture, recoverCapture, requestShareGrant } from "../src/lib/shareCapture.ts";
const token="a".repeat(43), link="https://snpv.re/"+token;
test("share URLs cannot select an external host, credentials, query or path",()=>{
 assert.equal(shareToken(link),token);
 for(const invalid of ["https://other.invalid/"+token,"https://snpv.re.other.invalid/"+token,"https://user@snpv.re/"+token,link+"?x=1",link+"#x",link+"/media","http://snpv.re/"+token,"https://snpv.re/short"]){assert.throws(()=>shareToken(invalid));}
 assert.equal(shareMime("MP4"),"video/mp4");
 assert.equal(shareMime("constructor"),undefined);
 assert.equal(shareMime("__proto__"),undefined);
});
test("revocation is explicit, fixed-origin and requires server acknowledgement",async(t)=>{
 const signal=new AbortController().signal;
 const mock=t.mock.method(globalThis,"fetch",async(url,options)=>{
  assert.equal(url,"https://snpv.re/api/v1/shares/"+token);
  assert.equal(options.method,"DELETE");
  assert.equal(options.credentials,"omit");
  assert.equal(options.redirect,"error");
  assert.equal(options.headers.Authorization,"Bearer "+token);
  assert.equal(options.signal,signal);
  return new Response(null,{status:204});
 });
 await assert.rejects(revokeCapture("https://other.invalid/"+token,token,signal));
 await assert.rejects(revokeCapture(link,"invalid",signal));
 assert.equal(mock.mock.callCount(),0);
 await revokeCapture(link,token,signal);
 assert.equal(mock.mock.callCount(),1);
 mock.mock.mockImplementation(async()=>new Response(null,{status:404}));
 await assert.rejects(revokeCapture(link,token,signal),/not confirmed/);
});

test("recovery sends only the grant, not local media, and rejects untrusted links",async(t)=>{
 const grant="1700003600000."+"a".repeat(32)+"."+"b".repeat(43),signal=new AbortController().signal;
 const mock=t.mock.method(globalThis,"fetch",async(url,options)=>{
  assert.equal(url,"https://snpv.re/api/v1/shares/recover");
  assert.equal(options.method,"POST");
  assert.equal(options.body,undefined);
  assert.equal(options.credentials,"omit");
  assert.equal(options.redirect,"error");
  assert.equal(options.headers.Authorization,"Bearer "+grant);
  return Response.json({url:link,expiresAt:1700003600000,revocation:token});
 });
 await assert.rejects(recoverCapture("bad",signal));
 assert.equal(mock.mock.callCount(),0);
 assert.equal((await recoverCapture(grant,signal)).url,link);
 mock.mock.mockImplementation(async()=>Response.json({url:"https://other.invalid/"+token,expiresAt:1700003600000,revocation:token}));
 await assert.rejects(recoverCapture(grant,signal));
});

test("automatic grant sends no capture or credentials",async(t)=>{
 const grant="1700003600000."+"a".repeat(32)+"."+"b".repeat(43);
 const signal=new AbortController().signal;
 const mock=t.mock.method(globalThis,"fetch",async(url,options)=>{
  assert.equal(url,"https://snpv.re/api/v1/shares/grant");
  assert.equal(options.method,"POST");assert.equal(options.body,undefined);
  assert.equal(options.credentials,"omit");assert.equal(options.redirect,"error");
  assert.equal(options.signal,signal);
  return Response.json({grant},{status:201});
 });
 assert.equal(await requestShareGrant(signal),grant);
 mock.mock.mockImplementation(async()=>Response.json({grant:"bad"},{status:201}));
 await assert.rejects(requestShareGrant(signal));
});
