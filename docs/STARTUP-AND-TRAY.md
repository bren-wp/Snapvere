# Snapvere by Brendigo — Windows startup and notification-area guide

## Startup and expected behavior

On new installations of the **Tauri 2 / Rust Windows edition**, Snapvere enables
login startup by default unless the settings store already contains an explicit
`autostart: false`. The startup entry belongs to the current Windows user and
launches Snapvere with `--snapvere-startup-hidden`. It initializes the gallery,
notification-area icon and global shortcuts without opening a large window.

Launching the application normally (Start menu, taskbar or EXE) opens the gallery.
When Snapvere is already running, a second manual launch focuses the existing
instance; a second **login-startup** invocation does not disturb the user.

Closing the Home window hides it and keeps capture controls running in the
notification area. The **Quit** menu command exits completely. Closing the main
window is not the same as turning off login startup.

## Change the setting

1. Open Snapvere from its notification icon or launch it from the Start menu.
2. Open **Settings → General → Launch on startup**.
3. Leave it enabled to make Snapvere available after Windows sign-in, or turn
   it off to stop future automatic launches. Changes are saved immediately.
4. If Windows or administrator policy blocks the change, the application reports
   an error instead of claiming that the preference was saved.

Disabling startup in Snapvere does not stop the currently running instance.
Use **Quit** to close it. An explicit saved off preference is never
automatically reset by a later application launch or update. If you disable
only the Windows startup entry while keeping the Snapvere preference enabled,
the application may restore that entry on the next manual launch. Debug binaries never modify the
installed application's OS startup entry.

## Keep the icon beside the date and clock

Windows determines whether an installed application's notification icon
appears directly beside the clock or within the hidden-icons overflow. Snapvere
cannot force its icon into the visible portion of the Windows taskbar:

- **Windows 11:** Open **Settings → Personalization → Taskbar → Other system
  tray icons**, then enable Snapvere for permanent visibility (the label may
  differ between Windows 11 versions).
- **Windows 10:** Open **Settings → Personalization → Taskbar → Notification
  area → Select which icons appear on the taskbar**, then enable Snapvere.

The icon only appears while Snapvere is running. If it is missing after login,
check **Settings → Apps → Startup**, the hidden-icons menu, Windows enterprise
policies and Snapvere's local diagnostic log. Windows may delay startup during
the login sequence. Restart Snapvere manually if its process failed.

## Security and reliability notes

- A startup registry entry is user-scoped; no administrative privileges,
  scheduled service, elevation or always-on network connection is needed.
- The startup entry is refreshed after updates so that it points to the current
  executable. Installer relocation and enterprise policy still require
  verification on the target machine.
- Snapvere's single-instance lock prevents duplicate tray icons. Starting
  headlessly with no working notification icon is treated as a launch error.
- Captures and recordings remain local; automatically starting Snapvere is not
  permission to record the desktop without a user-initiated action.
- A system with disabled or reserved PrintScreen shortcuts may require a
  different key binding under Settings → Hotkeys.

See the [acceptance and regression checklist](AUDIT-v0.2.22-startup.md).
