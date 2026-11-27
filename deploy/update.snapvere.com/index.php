<?php
// Snapvere by Brendigo
declare(strict_types=1);
require __DIR__.'/catalog.php';
update_headers();
header('Content-Type: text/html; charset=utf-8');
$d=update_catalog(__DIR__.'/stable.json');
$targets=[
 ['Snapvere','Windows','Snapvere-Update.exe'],
 ['Snapvere Pro','Windows','Snapvere-Pro-Update.exe'],
 ['Snapvere','Linux','Snapvere-Linux-Update.svpatch'],
 ['Snapvere Pro','Linux','Snapvere-Pro-Linux-Update.svpatch'],
];
?>
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="Official update center for installed Snapvere editions."><link rel="canonical" href="https://update.snapvere.com/"><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/updates.css"><title>Snapvere — Update Center</title></head>
<body><header class="nav is-scrolled"><div class="wrap nav__inner"><a class="brand" href="/"><img class="brand__mark" src="/favicon.svg" alt="">Snapvere</a><div class="nav__end"><a class="btn btn--ghost btn--sm" href="https://snapvere.com/">Snapvere website</a></div></div></header>
<main class="wrap updates-main"><section class="updates-hero"><p class="kicker">SNAPVERE UPDATE CENTER</p><h1 class="h2">Keep your installed app up to date.</h1><p class="lede">Dedicated updates for your existing installation. No full installers or portable packages.</p><?php if ($d): ?><p class="updates-version">Latest published release <strong>v<?=update_escape($d['version'])?></strong></p><?php endif; ?></section>
<div class="updates-grid">
<?php foreach ($targets as [$edition,$os,$name]): $entry=null; if ($d) foreach($d['packages'] as $p) if ($p['name']===$name && update_present($d,$p)) $entry=$p; ?>
<section class="updates-card"><div class="updates-card-head"><span class="updates-platform"><?=update_escape($os)?> · 64-bit</span><?php if ($edition==='Snapvere Pro'): ?><span class="updates-pro">PRO</span><?php endif; ?></div><h2><?=update_escape($edition)?></h2>
<?php if ($entry): ?><p class="updates-note">From <?=update_escape($entry['from'])?> to <?=update_escape($d['version'])?></p><strong><?=update_escape($name)?></strong><p class="updates-note"><?=number_format($entry['size']/1048576,2)?> MiB</p>
<a class="btn btn--primary" href="<?=update_escape('/download.php?'.http_build_query(['version'=>$d['version'],'from'=>$entry['from'],'package'=>$name],'','&',PHP_QUERY_RFC3986))?>">Download update</a><details><summary>SHA-256 checksum</summary><code><?=update_escape($entry['sha256'])?></code></details>
<?php else: ?><p class="updates-status">No compatible update available</p><p class="updates-note">Only a published update for an existing installation will appear here.</p><?php endif; ?>
</section><?php endforeach; ?>
</div>
<section class="updates-card updates-help"><h2>Update your installation</h2><p>In Snapvere, open Settings → About → Check for updates. Updates are offered only for compatible installed editions and exact previous versions. Portable EXE and AppImage users do not receive updates from this service.</p><p class="updates-note">A stable release label does not certify publisher signatures. Never run an untrusted executable. Back up your local gallery before applying an update.</p></section></main>
<footer class="wrap updates-footer"><span>Snapvere by Brendigo</span><a href="https://snapvere.com/privacy/">Privacy</a><a href="https://snapvere.com/license/">License</a></footer></body></html>
