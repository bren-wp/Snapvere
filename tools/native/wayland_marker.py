#!/usr/bin/env python3
# Snapvere by Brendigo
"""Synthetic native Wayland test window, not a production preview."""
import gi
gi.require_foreign("cairo")
gi.require_version("Gtk", "3.0")
from gi.repository import GLib, Gtk

window = Gtk.Window(title="Snapvere QA marker")
window.set_default_size(400, 300)
area = Gtk.DrawingArea()

phase = False

def draw(_area, cr):
    # Both shades satisfy the magenta marker predicate. Real repaint
    # damage prevents a static test surface from starving the capture.
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
