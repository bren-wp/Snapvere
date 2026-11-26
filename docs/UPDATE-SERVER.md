# SNAPVERE — update.snapvere.com

The update site serves the same Snapvere stylesheet, favicon and font as snapvere.com. The app checks `https://update.snapvere.com/stable.json` only on request or after explicit opt-in. The catalog is shared by Windows x64 and Linux x86-64, Free and Pro. It lists ten exact package names, byte lengths and SHA-256 hashes. The legacy Windows product identifier and download URL are retained for older clients.

Settings → About → Check for updates: choose the same edition and package type (EXE setup, MSI, portable EXE, DEB or AppImage). Download update opens `https://update.snapvere.com/download.php` in the user's default browser, with the exact catalog version and selected package. The server validates both against the local published catalog and redirects only to the matching immutable release asset path in the official repository. No installer is silently downloaded by a WebView, run or applied automatically. A stable channel label and SHA-256 do not authenticate an unsigned publisher.

## Deployment

1. Publish a verified Stable release with all 13 assets. The release workflow generates Snapvere-update-stable.json from the ten exact binary packages before checksum and remote digest verification. Never publish a draft or rehearsal catalog.
2. Download the exact manifest asset of the published release and verify its SHA-256 against SHA256SUMS.txt. Verify all ten package digests and availability against that release.
3. Run `python tools/prepare_update_site.py --manifest /path/to/Snapvere-update-stable.json --out /path/to/new-update-site`. This stages the PHP pages, original site styling and manifest without overwriting an existing deployment.
4. Configure update.snapvere.com DNS, HTTPS and a PHP 8.1+ web host. Deploy the staged directory as its document root (including hidden .htaccess). For Apache enable the required headers, MIME and override settings; for Nginx configure PHP-FPM, restrict catalog.php, disable directory listing and serve /stable.json as application/json with Access-Control-Allow-Origin: * and Cache-Control: no-store. Preserve prior published files during deployment; atomically switch the staged root or manifest after verification.
5. Verify the HTTPS website, JSON, direct download responses and exact final asset URLs for all ten packages. A missing catalog is shown as unavailable, never as a made-up release. Older catalog versions remain installed until users explicitly update.

No account, database, tracking, cookies, cron or signing key is needed for these download links. Production DNS/TLS/hosting and real download acceptance are separate deployment gates. Automatic **installation** requires a separately reviewed signed updater protocol and securely protected signing key. Physical Windows/Linux acceptance must confirm browser handoff and matching installed edition, portable vs installer choice and preservation of user data.
