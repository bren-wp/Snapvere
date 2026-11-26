# Snapvere sharing service

Run Node.js 24 behind an HTTPS reverse proxy for snpv.re. Keep site/ alongside snpv.re/ to share the original stylesheet, favicon and font. Set SNAPVERE_SHARE_STORAGE to a private directory outside the repository (0700) and SNAPVERE_SHARE_KEY to a random secret of at least 32 bytes. Start with node snpv.re/server.mjs. Create a one-hour, single-use upload code with node snpv.re/server.mjs grant. Never distribute the signing key to clients.

POST /api/v1/shares with Bearer upload code, Content-Type, Content-Length and X-Share-TTL (3600, 86400 or 604800). Body is raw media, maximum 16 MiB technical limit. Response includes canonical HTTPS link, expiry and separate revocation secret. DELETE /api/v1/shares/TOKEN with Bearer revocation secret. Recipients need only the secret URL. No public media list. Revocation does not recall existing downloads or active streams.

Before public deployment: configure TLS, hostname validation, no private URL or credential logging, proxy rate/body limits, disk quotas, durable expiry cleanup, backups, abuse reporting, full media validation and physical/native acceptance. Current media checks validate signatures, not complete decodes. Expired data remains stored until explicit cleanup. Password protection and account-based provisioning are not implemented. No service is represented as live.
