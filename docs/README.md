# Snapvere documentation

Current baseline: v0.2.36 unsigned preview; v0.2.37 candidate. Use the current documents below for product status; older version/date-specific reports are historical evidence, not current availability claims.

| Document | Purpose |
|---|---|
| [Product specification](SPECIFICATION.md) | Current interfaces, architecture and platform boundaries |
| [Roadmap](../ROADMAP.md) | Seven ordered phases and exit criteria |
| [Feature matrix](../FEATURE-MATRIX.md) | Free/Pro scope and functional references |
| [Source provenance](../SOURCE-PROVENANCE.md) | Owner's authorship statement and licensing boundaries |
| [Current audit register](AUDIT-2026-11-26.md) | Security/dead-code findings, evidence and open gaps |
| [Verification matrix](TASK-BREAKDOWN.md) | CI and physical acceptance |
| [Release acceptance](RELEASE-QA-2026-11-23-FREE-PRO.md) | Free/Pro packages and gates, updated checklist |
| [Distribution and privacy](DISTRIBUTION-PRIVACY-AND-TRANSFERS.md) | Architectures, local storage, future transfer restrictions |
| [Localization](LOCALIZATION.md) | 12 languages |
| [Startup and tray](STARTUP-AND-TRAY.md) | Windows behavior |
| [Clipboard import](BROWSER-CLIPBOARD-HANDOFF.md) | Local clipboard only; no extensions |
| [Update notifications](UPDATE-SERVER.md) | Informational HTTPS feed, no installer execution |
| [Linux acceptance](LINUX-PREVIEW-QA-2026-11-22.md) | Platform checklist; Linux MP4/audio remain experimental |
| [Wayland QA](QA-WAYLAND-COMPOSITORS.md) | Compositor acceptance |
| [Competitive requirements](COMPETITIVE-PARITY-LIGHTSHOT-PRO.md) | Historical comparison and planned feature gates |
| [Changelog](../CHANGELOG.md) | Version history |
| [License](../LICENSE) and [EULA](../legal/SNAPVERE-COMMERCIAL-EULA.txt) | Source and distribution terms |

Historical AUDIT, SECURITY, VISUAL, CROP and RECORDING reports preserve the version-specific observations at the time of writing. Do not overwrite those findings to imply later testing. Current audit register supersedes their status summaries; physical testing and signing remain outstanding. Screenshots in screenshots/ are real frontend component renders with a test IPC bridge, not installed native screenshots.

## Historical archive

The following superseded version-specific reports were removed from the current tree to keep the documentation focused. Their full contents remain available at the pinned historical revision. Current audit and acceptance documents retain outstanding gates; archiving does not mark findings resolved.

- [AUDIT-v0.2.14-P1-integrity-ipc.md](https://github.com/bren-wp/Snapvere/blob/11a88c8278f60dea53edba53b3a21283998ff9ad/docs/AUDIT-v0.2.14-P1-integrity-ipc.md)
- [AUDIT-v0.2.15-P1-WASAPI.md](https://github.com/bren-wp/Snapvere/blob/11a88c8278f60dea53edba53b3a21283998ff9ad/docs/AUDIT-v0.2.15-P1-WASAPI.md)
- [AUDIT-v0.2.16-P1-audio-runtime.md](https://github.com/bren-wp/Snapvere/blob/11a88c8278f60dea53edba53b3a21283998ff9ad/docs/AUDIT-v0.2.16-P1-audio-runtime.md)
- [AUDIT-v0.2.17-P1-audio-memory.md](https://github.com/bren-wp/Snapvere/blob/11a88c8278f60dea53edba53b3a21283998ff9ad/docs/AUDIT-v0.2.17-P1-audio-memory.md)
- [AUDIT-v0.2.18-P1-com-release.md](https://github.com/bren-wp/Snapvere/blob/11a88c8278f60dea53edba53b3a21283998ff9ad/docs/AUDIT-v0.2.18-P1-com-release.md)
- [AUDIT-v0.2.22-startup.md](https://github.com/bren-wp/Snapvere/blob/11a88c8278f60dea53edba53b3a21283998ff9ad/docs/AUDIT-v0.2.22-startup.md)
- [AUDIT-v0.2.8-security-dead-code.md](https://github.com/bren-wp/Snapvere/blob/11a88c8278f60dea53edba53b3a21283998ff9ad/docs/AUDIT-v0.2.8-security-dead-code.md)
- [AUDIT-v0.2.9-security-dead-code.md](https://github.com/bren-wp/Snapvere/blob/11a88c8278f60dea53edba53b3a21283998ff9ad/docs/AUDIT-v0.2.9-security-dead-code.md)
- [VISUAL-CORRECTIONS-v0.2.18.md](https://github.com/bren-wp/Snapvere/blob/11a88c8278f60dea53edba53b3a21283998ff9ad/docs/VISUAL-CORRECTIONS-v0.2.18.md)
- [VISUAL-DELTA-v0.2.18.md](https://github.com/bren-wp/Snapvere/blob/11a88c8278f60dea53edba53b3a21283998ff9ad/docs/VISUAL-DELTA-v0.2.18.md)
