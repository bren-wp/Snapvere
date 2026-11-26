# SNAPVERE — self-hosted update notifications

This is the **Tauri/Rust Windows** distribution of SNAPVERE, not the separately distributed WinUI/.NET edition. Update checks are optional, informational, and cannot silently execute installers. Only upload a manifest when the matching Tauri installer is published and its checksum and edition verified on the dedicated download page. Never use the WinUI website version for a Tauri feed.

## 1. Prepare `update.snapvere.com`

Create a DNS A/AAAA record, provision valid HTTPS/TLS, and serve the following file at the exact public URL:

```text
https://update.snapvere.com/stable.json
```

The contents must be a small UTF-8 JSON document (maximum 8192 bytes), with `Content-Type: application/json`:

```json
{
  "product": "snapvere-tauri-windows",
  "version": "0.2.20",
  "notes": "Fixed crashes and improved capture reliability.",
  "download_url": "https://snapvere.com/download/tauri/"
}
```

The separate Tauri channel is `/download/tauri/`, linking only to official GitHub Releases. `/download/` remains the WinUI/.NET v0.2.4 channel. The `version` field must be a strictly numeric `major.minor.patch`. **Version 0.2.20 is only an example** — do not post it unless a corresponding, tested 0.2.20 Tauri/Rust installer is actually available on the official download page. Do not mix public WinUI binaries with Tauri/Rust update packages.

Example static site configuration (Nginx; provide your own certificate/key securely):

```nginx
server {
    listen 443 ssl http2;
    server_name update.snapvere.com;
    ssl_certificate /etc/letsencrypt/live/update.snapvere.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/update.snapvere.com/privkey.pem;
    root /var/www/update.snapvere.com;

    location = /stable.json {
        limit_except GET HEAD { deny all; }
        default_type application/json;
        add_header Access-Control-Allow-Origin "*" always;
        add_header Cache-Control "no-store, max-age=0" always;
        add_header X-Content-Type-Options nosniff always;
        add_header Strict-Transport-Security "max-age=31536000" always;
        try_files /stable.json =404;
    }
}
```

Upload the manifest atomically (write to a temporary file then rename it) **after** all release files, hashes and official site links are verified. No PHP, database, account, cron or WordPress plugin is required.

## 2. Application behavior

At startup, Home performs a 6.5-second maximum, cache-disabled, credential-free GET to the exact URL above. While visible, the app checks at most hourly, and it rechecks upon regaining focus if at least five minutes have elapsed; **no hidden-window polling or background service** is required. Settings → About performs the same check and offers a manual **Check for updates** button. Settings also provides **Check automatically on startup**, enabled by default and optional. Unavailable DNS, invalid JSON, an unchanged/older version or an offline PC must never stop normal capture/recording.

If the manifest version is newer than the app's local version, Home shows a localized notification. The user may open Settings, where a button opens **only** `https://snapvere.com/download/tauri/`. No data or binary URLs from untrusted JSON are followed; malformed, nonofficial download URLs are rejected. The app does **not** download, execute or silently install a binary.

Only the public feed is requested; no screenshots, recordings, file paths, personal settings, activation data or telemetry are sent by the update code. A normal HTTPS request may expose the device's IP address and generic HTTP client information to the server; disclose that in your website privacy notice.

## 3. Security and future in-app installation

The endpoint is restricted by the WebView content-security policy to `https://update.snapvere.com`. Unit tests reject unexpected product IDs, malformed versions, oversized content and unexpected download domains. CI rejects any other network calls from the desktop source.

For a future **one-click in-app installer**, integrate Tauri's signed updater protocol: generate and protect an offline Ed25519 signing private key, embed its **public** key in the application, publish appropriately signed Windows updater bundles and signatures, and verify signatures before installing. Never commit the signing private key or use a plain version JSON alone as installer authenticity proof.

The current release packages' SHA-256 sums are useful integrity checks but are **not** a substitute for publisher code signatures.

## 4. Verification before publication

1. With v0.2.19 installed, upload a manifest also showing v0.2.19: the app should show **latest version**.
2. Upload a manifest for a truly published newer Tauri release: Home/Settings should show the version and plain-text notes.
3. Stop the server or block networking: the app should keep working, and Settings should show a retryable status.
4. Check the site link, optional startup-check toggle and localizations in all twelve languages.
5. Test on physical Windows 10/11 with 100%, 125%, 150%, 200% scaling and confirm no dialog is cropped.

## 5. Corner notification after a new website release

Version 0.2.25 moves the existing Home update notice to the **bottom-right
of the app window** (not a system-wide Windows toast while Snapvere is hidden
in the tray). When the user closes a notice, that exact version is remembered
locally; a later published version can notify again. The Settings toggle and
Home now synchronize through browser storage events. Users can still check
manually from Settings and open the same official download page.

**Deployment is a two-step publication**, never inferred from a changed web page:
(1) publish and verify the signed/trusted Windows installer(s) and site links;
(2) generate `stable.json` with `python tools/generate_update_manifest.py
--version <published-version> --out stable.json`, then upload that file
atomically to `https://update.snapvere.com/stable.json` with JSON MIME and
CORS. Until step 2, existing installations do not know a new version exists.
A version-only manifest never authorizes executing remote installers.

This in-app notice is opt-out: disable automatic checks under Settings → About.
It performs no tracking, telemetry, screenshot upload or unattended install.

### Focus synchronization and opt-out reliability

Home and Settings read the shared local update-check preferences on window focus,
in addition to ordinary `storage` events. Some WebView2 installations do not
relay `storage` to another Tauri window consistently. When the user opts out
in Settings, Home aborts an in-flight check and clears stale notification data
when it regains focus. Re-enabling checks triggers exactly one immediate request
via the existing effect. The version dismissal is also reconciled on focus.


## Current preview policy

v0.2.35 is an unsigned preview. The version-only sample manifest is not authorization to publish a production stable feed. The client rejects non-JSON media types, invalid content lengths and malformed versions, caps streaming storage at 8192 bytes, and aborts on completion or rejection. A GitHub release label is not proof of publisher authenticity.
