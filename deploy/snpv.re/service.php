<?php
// Snapvere by Brendigo
declare(strict_types=1);
const MAX_SHARE=16777216;
const QUOTA=2147483648;
function milliseconds(): int { return (int)floor(microtime(true)*1000); }
function b64u(string $v): string { return rtrim(strtr(base64_encode($v),'+/','-_'),'='); }
function share_types(): array { return ['image/png'=>'png','image/jpeg'=>'jpg','image/gif'=>'gif','image/webp'=>'webp','video/mp4'=>'mp4']; }
function share_origin(): bool { return in_array($_SERVER['HTTP_ORIGIN']??'', ['http://tauri.localhost','https://tauri.localhost','tauri://localhost'],true); }
function share_headers(): void {
    header('Cache-Control: no-store'); header('Referrer-Policy: no-referrer'); header('X-Robots-Tag: noindex, nofollow, noarchive');
    header('X-Content-Type-Options: nosniff'); header('X-Frame-Options: DENY'); header('Strict-Transport-Security: max-age=31536000');
    header("Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; media-src 'self'; connect-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    if (share_origin()) { header('Access-Control-Allow-Origin: '.$_SERVER['HTTP_ORIGIN']); header('Vary: Origin'); }
}
function share_json(int $status,array $body): never { http_response_code($status); header('Content-Type: application/json'); echo json_encode($body,JSON_THROW_ON_ERROR); exit; }
function fail_share(int $status): never { share_json($status,['error'=>'Request unavailable']); }
function storage_path(): string { return getenv('SNAPVERE_SHARE_STORAGE') ?: dirname(__DIR__).'/.snapvere-share-data-'.substr(hash('sha256',__DIR__),0,16); }
function share_storage(): string {
    $path=storage_path(); $root=realpath($path); $web=realpath(__DIR__);
    if (!$root||!$web||is_link($path)||!is_dir($root)||$root===$web||str_starts_with($root,$web.DIRECTORY_SEPARATOR)||str_starts_with($web,$root.DIRECTORY_SEPARATOR)||(fileperms($root)&0077)!==0) throw new RuntimeException('Private storage unavailable');
    return $root;
}
function share_key(string $root): string {
    $p=$root.'/key'; if (is_link($p)||!is_file($p)||(fileperms($p)&0077)!==0) throw new RuntimeException();
    $key=file_get_contents($p,false,null,0,65); if (!is_string($key)||!preg_match('/\A[0-9a-f]{64}\z/',$key)) throw new RuntimeException(); return $key;
}
function share_bearer(): string { $a=$_SERVER['HTTP_AUTHORIZATION']??$_SERVER['REDIRECT_HTTP_AUTHORIZATION']??''; return str_starts_with($a,'Bearer ')?substr($a,7):''; }
function grant_ok(string $key,string $grant): bool {
    if (!preg_match('/\A([0-9]{13})\.([A-Za-z0-9_-]{32})\.([A-Za-z0-9_-]{43})\z/',$grant,$m)) return false;
    $now=milliseconds(); return (int)$m[1]>$now&&(int)$m[1]<=$now+86400000&&hash_equals(b64u(hash_hmac('sha256',$m[1].'.'.$m[2],$key,true)),$m[3]);
}
function capabilities(string $key,string $grant): array {
    return array_map(fn($purpose)=>b64u(hash_hmac('sha256','snapvere-share-v1:'.$purpose.':'.$grant,$key,true)),['view','revoke']);
}
function write_new(string $path,string $value): void {
    $fp=fopen($path,'xb'); if (!$fp) throw new RuntimeException();
    try { if (!chmod($path,0600)||fwrite($fp,$value)!==strlen($value)||!fflush($fp)||!fsync($fp)) throw new RuntimeException(); } finally { fclose($fp); }
}
function metadata(string $dir): ?array {
    if (is_link($dir)||!is_dir($dir)) return null;
    $p=$dir.'/meta.json'; $media=$dir.'/media';
    if (is_link($p)||is_link($media)||!is_file($p)||!is_file($media)||filesize($p)>4096) return null;
    $m=json_decode((string)file_get_contents($p,false,null,0,4097),true,8);
    if (!is_array($m)||!is_string($m['type']??null)||!isset(share_types()[$m['type']])||!is_int($m['size']??null)||$m['size']<1||$m['size']>MAX_SHARE||filesize($media)!==$m['size']||!is_int($m['expiresAt']??null)) return null;
    foreach (['sha256','grant','revoke'] as $k) if (!is_string($m[$k]??null)||!preg_match('/\A[0-9a-f]{64}\z/',$m[$k])) return null;
    return $m;
}
function storage_bytes(string $root): int {
    $bytes=0; $count=0;
    $it=new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::SELF_FIRST);
    foreach ($it as $entry) { if (++$count>100000||$it->getDepth()>3||$entry->isLink()) throw new RuntimeException(); if ($entry->isFile()) $bytes+=$entry->getSize(); elseif (!$entry->isDir()) throw new RuntimeException(); }
    return $bytes;
}
function remove_pending(string $dir): void {
    if (is_link($dir)||!is_dir($dir)) return;
    foreach (scandir($dir)?:[] as $name) if (!in_array($name,['.','..','media','meta.json'],true)) return;
    foreach (['media','meta.json'] as $name) { $p=$dir.'/'.$name; if (is_link($p)) return; if (is_file($p)) unlink($p); }
    rmdir($dir);
}
function stage_media(string $path,int $size,string $type): ?string {
    $in=fopen('php://input','rb'); $out=fopen($path,'xb'); if (!$in||!$out) throw new RuntimeException();
    $n=0; $head=''; $tail=''; $hash=hash_init('sha256');
    try {
        if (!chmod($path,0600)) throw new RuntimeException();
        while (!feof($in)) { $chunk=fread($in,65536); if ($chunk===false) throw new RuntimeException(); if ($chunk==='') break; $n+=strlen($chunk); if ($n>$size) return null; $head=substr($head.$chunk,0,16); $tail=substr($tail.$chunk,-2); hash_update($hash,$chunk); if (fwrite($out,$chunk)!==strlen($chunk)) throw new RuntimeException(); }
        $valid=match($type) { 'image/png'=>str_starts_with($head,"\x89PNG\r\n\x1a\n"),'image/jpeg'=>str_starts_with($head,"\xff\xd8\xff")&&$tail==="\xff\xd9",'image/gif'=>in_array(substr($head,0,6),['GIF87a','GIF89a'],true),'image/webp'=>substr($head,0,4)==='RIFF'&&substr($head,8,4)==='WEBP','video/mp4'=>$n>=12&&substr($head,4,4)==='ftyp',default=>false };
        if ($n!==$size||!$valid) return null;
        if (!fflush($out)||!fsync($out)) throw new RuntimeException(); return hash_final($hash);
    } finally { fclose($in); fclose($out); }
}
function serve_media(string $dir,array $m): never {
    $p=$dir.'/media'; $before=lstat($p); $fp=fopen($p,'rb'); if (!$before||!$fp||is_link($p)) fail_share(404);
    $info=fstat($fp); if (!$info||($info['mode']&0170000)!==0100000||$info['nlink']!==1||$info['ino']!==$before['ino']||$info['dev']!==$before['dev']||$info['size']!==$m['size']) fail_share(404);
    $size=$m['size']; $start=0; $end=$size-1; $range=$_SERVER['HTTP_RANGE']??'';
    if ($range!=='') {
        if (!preg_match('/\Abytes=([0-9]{0,9})-([0-9]{0,9})\z/',$range,$r)||($r[1]===''&&$r[2]==='')) { header('Content-Range: bytes */'.$size); fail_share(416); }
        $start=$r[1]===''?max(0,$size-(int)$r[2]):(int)$r[1]; $end=$r[1]!==''&&$r[2]!==''?min($end,(int)$r[2]):$end;
        if ($start>$end||$start>=$size) { header('Content-Range: bytes */'.$size); fail_share(416); }
        http_response_code(206); header("Content-Range: bytes $start-$end/$size");
    }
    header('Content-Type: '.$m['type']); header('Content-Length: '.($end-$start+1)); header('Accept-Ranges: bytes'); header('Content-Disposition: inline; filename=Snapvere.'.share_types()[$m['type']]);
    if (fseek($fp,$start)!==0) exit; $left=$end-$start+1;
    while ($left>0&&!feof($fp)&&!connection_aborted()) { $b=fread($fp,min(65536,$left)); if ($b===false||$b==='') break; echo $b; $left-=strlen($b); }
    fclose($fp); exit;
}
