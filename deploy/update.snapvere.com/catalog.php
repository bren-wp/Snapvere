<?php
// Snapvere by Brendigo
declare(strict_types=1);
function update_names(): array {
    $names = [];
    foreach (['Snapvere', 'Snapvere-Pro'] as $prefix) {
        foreach (['-Setup.exe','-Setup.msi','-Portable.exe','-Linux-amd64.deb','-Linux-x86_64.AppImage'] as $suffix) {
            $names[] = $prefix . $suffix;
        }
    }
    return $names;
}
function update_catalog(string $path): ?array {
    if (!is_file($path) || is_link($path)) return null;
    $raw = @file_get_contents($path, false, null, 0, 8193);
    if ($raw === false || strlen($raw) > 8192) return null;
    $data = json_decode($raw, true, 16);
    if (!is_array($data) || ($data['product'] ?? '') !== 'snapvere-tauri-windows' ||
        ($data['channel'] ?? '') !== 'stable' || !is_string($data['version'] ?? null) ||
        !preg_match('/\A(?:0|[1-9][0-9]{0,5})\.(?:0|[1-9][0-9]{0,5})\.(?:0|[1-9][0-9]{0,5})\z/', $data['version']) ||
        !is_array($data['packages'] ?? null) || count($data['packages']) !== 10) return null;
    $remaining = array_fill_keys(update_names(), true);
    foreach ($data['packages'] as $p) {
        if (!is_array($p) || !is_string($p['name'] ?? null) || !isset($remaining[$p['name']]) ||
            !is_int($p['size'] ?? null) || $p['size'] < 1000000 ||
            !is_string($p['sha256'] ?? null) || !preg_match('/\A[0-9a-f]{64}\z/', $p['sha256'])) return null;
        unset($remaining[$p['name']]);
    }
    return $data;
}
function update_destination(?array $data, mixed $version, mixed $package): ?string {
    if (!$data || !is_string($version) || !is_string($package) || $version !== $data['version'] ||
        !in_array($package, update_names(), true)) return null;
    foreach ($data['packages'] as $entry) {
        if ($entry['name'] === $package) return 'https://github.com/bren-wp/Snapvere/releases/download/v' . rawurlencode($version) . '/' . rawurlencode($package);
    }
    return null;
}
function update_headers(): void {
    header('Cache-Control: no-store');
    header('Referrer-Policy: no-referrer');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Strict-Transport-Security: max-age=31536000');
    header("Content-Security-Policy: default-src 'none'; style-src 'self'; img-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
}
function update_escape(string $value): string { return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
