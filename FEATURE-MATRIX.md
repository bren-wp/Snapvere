# Competitive feature matrix — preliminary

Evidence: [Snapvere baseline README](https://github.com/bren-wp/Snapvere/blob/b403f03bdd4de9d523b867e5831290cbe245de61/README.md), [RvgeShot README](https://github.com/notbrec/RvgeShot/blob/99976bc3500f236c49459a917e38b91e33ddbaeb/README.md), [RvgeShot specification](https://github.com/notbrec/RvgeShot/blob/99976bc3500f236c49459a917e38b91e33ddbaeb/docs/SPECIFICATION.md). Status refers to documentary evidence only: IMPLEMENTED = advertised existing implementation, not independently tested; PARTIAL = limited scope; EXPERIMENTAL = explicitly gated; PLANNED = specification/roadmap; MISSING = confirmed absent by baseline description; BLOCKED = rights/acceptance gate. UNKNOWN entries use PARTIAL or PLANNED only if evidence supports them; otherwise mark unassessed. No VERIFIED status without actual testing.

| Capability | RvgeShot | Snapvere | Target edition / acceptance |
|---|---|---|---|
| Region/full display screenshots, annotations, clipboard | IMPLEMENTED | IMPLEMENTED | Free; preserve current behavior |
| Active window capture | PLANNED | Unassessed | Free; foreground window/DPI tests |
| Window detection, capture delay, repeat last region | PLANNED / unassessed | Unassessed | Free; precise geometry; reusable saved profiles Pro |
| Scrolling capture | Unassessed | Unassessed | Free basic / Pro advanced; stitching tests |
| PNG/JPEG/WebP, quality and drag-out | PARTIAL | PARTIAL | Free; safe drag-out, quality, metadata tests |
| Editable annotation objects, pin and full history | PLANNED / unassessed | Unassessed | Free undo/redo and core tools; Pro layers/objects/projects |
| MP4/GIF, cursor, hardware encoder | IMPLEMENTED Windows | IMPLEMENTED Windows; Linux MP4 EXPERIMENTAL | Free; native device acceptance |
| Independent mic/system gain | Unassessed | IMPLEMENTED Windows Pro; Linux EXPERIMENTAL | Pro; device/sync/clipping tests |
| Gallery/tag search/media playback | IMPLEMENTED | IMPLEMENTED | Free; preserve original content |
| Saved collections and export profiles | Unassessed | IMPLEMENTED Pro | Pro; scale and migration tests |
| Batch deletion/export | PLANNED | PARTIAL (batch export) | Pro; durable deletion and rollback |
| Timeline trim/split/merge/render | Unassessed | MISSING (A/B review only) | Pro; original-safe export |
| Offline OCR and sensitive-content detection | PLANNED sensitive scan | PLANNED | Free OCR/manual redaction; Pro batch OCR and smart privacy |
| Private link, expiration, password, revoke, upload list | PLANNED | PLANNED / BLOCKED backend | Free basic; Pro batch/custom policies |
| Auth/magic link, optional OAuth, private S3 storage | PLANNED | PLANNED / BLOCKED backend | Sharing only; no local account requirement |
| SFTP/WebDAV/S3/MinIO self-host | PARTIAL (S3 plan) | PLANNED | Pro; explicit consent, protected credentials, resumable transfer |
| Configurable naming, post-capture actions, system theme, onboarding | PLANNED / unassessed | Unassessed | Free basic; Pro workflows |
| Pro entitlement and signed distribution | Unassessed | MISSING / BLOCKED | Verified native gate, offline licenses, user data unaffected |
| Linux full native recording | Unassessed | EXPERIMENTAL | Free core; real X11/Wayland/PipeWire acceptance |
| macOS | Cross-platform roadmap | Outside current scope | No scope expansion without approval |

These rows are functional requirements, not permission to reuse implementation. Complete source-level inventory, remaining roadmap review, versioned tests and rights review are required before promotion. Preserve existing Free features and avoid duplicate implementations. Do not market roadmap items as shipped.
