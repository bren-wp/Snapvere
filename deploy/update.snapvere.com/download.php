<?php
// Snapvere by Brendigo
declare(strict_types=1);
require __DIR__ . '/catalog.php';
update_headers();
if (!in_array($_SERVER['REQUEST_METHOD'] ?? '', ['GET','HEAD'], true)) {
    header('Allow: GET, HEAD'); http_response_code(405); exit;
}
$destination = update_destination(update_catalog(__DIR__ . '/stable.json'), $_GET['version'] ?? null, $_GET['package'] ?? null);
if ($destination === null) {
    http_response_code(404);
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><html lang="en"><meta charset="utf-8"><title>Update unavailable — Snapvere</title><link rel="stylesheet" href="/styles.css"><main class="wrap"><h1>Update unavailable</h1><p>This version is no longer listed or the package is unavailable.</p><a href="/">Check current updates</a></main></html>';
    exit;
}
header('Location: ' . $destination, true, 302);
exit;
