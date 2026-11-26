<?php
// Snapvere by Brendigo
declare(strict_types=1);
if (PHP_SAPI!=='cli') { http_response_code(404); exit; }
require __DIR__.'/service.php';
umask(0077);
$path=storage_path();
if (!is_dir($path)&&!mkdir($path,0700,true)) exit(1);
$root=share_storage();
if (!file_exists($root.'/key')) write_new($root.'/key',bin2hex(random_bytes(32)));
$key=share_key($root);
$payload=(milliseconds()+3600000).'.'.b64u(random_bytes(24));
echo $payload.'.'.b64u(hash_hmac('sha256',$payload,$key,true)).PHP_EOL;
