// Snapvere by Brendigo
import { createServer } from "node:http";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, mkdtemp, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here,"../site");
const tokenRE = /^[A-Za-z0-9_-]{43}$/;
const ttlSet = new Set([3600,86400,604800]);
const limit = 16*1024*1024;
const hash = v => createHash("sha256").update(v).digest("hex");
const mime = {
 "image/png": b => b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
 "image/jpeg": b => b.length>=4 && b[0]===255 && b[1]===216 && b[2]===255 && b.at(-2)===255 && b.at(-1)===217,
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
function range(value,size){
 if(!value)return [0,size-1];
 const m=/^bytes=(\d*)-(\d*)$/.exec(value);
 if(!m||(!m[1]&&!m[2]))return null;
 const start=m[1]?Number(m[1]):Math.max(0,size-Number(m[2]));
 const end=m[1]&&m[2]?Math.min(Number(m[2]),size-1):size-1;
 return Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>=0&&start<=end&&start<size?[start,end]:null;
}
export async function createShareServer({storage,key,now=Date.now}){
 if(!storage||!key||Buffer.byteLength(key)<32)throw Error("Private storage and signing secret required");
 const root=resolve(storage),repo=resolve(here,"..");
 if(root===repo||root.startsWith(repo+sep))throw Error("Storage must be outside repository");
 await mkdir(root,{recursive:true,mode:0o700});
 if(process.platform!=="win32"&&((await stat(root)).mode&0o077))throw Error("Private storage permissions required");
 const used=join(root,"used");await mkdir(used,{recursive:true,mode:0o700});
 let uploads=0,reads=0;
 const server=createServer({requestTimeout:30000,headersTimeout:10000,maxHeaderSize:8192},async(req,res)=>{
  for(const [k,v] of Object.entries(security))res.setHeader(k,v);
  const origin=req.headers.origin;
  if(origins.has(origin)){res.setHeader("Access-Control-Allow-Origin",origin);res.setHeader("Vary","Origin");}
  try{
   const path=req.url;
   if(!path||!path.startsWith("/")||path.includes("?")||path.includes("#"))return unavailable(res);
   if(req.method==="OPTIONS"&&origins.has(origin)){
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
   if(req.method==="POST"&&path==="/api/v1/shares"){
    const grant=req.headers.authorization?.startsWith("Bearer ")?req.headers.authorization.slice(7):"";
    if(!grantValid(key,grant,now()))return json(res,401,{error:"Valid upload code required"});
    const type=req.headers["content-type"],size=Number(req.headers["content-length"]),ttl=Number(req.headers["x-share-ttl"]);
    if(!Object.hasOwn(mime,type)||!ttlSet.has(ttl)||!Number.isSafeInteger(size)||size<1||size>limit)return json(res,400,{error:"Invalid type, size or expiry"});
    if(uploads>=2)return json(res,503,{error:"Try again"});
    uploads++;let pending;
    try{
     const chunks=[];let length=0;
     for await(const chunk of req){length+=chunk.length;if(length>size||length>limit)throw Error("Oversized upload");chunks.push(chunk);}
     const data=Buffer.concat(chunks,length);
     if(length!==size||!mime[type](data))return json(res,415,{error:"Invalid media signature"});
     if(!grantValid(key,grant,now()))return json(res,401,{error:"Upload code expired"});
     try{await mkdir(join(used,hash(grant)),{mode:0o700});}catch(e){if(e.code==="EEXIST")return json(res,409,{error:"Upload code already used"});throw e;}
     const token=randomBytes(32).toString("base64url"),revocation=randomBytes(32).toString("base64url"),expiresAt=now()+ttl*1000;
     pending=await mkdtemp(join(root,"pending-"));
     await writeFile(join(pending,"media"),data,{flag:"wx",mode:0o600,flush:true});
     await writeFile(join(pending,"meta.json"),JSON.stringify({type,size,expiresAt,revoke:hash(revocation)}),{flag:"wx",mode:0o600,flush:true});
     await rename(pending,join(root,hash(token)));pending=null;
     return json(res,201,{url:"https://snpv.re/"+token,expiresAt,revocation});
    }finally{uploads--;if(pending)await rm(pending,{recursive:true,force:true});}
   }
   const match=/^\/api\/v1\/shares\/([A-Za-z0-9_-]{43})(\/media)?$/.exec(path);
   if(!match)return unavailable(res);
   const [,token,media]=match,dir=join(root,hash(token));
   const meta=JSON.parse(await readFile(join(dir,"meta.json"),"utf8"));
   if(req.method==="DELETE"&&!media){
    const secret=req.headers.authorization?.slice(7)||"";
    if(!req.headers.authorization?.startsWith("Bearer ")||!tokenRE.test(secret)||typeof meta.revoke!=="string"||! /^[0-9a-f]{64}$/.test(meta.revoke)||!timingSafeEqual(Buffer.from(hash(secret),"hex"),Buffer.from(meta.revoke,"hex")))return unavailable(res);
    await rm(dir,{recursive:true,force:true});res.writeHead(204);return res.end();
   }
   if(req.method!=="GET"||!Object.hasOwn(mime,meta.type)||!Number.isSafeInteger(meta.size)||meta.size<1||meta.size>limit||!Number.isSafeInteger(meta.expiresAt)||meta.expiresAt<=now())return unavailable(res);
   if(!media)return json(res,200,{type:meta.type,size:meta.size,expiresAt:meta.expiresAt});
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
 else{const server=await createShareServer({storage:process.env.SNAPVERE_SHARE_STORAGE,key});server.listen(Number(process.env.PORT||8080),"127.0.0.1");}
}
