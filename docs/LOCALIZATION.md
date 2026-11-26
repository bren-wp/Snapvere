# SNAPVERE localization and internationalization QA

## Scope

The shared Tauri/Rust Windows and Linux desktop application defaults to **English (en)**. The
user can switch languages in **Settings → General → Language**. Supported codes:

| Code | Language |
| --- | --- |
| en | English |
| hr | Hrvatski |
| de | Deutsch |
| es | Español |
| fr | Français |
| it | Italiano |
| pt | Português |
| nl | Nederlands |
| pl | Polski |
| cs | Čeština |
| sk | Slovenčina |
| sl | Slovenščina |

The application uses the shared English-source localization catalog. For this
candidate, 225 UI keys cover the standard React interface: Home, Settings,
Editor, Overlay, recording HUD, gallery, video/image viewer, errors, privacy,
licenses, navigation, keyboard shortcuts and accessibility names.

Native tray labels are separately available in `src-tauri/src/tray_locale.rs`
for all 12 languages. The currently selected language is read at launch and
live-updated after the Settings command persists it. Windows system messages,
third-party media decoder descriptions and installer wizard dialogs are not
managed by this catalog; their localization must be validated separately.

## Developer workflow

Keep **English as the source string**. Add every new visible string to the
appropriate `src/lib/i18n*.ts` catalog for all 11 additional languages. Call
`t("Exact source text")` in React components and use the shared
`useLanguage()` context. Never keep hard-coded user-facing text in visible JSX,
`aria-label`, `title`, `hint` or `placeholder`. Format media timestamps and
byte sizes with `mediaFormatting.ts` rather than forcing an English locale.

After adding menu commands or language support, update the native tray
translations and the language allowlist. Do not expand the native store
capabilities; only the Settings window may persist the language preference.

## Quality gates

```bash
cd apps/desktop
npm ci --ignore-scripts
npm run lint
npm run test:unit
npm run build
```

The unit suite checks supported language codes, duplicate keys, empty
translations, dynamic control labels, UI source literals and fallback rules.
The screenshot pipeline also tests the language picker on each available
language and checks responsive Settings overflow.

The native Windows CI runs `cargo fmt --all -- --check`,
`cargo test --locked` (including the native tray label coverage test),
`cargo clippy --all-targets --locked -- -D warnings` and generates portable,
NSIS and MSI preview artifacts.

**Release acceptance remains incomplete** without physical Windows 10/11
testing of capture, audio, multi-monitor screen geometry, hardware recorder
recovery, regional font rendering, screen-reader behavior and actual
pixel-by-pixel comparison against approved reference screenshots. Windows
installation, EULA and OS-provided dialogs require separate validation.


Native gallery deletion confirmation uses the selected language, with all twelve locales copied from the existing UI catalog. Rust unit tests cover presence, button distinction and English fallback. Physical native dialog presentation and translation proofreading remain acceptance tasks.
