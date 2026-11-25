#!/usr/bin/env python3
# Snapvere by Brendigo
"""Synthetic native Wayland test window, not a production preview."""
import sys
import gi
gi.require_foreign("cairo")
gi.require_version("Gtk", "3.0")
from gi.repository import GLib, Gtk

baseline = sys.argv[1:] == ["--baseline"]
if sys.argv[1:] and not baseline:
    raise SystemExit("Usage: wayland_marker.py [--baseline]")
window = Gtk.Window(title="Snapvere QA baseline" if baseline else "Snapvere QA marker")
window.set_default_size(400, 300)
area = Gtk.DrawingArea()

phase = False

def draw(_area, cr):
    # Both shades satisfy the magenta marker predicate. Real repaint
    # damage prevents a static test surface from starving the capture.
    if baseline:
        # Two blue shades of the known RGB fixture, both within its bounds.
        # Repaint the authorized output itself, not only the other output.
        cr.set_source_rgb(18 / 255, 52 / 255, (92 if phase else 80) / 255)
    else:
        cr.set_source_rgb(1 if phase else 0.94, 0, 1)
    cr.paint()
    return True

def repaint():
    global phase
    phase = not phase
    area.queue_draw()
    return GLib.SOURCE_CONTINUE

area.connect("draw", draw)
GLib.timeout_add(50, repaint)
window.add(area)
window.connect("destroy", Gtk.main_quit)
window.show_all()
Gtk.main()
