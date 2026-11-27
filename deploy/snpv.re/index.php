<?php
// Snapvere by Brendigo
declare(strict_types=1);
ini_set('display_errors','0');
umask(0077);
require __DIR__.'/service.php';
share_headers();
$path=parse_url($_SERVER['REQUEST_URI']??'/',PHP_URL_PATH);
$method=$_SERVER['REQUEST_METHOD']??'GET';
if ($method==='GET' && ($path==='/' || preg_match('~\A/[A-Za-z0-9_-]{43}\z~',(string)$path))) {
    header('Content-Type: text/html; charset=utf-8');
    readfile(__DIR__.'/viewer.html'); exit;
}
if (!is_string($path) || !preg_match('~\A/api/v1/shares(?:/(grant|recover|[A-Za-z0-9_-]{43})(/media)?)?\z~',$path,$match)) fail_share(404);
if (parse_url($_SERVER['REQUEST_URI'],PHP_URL_QUERY)!==null) fail_share(404);
$id=$match[1]??''; $media=isset($match[2]);
if ($method==='OPTIONS') {
    $expected=$id===''||$id==='recover'||$id==='grant'?'POST':(!$media?'DELETE':'GET');
    if (!share_origin() || ($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_METHOD']??'')!==$expected) fail_share(404);
    header('Access-Control-Allow-Methods: '.$expected);
    header('Access-Control-Allow-Headers: authorization, content-type, x-share-ttl');
    http_response_code(204); exit;
}
try {
    if ($method==='POST' && $id==='grant' && !$media) {
        if (!share_origin() || (int)($_SERVER['CONTENT_LENGTH']??0)!==0 || isset($_SERVER['HTTP_TRANSFER_ENCODING'])) fail_share(400);
        [$root,$key]=initialize_storage();
        share_json(201,['grant'=>issue_grant($root,$key)]);
    }
    $root=share_storage(); $key=share_key($root);
    $bearer=share_bearer();
    if ($method==='POST' && ($id===''||$id==='recover')) {
        if (!grant_ok($key,$bearer)) fail_share(401);
        [$token,$revocation]=capabilities($key,$bearer); $dir=$root.'/'.hash('sha256',$token);
        if ($id==='recover') {
            if ((int)($_SERVER['CONTENT_LENGTH']??0)!==0 || isset($_SERVER['HTTP_TRANSFER_ENCODING'])) fail_share(400);
            $m=metadata($dir);
            if (!$m || $m['expiresAt']<=milliseconds() || !hash_equals($m['grant'],hash('sha256',$bearer)) || !hash_equals($m['revoke'],hash('sha256',$revocation))) fail_share(404);
            share_json(200,['url'=>'https://snpv.re/'.$token,'expiresAt'=>$m['expiresAt'],'revocation'=>$revocation]);
        }
        $type=$_SERVER['CONTENT_TYPE']??'';
        $length=$_SERVER['CONTENT_LENGTH']??'';
        $ttl=$_SERVER['HTTP_X_SHARE_TTL']??'';
        if (!isset(share_types()[$type]) || !preg_match('/\A[0-9]{1,8}\z/',(string)$length) || (int)$length<1 || (int)$length>MAX_SHARE || !in_array($ttl,['3600','86400','604800'],true)) fail_share(400);
        $size=(int)$length;
        $lock=fopen($root.'/lock','c');
        if (!$lock || !flock($lock,LOCK_EX|LOCK_NB)) fail_share(503);
        $pending=null;
        try {
            $used=$root.'/used-'.hash('sha256',$bearer);
            if (file_exists($used)||file_exists($dir)) fail_share(409);
            maintain_expired($root,milliseconds());
            if (storage_bytes($root)+$size+4096>QUOTA || disk_free_space($root)<$size+67108864) fail_share(507);
            $pending=$root.'/pending-'.bin2hex(random_bytes(16));
            if (!mkdir($pending,0700)) throw new RuntimeException();
            $digest=stage_media($pending.'/media',$size,$type);
            if ($digest===null) { remove_pending($pending); $pending=null; fail_share(415); }
            if (!grant_ok($key,$bearer)) { remove_pending($pending); $pending=null; fail_share(401); }
            $expiry=milliseconds()+(int)$ttl*1000;
            $m=['type'=>$type,'size'=>$size,'expiresAt'=>$expiry,'sha256'=>$digest,'grant'=>hash('sha256',$bearer),'revoke'=>hash('sha256',$revocation)];
            write_new($pending.'/meta.json',json_encode($m,JSON_THROW_ON_ERROR));
            write_new($used,(string)milliseconds());
            if (!rename($pending,$dir)) throw new RuntimeException();
            $pending=null;
            share_json(201,['url'=>'https://snpv.re/'.$token,'expiresAt'=>$expiry,'revocation'=>$revocation]);
        } finally { if ($pending!==null) remove_pending($pending); flock($lock,LOCK_UN); fclose($lock); }
    }
    if ($id===''||$id==='recover'||$id==='grant') fail_share(404);
    $dir=$root.'/'.hash('sha256',$id); $m=metadata($dir);
    if (!$m) fail_share(404);
    if ($method==='DELETE' && !$media) {
        if (!preg_match('/\A[A-Za-z0-9_-]{43}\z/',$bearer)||!hash_equals($m['revoke'],hash('sha256',$bearer))) fail_share(404);
        $lock=fopen($root.'/lock','c');
        if (!$lock||!flock($lock,LOCK_EX|LOCK_NB)) fail_share(503);
        $m=metadata($dir);
        if (!$m||!hash_equals($m['revoke'],hash('sha256',$bearer))) fail_share(404);
        // Rename before cleanup: immediately withdraw the public reference.
        $retired=$root.'/retired-'.bin2hex(random_bytes(16));
        if (!rename($dir,$retired)) throw new RuntimeException();
        remove_pending($retired);
        flock($lock,LOCK_UN); fclose($lock);
        http_response_code(204); exit;
    }
    if ($method!=='GET'||$m['expiresAt']<=milliseconds()) fail_share(404);
    if (!$media) share_json(200,array_intersect_key($m,array_flip(['type','size','expiresAt','sha256'])));
    serve_media($dir,$m);
} catch (Throwable $e) { if (!headers_sent()) fail_share(503); }
