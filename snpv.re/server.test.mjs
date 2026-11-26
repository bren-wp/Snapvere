// Snapvere by Brendigo
import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createShareServer,createGrant} from "./server.mjs";
test("one-use upload, private retrieval, range, revocation and expiry",async()=>{
 const storage=await mkdtemp(join(tmpdir(),"snapvere-share-")),key="test-only-secret-12345678901234567890";let clock=1700000000000;
 const server=await createShareServer({storage,key,now:()=>clock});
 await new Promise(r=>server.listen(0,"127.0.0.1",r));
 const base="http://127.0.0.1:"+server.address().port;
 const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=","base64");
 const upload=(grant,body=png)=>fetch(base+"/api/v1/shares",{method:"POST",headers:{Authorization:"Bearer "+grant,"Content-Type":"image/png","X-Share-TTL":"3600"},body});
 try{
  assert.equal((await upload("invalid")).status,401);
  const grant=createGrant(key,clock+3600000);
  assert.equal((await upload(grant,Buffer.from("invalid"))).status,415);
  const created=await upload(grant);assert.equal(created.status,201);
  const share=await created.json();assert.match(share.url,/^https:\/\/snpv\.re\/[A-Za-z0-9_-]{43}$/);
  assert.equal((await upload(grant)).status,409);
  const endpoint=base+"/api/v1/shares/"+share.url.split("/").pop();
  const meta=await (await fetch(endpoint)).json();assert.equal(meta.revoke,undefined);
  const media=await fetch(endpoint+"/media",{headers:{Range:"bytes=0-7"}});assert.equal(media.status,206);assert.deepEqual(Buffer.from(await media.arrayBuffer()),png.subarray(0,8));
  assert.equal(media.headers.get("cache-control"),"no-store");
  const cors=await fetch(endpoint,{method:"OPTIONS",headers:{Origin:"http://tauri.localhost","Access-Control-Request-Method":"DELETE","Access-Control-Request-Headers":"authorization"}});
  assert.equal(cors.status,204);assert.equal(cors.headers.get("access-control-allow-methods"),"DELETE");
  const denied=await fetch(endpoint,{method:"OPTIONS",headers:{Origin:"https://other.invalid","Access-Control-Request-Method":"DELETE"}});
  assert.equal(denied.status,404);assert.equal(denied.headers.get("access-control-allow-origin"),null);
  assert.equal((await fetch(endpoint,{method:"DELETE",headers:{Authorization:"Bearer invalid"}})).status,404);
  assert.equal((await fetch(endpoint,{method:"DELETE",headers:{Authorization:"Bearer "+share.revocation}})).status,204);
  assert.equal((await fetch(endpoint)).status,404);
  const second=await (await upload(createGrant(key,clock+3600000))).json();
  clock+=3600001;assert.equal((await fetch(base+"/api/v1/shares/"+second.url.split("/").pop())).status,404);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await rm(storage,{recursive:true,force:true});}
});
