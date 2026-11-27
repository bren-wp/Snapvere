// Snapvere by Brendigo
import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm,mkdir,writeFile,readFile,stat,readdir,symlink,rename} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {createShareServer,createGrant,purgeExpired} from "./server.mjs";
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
  for(let i=0;i<8;i++){
   assert.equal((await upload(grant,Buffer.from("invalid"))).status,415);
   assert.equal((await readdir(storage)).some(name=>name.startsWith("pending-")),false);
  }
  const created=await upload(grant);assert.equal(created.status,201);
  const share=await created.json();assert.match(share.url,/^https:\/\/snpv\.re\/[A-Za-z0-9_-]{43}$/);
  assert.equal((await upload(grant)).status,409);
  const recover=code=>fetch(base+"/api/v1/shares/recover",{method:"POST",headers:{Authorization:"Bearer "+code}});
  assert.equal((await recover("invalid")).status,401);
  assert.equal((await recover(createGrant(key,clock+3600000))).status,404);
  const recovered=await recover(grant);assert.equal(recovered.status,200);
  assert.deepEqual(await recovered.json(),share);
  const endpoint=base+"/api/v1/shares/"+share.url.split("/").pop();
  const meta=await (await fetch(endpoint)).json();assert.equal(meta.revoke,undefined);
  assert.equal(meta.sha256,createHash("sha256").update(png).digest("hex"));
  assert.equal(meta.grant,undefined);
  assert.equal(meta.revocation,undefined);
  const media=await fetch(endpoint+"/media",{headers:{Range:"bytes=0-7"}});assert.equal(media.status,206);assert.deepEqual(Buffer.from(await media.arrayBuffer()),png.subarray(0,8));
  assert.equal(media.headers.get("cache-control"),"no-store");
  // A replaced leaf must never serve an unrelated same-sized file.
  if(process.platform!=="win32"){
   const folder=join(storage,createHash("sha256").update(share.url.split("/").pop()).digest("hex"));
   const original=join(folder,"media"),saved=join(folder,"original"),other=join(storage,"unrelated-media");
   await writeFile(other,Buffer.alloc(png.length,23));
   await rename(original,saved);await symlink(other,original);
   assert.equal((await fetch(endpoint+"/media")).status,404);
   await rm(original);await rename(saved,original);await rm(other);
   const full=await fetch(endpoint+"/media");assert.deepEqual(Buffer.from(await full.arrayBuffer()),png);
  }
  const cors=await fetch(endpoint,{method:"OPTIONS",headers:{Origin:"http://tauri.localhost","Access-Control-Request-Method":"DELETE","Access-Control-Request-Headers":"authorization"}});
  assert.equal(cors.status,204);assert.equal(cors.headers.get("access-control-allow-methods"),"DELETE");
  const denied=await fetch(endpoint,{method:"OPTIONS",headers:{Origin:"https://other.invalid","Access-Control-Request-Method":"DELETE"}});
  assert.equal(denied.status,404);assert.equal(denied.headers.get("access-control-allow-origin"),null);
  assert.equal((await fetch(endpoint,{method:"DELETE",headers:{Authorization:"Bearer invalid"}})).status,404);
  assert.equal((await fetch(endpoint,{method:"DELETE",headers:{Authorization:"Bearer "+share.revocation}})).status,204);
  assert.equal((await fetch(endpoint)).status,404);
  assert.equal((await recover(grant)).status,404);
  const second=await (await upload(createGrant(key,clock+3600000))).json();
  const malformed=join(storage,"f".repeat(64));
  await mkdir(malformed);await writeFile(join(malformed,"media"),"preserve");
  const unrelated=join(storage,"unrelated.txt");await writeFile(unrelated,"keep");
  assert.deepEqual(await purgeExpired(storage,clock),{removed:0,preserved:1});
  clock+=3600001;assert.equal((await fetch(base+"/api/v1/shares/"+second.url.split("/").pop())).status,404);
  assert.equal((await recover(grant)).status,401);
  assert.deepEqual(await purgeExpired(storage,clock),{removed:1,preserved:1});
  assert.equal(await readFile(join(malformed,"media"),"utf8"),"preserve");
  assert.equal(await readFile(unrelated,"utf8"),"keep");
  assert.equal((await stat(malformed)).isDirectory(),true);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await rm(storage,{recursive:true,force:true});}
});

test("storage quota rejects uploads without spending the code or changing existing files",async()=>{
 const storage=await mkdtemp(join(tmpdir(),"snapvere-quota-")),key="test-only-secret-12345678901234567890";const clock=1700000000000;
 const filler=join(storage,"existing");await writeFile(filler,Buffer.alloc(4096,7));
 const server=await createShareServer({storage,key,now:()=>clock,quotaBytes:8192});
 await new Promise(r=>server.listen(0,"127.0.0.1",r));
 const endpoint="http://127.0.0.1:"+server.address().port+"/api/v1/shares";
 const body=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=","base64"),grant=createGrant(key,clock+3600000);
 const upload=()=>fetch(endpoint,{method:"POST",headers:{Authorization:"Bearer "+grant,"Content-Type":"image/png","X-Share-TTL":"3600"},body});
 try{
  assert.equal((await upload()).status,507);
  assert.deepEqual(await readFile(filler),Buffer.alloc(4096,7));
  await rm(filler);
  const accepted=await upload();assert.equal(accepted.status,201);
  assert.match((await accepted.json()).url,/^https:\/\/snpv\.re\//);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await rm(storage,{recursive:true,force:true});}
});
