<?php
// Snapvere by Brendigo
declare(strict_types=1);
require __DIR__ . '/catalog.php';
update_headers();
header('Content-Type: text/html; charset=utf-8');
$catalog = update_catalog(__DIR__ . '/stable.json');
?>
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="Official Snapvere updates for Windows and Linux. Download the latest Free or Pro release."><link rel="canonical" href="https://update.snapvere.com/"><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/updates.css"><title>Snapvere — Software updates</title></head>
<body><header class="nav is-scrolled"><div class="wrap nav__inner"><a class="brand" href="/"><img class="brand__mark" src="/favicon.svg" alt="">Snapvere</a><div class="nav__end"><a class="btn btn--ghost btn--sm" href="https://snapvere.com/">Snapvere website</a></div></div></header>
<main class="wrap updates-main"><p class="kicker">SNAPVERE UPDATES</p><h1 class="h2">Stay up to date.</h1><p class="lede">Get the latest release for your edition and operating system. Keep your captures, settings and local gallery.</p>
<?php if (!$catalog): ?><section class="updates-card"><h2>Updates are currently unavailable</h2><p>No published package catalog is available. Try again later.</p><a class="btn btn--ghost" href="https://snapvere.com/download/tauri/">Official downloads</a></section>
<?php else: ?><section class="updates-card"><p class="kicker">STABLE RELEASE</p><h2>Snapvere <?= update_escape($catalog['version']) ?></h2><p>Choose the same edition and package type you already use. Close Snapvere before installing or replacing your portable copy.</p><p class="updates-note">These packages may be unsigned. Compare the SHA-256 checksum before running a downloaded installer. Installation is always your choice.</p></section>
<div class="updates-grid">
<?php foreach (['Snapvere','Snapvere Pro'] as $edition): foreach (['Windows','Linux'] as $platform): ?>
<section class="updates-card"><h2><?= update_escape($edition . ' · ' . $platform) ?></h2><p class="updates-note">64-bit / x86-64</p>
<?php foreach ($catalog['packages'] as $item):
$name=$item['name']; $pro=str_starts_with($name,'Snapvere-Pro-'); $linux=str_contains($name,'-Linux-');
if ($pro !== ($edition==='Snapvere Pro') || $linux !== ($platform==='Linux')) continue;
$url='/download.php?' . http_build_query(['version'=>$catalog['version'],'package'=>$name], '', '&', PHP_QUERY_RFC3986);
?>
<div class="updates-package"><strong><?= update_escape($name) ?></strong><span><?= number_format($item['size']/1048576,1) ?> MiB</span><a class="btn btn--primary btn--sm" href="<?= update_escape($url) ?>">Download</a><details><summary>SHA-256 checksum</summary><code><?= update_escape($item['sha256']) ?></code></details></div>
<?php endforeach; ?></section><?php endforeach; endforeach; ?></div><?php endif; ?>
<section class="updates-card"><h2>Update from Snapvere</h2><p>Open Settings → About → Check for updates. Select the matching installer, portable executable, DEB or AppImage and choose Download update. The download opens in your browser. Your current installation remains untouched until you install the package yourself.</p></section></main>
<footer class="wrap updates-footer"><span>Snapvere by Brendigo</span><a href="https://snapvere.com/privacy/">Privacy</a><a href="https://snapvere.com/license/">License</a></footer></body></html>
