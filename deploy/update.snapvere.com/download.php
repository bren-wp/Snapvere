<?php
// Snapvere by Brendigo
declare(strict_types=1);
require __DIR__.'/catalog.php';
update_headers();
function unavailable_update(): never {
    http_response_code(404);
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><html lang="en"><meta charset="utf-8"><title>Update unavailable — Snapvere</title><link rel="stylesheet" href="/styles.css"><main class="wrap"><h1>Update unavailable</h1><p>No compatible update package is currently available.</p><a href="/">Check current updates</a></main></html>';
    exit;
}
$method=$_SERVER['REQUEST_METHOD']??'';
if (!in_array($method,['GET','HEAD'],true)) {header('Allow: GET, HEAD');http_response_code(405);exit;}
$d=update_catalog(__DIR__.'/stable.json');
$p=update_entry($d,$_GET['version']??null,$_GET['from']??null,$_GET['package']??null);
if (!$p||!update_present($d,$p)) unavailable_update();
$path=update_file($d,$p);
$before=lstat($path); $fp=@fopen($path,'rb');
if (!$before||!$fp||is_link($path)) unavailable_update();
$info=fstat($fp);
if (!$info||($info['mode']&0170000)!==0100000||$info['nlink']!==1||$info['ino']!==$before['ino']||$info['dev']!==$before['dev']||$info['size']!==$p['size']) unavailable_update();
$hash=hash_init('sha256');$count=hash_update_stream($hash,$fp,$p['size']+1);
if ($count!==$p['size']||!hash_equals($p['sha256'],hash_final($hash))||!rewind($fp)) unavailable_update();
header('Content-Type: application/octet-stream');
header('Content-Disposition: attachment; filename="'.$p['name'].'"');
header('Content-Length: '.$p['size']);
if ($method==='GET') fpassthru($fp);
fclose($fp);
