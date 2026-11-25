# Local clipboard image import

Snapvere desktop supports explicit, user-initiated import of an image from the operating system clipboard into its local gallery. The application does not poll the clipboard, run a background server or read arbitrary files from other applications.

The native `import_clipboard_image` command is restricted to the home WebView, runs on a blocking worker rather than the GUI thread, and validates image dimensions before import. This ordinary desktop capability is retained independently of discontinued browser integrations.

Physical Windows and Linux clipboard interoperability and gallery refresh require device acceptance testing.
