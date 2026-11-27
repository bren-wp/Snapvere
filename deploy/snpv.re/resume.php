<?php
// Snapvere by Brendigo
declare(strict_types=1);
// Loaded exclusively by the front controller. All writes are serialized by
// the private-store lock. One authenticated grant identifies one upload.
const RESUME_BLOCK=262144;

function resume_spec(): array {
    $type=$_SERVER['HTTP_X_SHARE_TYPE']??'';
    $size=$_SERVER['HTTP_X_SHARE_SIZE']??'';
    $ttl=$_SERVER['HTTP_X_SHARE_TTL']??'';
    $digest=$_SERVER['HTTP_X_SHARE_SHA256']??'';
    if (!isset(share_types()[$type]) || !preg_match('/\A[0-9]{1,8}\z/',$size) ||
        (int)$size<1 || (int)$size>MAX_SHARE ||
        !in_array($ttl,['3600','86400','604800'],true) ||
        !preg_match('/\A[0-9a-f]{64}\z/',$digest)) fail_share(400);
    return ['type'=>$type,'size'=>(int)$size,'ttl'=>(int)$ttl,'sha256'=>$digest];
}
function resume_read_file(string $path,int $limit): ?string {
    clearstatcache(true,$path);
    $i=@lstat($path);
    if (!$i || ($i['mode']&0170000)!==0100000 || $i['nlink']!==1 || $i['size']>$limit) return null;
    $fp=@fopen($path,'rb'); if (!$fp) return null;
    try {
        $j=fstat($fp);
        if (!$j || $i['dev']!==$j['dev'] || $i['ino']!==$j['ino'] || $i['size']!==$j['size']) return null;
        $data=stream_get_contents($fp,$limit+1);
        return is_string($data)&&strlen($data)===$i['size']?$data:null;
    } finally { fclose($fp); }
}
function resume_manifest(string $dir): ?array {
    if (is_link($dir)||!is_dir($dir)) return null;
    $raw=resume_read_file($dir.'/upload.json',2048);
    if ($raw===null) return null;
    $m=json_decode($raw,true,8);
    if (!is_array($m)||count($m)!==6||!is_string($m['type']??null)||!isset(share_types()[$m['type']])
        ||!is_int($m['size']??null)||$m['size']<1||$m['size']>MAX_SHARE
        ||!in_array($m['ttl']??null,[3600,86400,604800],true)
        ||!is_string($m['sha256']??null)||!preg_match('/\A[0-9a-f]{64}\z/',$m['sha256'])
        ||!is_string($m['grant']??null)||!preg_match('/\A[0-9a-f]{64}\z/',$m['grant'])
        ||!is_int($m['deadline']??null)||$m['deadline']<1) return null;
    return $m;
}
function resume_chunk_name(int $index): string {return sprintf('chunk-%04d',$index);}
function resume_offset(string $dir,array $m): ?int {
    $names=scandir($dir); if ($names===false) return null;
    $offset=0; $index=0; $gap=false;
    foreach ($names as $name) {
        if (in_array($name,['.','..','upload.json'],true)) continue;
        if ($name!==resume_chunk_name($index)||$gap||$offset>=$m['size']) return null;
        $expected=min(RESUME_BLOCK,$m['size']-$offset);
        $data=resume_read_file($dir.'/'.$name,$expected);
        if ($data===null||strlen($data)!==$expected) return null;
        $offset+=$expected; $index++;
    }
    return $offset;
}
function resume_remove(string $dir,array $m): bool {
    if (resume_offset($dir,$m)===null) return false;
    foreach (scandir($dir)?:[] as $name) {
        if (preg_match('/\Achunk-[0-9]{4}\z/',$name) && !unlink($dir.'/'.$name)) return false;
    }
    return unlink($dir.'/upload.json') && rmdir($dir);
}
function resume_cleanup(string $root,int $now): void {
    $removed=0;
    foreach (new FilesystemIterator($root,FilesystemIterator::SKIP_DOTS) as $entry) {
        if ($removed>=8) break;
        $name=$entry->getFilename();
        if ($entry->isLink()||!$entry->isDir()||!preg_match('/\Aresume-([0-9a-f]{64})\z/',$name,$match)) continue;
        $m=resume_manifest($entry->getPathname());
        if ($m&&$m['grant']===$match[1]&&$m['deadline']<=$now&&resume_remove($entry->getPathname(),$m)) $removed++;
    }
}
function resume_empty_body(): bool {
    return (int)($_SERVER['CONTENT_LENGTH']??0)===0&&!isset($_SERVER['HTTP_TRANSFER_ENCODING']);
}
function resume_dispatch(string $action,string $method): never {
    if ($method==='OPTIONS') {
        if (!share_origin()||($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_METHOD']??'')!=='POST') fail_share(404);
        header('Access-Control-Allow-Methods: POST');
        header('Access-Control-Allow-Headers: authorization, content-type, x-share-type, x-share-size, x-share-sha256, x-share-ttl, x-share-offset');
        http_response_code(204);exit;
    }
    if ($method!=='POST') fail_share(405);
    $root=share_storage();$key=share_key($root);$grant=share_bearer();
    if (!grant_ok($key,$grant)) fail_share(401);
    if ($action!=='chunk'&&!resume_empty_body()) fail_share(400);
    $hash=hash('sha256',$grant);
    $dir=$root.'/resume-'.$hash;$used=$root.'/used-'.$hash;
    [$token,$revocation]=capabilities($key,$grant);
    $published=$root.'/'.hash('sha256',$token);
    $lock=fopen($root.'/lock','c');
    if (!$lock||!flock($lock,LOCK_EX|LOCK_NB)) fail_share(503);
    try {
        if (!grant_ok($key,$grant)) fail_share(401);
        if (file_exists($used)||is_link($used)||file_exists($published)||is_link($published)) fail_share(409);
        if ($action==='begin') {
            $spec=resume_spec();
            $existing=resume_manifest($dir);
            if ($existing!==null) {
                foreach ($spec as $k=>$v) if ($existing[$k]!==$v) fail_share(409);
            } else {
                if (file_exists($dir)||is_link($dir)) fail_share(409);
                maintain_expired($root,milliseconds());
                resume_cleanup($root,milliseconds());
                if (storage_bytes($root)+$spec['size']+4096>QUOTA || disk_free_space($root)<$spec['size']+67108864) fail_share(507);
                if (!mkdir($dir,0700)) throw new RuntimeException();
                write_new($dir.'/upload.json',json_encode($spec+['grant'=>$hash,'deadline'=>(int)substr($grant,0,13)],JSON_THROW_ON_ERROR));
            }
        }
        $m=resume_manifest($dir);
        if (!$m||$m['grant']!==$hash||$m['deadline']!==(int)substr($grant,0,13)) fail_share(404);
        $offset=resume_offset($dir,$m);
        if ($offset===null) fail_share(409);
        if ($action==='begin'||$action==='status') share_json(200,['offset'=>$offset,'size'=>$m['size'],'blockSize'=>RESUME_BLOCK]);
        if ($action==='abort') {
            write_new($used,(string)milliseconds());
            if (!resume_remove($dir,$m)) fail_share(503);
            http_response_code(204);exit;
        }
        if ($action==='chunk') {
            $rawOffset=$_SERVER['HTTP_X_SHARE_OFFSET']??'';
            $rawLength=$_SERVER['CONTENT_LENGTH']??'';
            if (isset($_SERVER['HTTP_TRANSFER_ENCODING'])||($_SERVER['CONTENT_TYPE']??'')!=='application/octet-stream'||
                !preg_match('/\A[0-9]{1,8}\z/',$rawOffset)||!preg_match('/\A[0-9]{1,6}\z/',$rawLength)) fail_share(400);
            $start=(int)$rawOffset;$length=(int)$rawLength;
            if ($start%RESUME_BLOCK!==0||$start>$offset||$start>=$m['size']||$length!==min(RESUME_BLOCK,$m['size']-$start)) fail_share(409);
            $bytes=file_get_contents('php://input',false,null,0,$length+1);
            if (!is_string($bytes)||strlen($bytes)!==$length) fail_share(400);
            $name=$dir.'/'.resume_chunk_name(intdiv($start,RESUME_BLOCK));
            if ($start<$offset) {
                $saved=resume_read_file($name,$length);
                if ($saved===null||!hash_equals($saved,$bytes)) fail_share(409);
                share_json(200,['offset'=>$offset,'size'=>$m['size'],'blockSize'=>RESUME_BLOCK]);
            }
            if (storage_bytes($root)+$length>QUOTA||disk_free_space($root)<$length+67108864) fail_share(507);
            // Write privately and fsync before publishing the complete chunk.
            // Crash remnants are preserved and cause fail-closed recovery.
            $tmp=$dir.'/temporary-'.bin2hex(random_bytes(12));
            write_new($tmp,$bytes);
            if (file_exists($name)||is_link($name)||!rename($tmp,$name)) fail_share(409);
            share_json(200,['offset'=>$offset+$length,'size'=>$m['size'],'blockSize'=>RESUME_BLOCK]);
        }
        if ($action!=='finish'||$offset!==$m['size']) fail_share(409);
        if (storage_bytes($root)+$m['size']+4096>QUOTA||disk_free_space($root)<$m['size']+67108864) fail_share(507);
        $pending=$root.'/pending-'.bin2hex(random_bytes(16));
        if (!mkdir($pending,0700)) throw new RuntimeException();
        try {
            $fp=fopen($pending.'/media','xb');if (!$fp) throw new RuntimeException();
            $digest=hash_init('sha256');$head='';$tail='';
            try {
                for ($i=0,$n=0;$n<$m['size'];$i++) {
                    $count=min(RESUME_BLOCK,$m['size']-$n);
                    $bytes=resume_read_file($dir.'/'.resume_chunk_name($i),$count);
                    if ($bytes===null||strlen($bytes)!==$count||fwrite($fp,$bytes)!==$count) throw new RuntimeException();
                    $head=substr($head.$bytes,0,16);$tail=substr($tail.$bytes,-2);hash_update($digest,$bytes);$n+=$count;
                }
                if (!fflush($fp)||!fsync($fp)) throw new RuntimeException();
            } finally {fclose($fp);}
            $actual=hash_final($digest);
            if (!hash_equals($m['sha256'],$actual)||!valid_media_signature($m['type'],$head,$tail,$m['size'])) {
                remove_pending($pending);fail_share(415);
            }
            if (!grant_ok($key,$grant)) {remove_pending($pending);fail_share(401);}
            $expiry=milliseconds()+$m['ttl']*1000;
            $meta=['type'=>$m['type'],'size'=>$m['size'],'expiresAt'=>$expiry,'sha256'=>$actual,'grant'=>$hash,'revoke'=>hash('sha256',$revocation)];
            write_new($pending.'/meta.json',json_encode($meta,JSON_THROW_ON_ERROR));
            write_new($used,(string)milliseconds());
            if (!rename($pending,$published)) throw new RuntimeException();
            $pending=null;
            // Publication is already committed; recover endpoint remains
            // authoritative if cleanup or the response is interrupted.
            resume_remove($dir,$m);
            share_json(201,['url'=>'https://snpv.re/'.$token,'expiresAt'=>$expiry,'revocation'=>$revocation]);
        } finally {if ($pending!==null) remove_pending($pending);}
    } finally {flock($lock,LOCK_UN);fclose($lock);}
}
