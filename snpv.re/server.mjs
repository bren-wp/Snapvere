// Snapvere by Brendigo
import { createServer } from "node:http";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rename, rm, statfs, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here,"../site");
const tokenRE = /^[A-Za-z0-9_-]{43}$/;
const ttlSet = new Set([3600,86400,604800]);
const limit = 16*1024*1024;
const defaultQuota = 2*1024*1024*1024;
const diskHeadroom = 64*1024*1024;
const hash = v => createHash("sha256").update(v).digest("hex");
const mime = {
 "image/png": b => b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
 "image/jpeg": (b,tail,size) => size>=4 && b[0]===255 && b[1]===216 && b[2]===255 && tail[0]===255 && tail[1]===217,
 "image/gif": b => ["GIF87a","GIF89a"].includes(b.toString("ascii",0,6)),
 "image/webp": b => b.toString("ascii",0,4)==="RIFF" && b.toString("ascii",8,12)==="WEBP",
 "video/mp4": b => b.length>=12 && b.toString("ascii",4,8)==="ftyp",
};
const extensions = {"image/png":"png","image/jpeg":"jpg","image/gif":"gif","image/webp":"webp","video/mp4":"mp4"};
const assets = new Map([
 ["/styles.css",[join(site,"styles.css"),"text/css"]],
 ["/fonts/inter-latin.woff2",[join(site,"fonts/inter-latin.woff2"),"font/woff2"]],
 ["/favicon.svg",[join(site,"favicon.svg"),"image/svg+xml"]],
 ["/share.css",[join(here,"share.css"),"text/css"]],
 ["/share.js",[join(here,"share.js"),"text/javascript"]],
 ["/robots.txt",[join(here,"robots.txt"),"text/plain"]],
]);
const security = {"Cache-Control":"no-store","Referrer-Policy":"no-referrer","X-Robots-Tag":"noindex, nofollow, noarchive","X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY","Strict-Transport-Security":"max-age=31536000","Permissions-Policy":"camera=(), microphone=(), geolocation=()","Content-Security-Policy":"default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; media-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"};
const origins = new Set(["http://tauri.localhost","https://tauri.localhost","tauri://localhost"]);
function json(res,status,body){res.writeHead(status,{"Content-Type":"application/json"});res.end(JSON.stringify(body));}
function unavailable(res){json(res,404,{error:"Link unavailable"});}
export function createGrant(key, expiresAt){const payload=String(expiresAt)+"."+randomBytes(24).toString("base64url");return payload+"."+createHmac("sha256",key).update(payload).digest("base64url");}
function grantValid(key,grant,now){
 if(typeof grant!=="string"||!/^\d{13}\.[A-Za-z0-9_-]{32}\.[A-Za-z0-9_-]{43}$/.test(grant))return false;
 const [expiry,nonce,sig]=grant.split(".");
 return Number(expiry)>now && Number(expiry)<=now+86400000 && timingSafeEqual(Buffer.from(sig),Buffer.from(createHmac("sha256",key).update(expiry+"."+nonce).digest("base64url")));
}
// Domain-separated capabilities can be reconstructed only by the server
// while an authenticated original grant is still valid. No plaintext token
// or revocation secret is stored on disk.
function grantCapabilities(key,grant){
 const derive=purpose=>createHmac("sha256",key).update("snapvere-share-v1:"+purpose+":").update(grant).digest("base64url");
 return {token:derive("view"),revocation:derive("revoke")};
}
function range(value,size){
 if(!value)return [0,size-1];
 const m=/^bytes=(\d*)-(\d*)$/.exec(value);
 if(!m||(!m[1]&&!m[2]))return null;
 const start=m[1]?Number(m[1]):Math.max(0,size-Number(m[2]));
 const end=m[1]&&m[2]?Math.min(Number(m[2]),size-1):size-1;
 return Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>=0&&start<=end&&start<size?[start,end]:null;
}
async function storageRoot(storage){
 if(!storage)throw Error("Private storage required");
 const root=resolve(storage),repo=await realpath(resolve(here,".."));
 await mkdir(root,{recursive:true,mode:0o700});
 const actual=await realpath(root),info=await lstat(root);
 if(!info.isDirectory()||info.isSymbolicLink()||actual===repo||actual.startsWith(repo+sep))throw Error("Storage must be a private directory outside the repository");
 if(process.platform!=="win32"&&(info.mode&0o077))throw Error("Private storage permissions required");
 return actual;
}
const shareDirRE=/^[0-9a-f]{64}$/;
async function verifiedMetadata(dir){
 const info=await lstat(dir);
 if(!info.isDirectory()||info.isSymbolicLink())throw Error("Invalid share directory");
 const metaPath=join(dir,"meta.json"),mi=await lstat(metaPath);
 if(!mi.isFile()||mi.isSymbolicLink()||mi.size>4096)throw Error("Invalid share metadata");
 const meta=JSON.parse(await readFile(metaPath,"utf8"));
 if(!Object.hasOwn(mime,meta.type)||!Number.isSafeInteger(meta.size)||meta.size<1||meta.size>limit||!Number.isSafeInteger(meta.expiresAt)||typeof meta.revoke!=="string"||!shareDirRE.test(meta.revoke))throw Error("Invalid share metadata");
 return meta;
}
// Only recognized, expired server-owned copies may be removed. Unknown,
// incomplete or malformed records are preserved for explicit operator review.
export async function purgeExpired(storage,now=Date.now()){
 const root=await storageRoot(storage);let removed=0,preserved=0;
 for(const entry of await readdir(root,{withFileTypes:true})){
  if(!shareDirRE.test(entry.name))continue;
  const dir=join(root,entry.name);
  try{
   if(!entry.isDirectory()||entry.isSymbolicLink())throw Error("Invalid directory");
   const meta=await verifiedMetadata(dir);
   if(meta.expiresAt>now)continue;
   const files=await readdir(dir);
   if(files.length!==2||!files.includes("media")||!files.includes("meta.json"))throw Error("Unexpected content");
   const media=await lstat(join(dir,"media"));
   if(!media.isFile()||media.isSymbolicLink()||media.size!==meta.size)throw Error("Invalid media");
   await rm(dir,{recursive:true,force:false});removed++;
  }catch{preserved++;}
 }
 return {removed,preserved};
}
// Stream into an exclusive staging file with bounded memory and hash
// the exact bytes written. Never publish a partial request.
async function stageUpload(req,path,size,type){
 const fd=await open(path,"wx",0o600);
 const digest=createHash("sha256");
 const prefix=Buffer.alloc(16),tail=Buffer.alloc(2);
 let length=0;
 try{
  for await(const chunk of req){
   if(length+chunk.length>size)throw Error("Oversized upload");
   if(length<16)chunk.copy(prefix,length,0,Math.min(chunk.length,16-length));
   if(chunk.length>=2)chunk.copy(tail,0,chunk.length-2);
   else if(chunk.length===1){tail[0]=tail[1];tail[1]=chunk[0];}
   let offset=0;
   while(offset<chunk.length){
    const {bytesWritten}=await fd.write(chunk,offset,chunk.length-offset,null);
    if(bytesWritten===0)throw Error("Short disk write");
    offset+=bytesWritten;
   }
   digest.update(chunk);length+=chunk.length;
  }
  if(!req.complete||length!==size||!mime[type](prefix.subarray(0,Math.min(length,16)),tail,length))return null;
  await fd.sync();
  return digest.digest("hex");
 }finally{await fd.close();}
}

// Include incomplete and unknown files in quota accounting. Unexpected
// links and special files fail closed rather than being removed.
async function storedBytes(root){
 let bytes=0,entries=0;
 async function visit(dir,depth){
  if(depth>4)throw Error("Storage nesting too deep");
  for(const entry of await readdir(dir,{withFileTypes:true})){
   if(++entries>100000)throw Error("Storage entry limit exceeded");
   const path=join(dir,entry.name),info=await lstat(path);
   if(info.isSymbolicLink())throw Error("Unexpected storage link");
   if(info.isDirectory()){await visit(path,depth+1);continue;}
   if(!info.isFile()||info.nlink!==1)throw Error("Unexpected storage file");
   bytes+=info.size;
   if(!Number.isSafeInteger(bytes))throw Error("Invalid storage size");
  }
 }
 await visit(root,0);return bytes;
}
export async function createShareServer({storage,key,now=Date.now,quotaBytes=defaultQuota}){
 if(!storage||!key||Buffer.byteLength(key)<32)throw Error("Private storage and signing secret required");
 const root=await storageRoot(storage);
 const used=join(root,"used");await mkdir(used,{recursive:true,mode:0o700});
 const usedInfo=await lstat(used);
 if(!usedInfo.isDirectory()||usedInfo.isSymbolicLink()||(process.platform!=="win32"&&(usedInfo.mode&0o077)))throw Error("Invalid private grant storage");
 if(!Number.isSafeInteger(quotaBytes)||quotaBytes<1)throw Error("Invalid storage quota");
 let uploads=0,reads=0,reserved=0;
 // Serialize admission; in-flight bytes may be counted twice, deliberately
 // preferring rejection over exceeding the budget.
 let admission=Promise.resolve();
 async function reserve(size){
  const previous=admission;let unlock;
  admission=new Promise(resolve=>{unlock=resolve;});
  await previous;
  try{
   const bytes=await storedBytes(root);
   const disk=await statfs(root,{bigint:true});
   const needed=size+4096;
   if(bytes+reserved+needed>quotaBytes||disk.bavail*disk.bsize<BigInt(reserved+needed+diskHeadroom))return false;
   reserved+=needed;return true;
  }finally{unlock();}
 }
 const server=createServer({requestTimeout:30000,headersTimeout:10000,maxHeaderSize:8192},async(req,res)=>{
  for(const [k,v] of Object.entries(security))res.setHeader(k,v);
  const origin=req.headers.origin;
  if(origins.has(origin)){res.setHeader("Access-Control-Allow-Origin",origin);res.setHeader("Vary","Origin");}
  try{
   const path=req.url;
   if(!path||!path.startsWith("/")||path.includes("?")||path.includes("#"))return unavailable(res);
   if(req.method==="OPTIONS"&&origins.has(origin)){
    if(path==="/api/v1/shares/recover"&&req.headers["access-control-request-method"]==="POST"){
     res.writeHead(204,{"Access-Control-Allow-Methods":"POST","Access-Control-Allow-Headers":"authorization"});return res.end();
    }
    if(path==="/api/v1/shares"&&req.headers["access-control-request-method"]==="POST"){
     res.writeHead(204,{"Access-Control-Allow-Methods":"POST","Access-Control-Allow-Headers":"authorization, content-type, x-share-ttl"});return res.end();
    }
    if(/^\/api\/v1\/shares\/[A-Za-z0-9_-]{43}$/.test(path)&&req.headers["access-control-request-method"]==="DELETE"){
     res.writeHead(204,{"Access-Control-Allow-Methods":"DELETE","Access-Control-Allow-Headers":"authorization"});return res.end();
    }
    return unavailable(res);
   }
   if(req.method==="GET"&&assets.has(path)){const [file,type]=assets.get(path);const data=await readFile(file);res.writeHead(200,{"Content-Type":type});return res.end(data);}
   if(req.method==="GET"&&(path==="/"||tokenRE.test(path.slice(1)))){const data=await readFile(join(here,"index.html"));res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});return res.end(data);}
   if(req.method==="POST"&&path==="/api/v1/shares/recover"){
    const grant=req.headers.authorization?.startsWith("Bearer ")?req.headers.authorization.slice(7):"";
    if(!grantValid(key,grant,now()))return json(res,401,{error:"Valid upload code required"});
    if(req.headers["transfer-encoding"]||Number(req.headers["content-length"]||0)!==0)return json(res,400,{error:"Unexpected body"});
    const {token,revocation}=grantCapabilities(key,grant);
    const dir=join(root,hash(token));
    const meta=await verifiedMetadata(dir);
    if(meta.expiresAt<=now()||meta.grant!==hash(grant)||!timingSafeEqual(Buffer.from(hash(revocation),"hex"),Buffer.from(meta.revoke,"hex")))return unavailable(res);
    const media=await lstat(join(dir,"media"));
    if(!media.isFile()||media.isSymbolicLink()||media.nlink!==1||media.size!==meta.size)return unavailable(res);
    return json(res,200,{url:"https://snpv.re/"+token,expiresAt:meta.expiresAt,revocation});
   }
   if(req.method==="POST"&&path==="/api/v1/shares"){
    const grant=req.headers.authorization?.startsWith("Bearer ")?req.headers.authorization.slice(7):"";
    if(!grantValid(key,grant,now()))return json(res,401,{error:"Valid upload code required"});
    const type=req.headers["content-type"],size=Number(req.headers["content-length"]),ttl=Number(req.headers["x-share-ttl"]);
    if(!Object.hasOwn(mime,type)||!ttlSet.has(ttl)||!Number.isSafeInteger(size)||size<1||size>limit)return json(res,400,{error:"Invalid type, size or expiry"});
    if(uploads>=2)return json(res,503,{error:"Try again"});
    uploads++;let pending,admitted=false;
    try{
     if(!await reserve(size))return json(res,507,{error:"Share storage unavailable"});
     admitted=true;
     pending=await mkdtemp(join(root,"pending-"));
     const sha256=await stageUpload(req,join(pending,"media"),size,type);
     if(!sha256)return json(res,415,{error:"Invalid media signature"});
     if(res.destroyed)return;
     if(!grantValid(key,grant,now()))return json(res,401,{error:"Upload code expired"});
     try{await mkdir(join(used,hash(grant)),{mode:0o700});}catch(e){if(e.code==="EEXIST")return json(res,409,{error:"Upload code already used"});throw e;}
     const {token,revocation}=grantCapabilities(key,grant),expiresAt=now()+ttl*1000;
     await writeFile(join(pending,"meta.json"),JSON.stringify({type,size,expiresAt,sha256,grant:hash(grant),revoke:hash(revocation)}),{flag:"wx",mode:0o600,flush:true});
     await rename(pending,join(root,hash(token)));pending=null;
     return json(res,201,{url:"https://snpv.re/"+token,expiresAt,revocation});
    }finally{
     try{if(pending)await rm(pending,{recursive:true,force:true});}
     finally{if(admitted)reserved-=size+4096;uploads--;}
    }
   }
   const match=/^\/api\/v1\/shares\/([A-Za-z0-9_-]{43})(\/media)?$/.exec(path);
   if(!match)return unavailable(res);
   const [,token,media]=match,dir=join(root,hash(token));
   const meta=await verifiedMetadata(dir);
   if(req.method==="DELETE"&&!media){
    const secret=req.headers.authorization?.slice(7)||"";
    if(!req.headers.authorization?.startsWith("Bearer ")||!tokenRE.test(secret)||typeof meta.revoke!=="string"||! /^[0-9a-f]{64}$/.test(meta.revoke)||!timingSafeEqual(Buffer.from(hash(secret),"hex"),Buffer.from(meta.revoke,"hex")))return unavailable(res);
    await rm(dir,{recursive:true,force:true});res.writeHead(204);return res.end();
   }
   if(req.method!=="GET"||!Object.hasOwn(mime,meta.type)||!Number.isSafeInteger(meta.size)||meta.size<1||meta.size>limit||!Number.isSafeInteger(meta.expiresAt)||meta.expiresAt<=now())return unavailable(res);
   if(!media)return json(res,200,{type:meta.type,size:meta.size,expiresAt:meta.expiresAt,...(typeof meta.sha256==="string"&&shareDirRE.test(meta.sha256)?{sha256:meta.sha256}:{})});
   if(reads>=16)return json(res,503,{error:"Try again"});
   reads++;let fd;
   try{
    fd=await open(join(dir,"media"),"r");const info=await fd.stat();
    if(!info.isFile()||info.size!==meta.size||meta.expiresAt<=now())return unavailable(res);
    const r=range(req.headers.range,meta.size);
    if(!r){res.writeHead(416,{"Content-Range":"bytes */"+meta.size});return res.end();}
    const [start,end]=r,partial=Boolean(req.headers.range);
    res.writeHead(partial?206:200,{"Content-Type":meta.type,"Content-Length":end-start+1,"Content-Disposition":"inline; filename=Snapvere."+extensions[meta.type],"Accept-Ranges":"bytes",...(partial?{"Content-Range":"bytes "+start+"-"+end+"/"+meta.size}:{})});
    await pipeline(fd.createReadStream({start,end,autoClose:false}),res);
   }finally{reads--;if(fd)await fd.close();}
  }catch(e){if(res.headersSent)res.destroy();else json(res,e.code==="ENOENT"?404:500,{error:"Request unavailable"});}
 });server.maxConnections=128;return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const key=process.env.SNAPVERE_SHARE_KEY;
 if(!key||Buffer.byteLength(key)<32)throw Error("Strong signing secret required");
 if(process.argv[2]==="grant"){process.stdout.write(createGrant(key,Date.now()+3600000)+"\n");}
 else if(process.argv[2]==="purge-expired"){process.stdout.write(JSON.stringify(await purgeExpired(process.env.SNAPVERE_SHARE_STORAGE))+"\n");}
 else if(!process.argv[2]){const server=await createShareServer({storage:process.env.SNAPVERE_SHARE_STORAGE,key,quotaBytes:Number(process.env.SNAPVERE_SHARE_QUOTA_BYTES||defaultQuota)});server.listen(Number(process.env.PORT||8080),"127.0.0.1");}
 else throw Error("Unknown command");
}
