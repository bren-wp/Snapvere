<?php
// Snapvere by Brendigo
declare(strict_types=1);
function update_names(): array {
    return ['Snapvere-Update.exe','Snapvere-Pro-Update.exe','Snapvere-Linux-Update.svpatch','Snapvere-Pro-Linux-Update.svpatch'];
}
function update_version(mixed $v): bool {
    return is_string($v) && preg_match('/\A(?:0|[1-9][0-9]{0,5})\.(?:0|[1-9][0-9]{0,5})\.(?:0|[1-9][0-9]{0,5})\z/',$v)===1;
}
// Provisioned only by an accepted production package build, never by a download.
const UPDATE_PUBLIC_KEY_HEX = '';
function update_catalog(string $path,string $trustedKey=UPDATE_PUBLIC_KEY_HEX): ?array {
    if (!is_file($path)||is_link($path)) return null;
    $raw=@file_get_contents($path,false,null,0,8193);
    if ($raw===false||strlen($raw)>8192) return null;
    $d=json_decode($raw,true,16);
    if (!is_array($d)) return null;
    $authenticated=false;
    if (array_key_exists('signed',$d)||array_key_exists('signature',$d)) {
        if (count($d)!==2||!is_string($d['signed']??null)||strlen($d['signed'])>8192||
            !is_string($d['signature']??null)||!preg_match('/\A[0-9a-f]{128}\z/',$d['signature'])||
            !preg_match('/\A[0-9a-f]{64}\z/',$trustedKey)||!function_exists('sodium_crypto_sign_verify_detached')) return null;
        if (!sodium_crypto_sign_verify_detached(hex2bin($d['signature']),"Snapvere signed catalog v1\n".$d['signed'],hex2bin($trustedKey))) return null;
        $d=json_decode($d['signed'],true,16);
        $authenticated=true;
    }
    if (!is_array($d)||($d['product']??'')!=='snapvere-installed-delta-v1'||
        ($d['channel']??'')!=='stable'||!update_version($d['version']??null)||
        !is_array($d['packages']??null)||count($d['packages'])>4) return null;
    if ($d['packages']!==[]&&!$authenticated) return null;
    $remaining=array_fill_keys(update_names(),true);
    foreach ($d['packages'] as $p) {
        if (!is_array($p)||!is_string($p['name']??null)||!isset($remaining[$p['name']])||
            ($p['kind']??'')!=='delta'||!update_version($p['from']??null)||version_compare($d['version'],$p['from'],'<=')||
            !is_int($p['size']??null)||$p['size']<1||$p['size']>536870912||
            !is_string($p['sha256']??null)||!preg_match('/\A[0-9a-f]{64}\z/',$p['sha256'])) return null;
        unset($remaining[$p['name']]);
    }
    return $d;
}
function update_entry(?array $data,mixed $version,mixed $from,mixed $name): ?array {
    if (!$data||!is_string($version)||!is_string($from)||!is_string($name)||$version!==$data['version']||!in_array($name,update_names(),true)) return null;
    foreach ($data['packages'] as $p) if ($p['name']===$name && $p['from']===$from) return $p;
    return null;
}
function update_file(array $data,array $p): string {
    return __DIR__.'/patches/'.$data['version'].'/'.$p['from'].'/'.$p['name'];
}
function update_present(array $data,array $p): bool {
    $path=update_file($data,$p);
    return is_file($path)&&!is_link($path)&&realpath($path)===$path&&filesize($path)===$p['size'];
}
function update_headers(): void {
    header('Cache-Control: no-store');
    header('Referrer-Policy: no-referrer');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Strict-Transport-Security: max-age=31536000');
    header("Content-Security-Policy: default-src 'none'; style-src 'self'; img-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
}
function update_escape(string $value): string {return htmlspecialchars($value,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');}
