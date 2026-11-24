#!/usr/bin/env python3
# Snapvere by Brendigo
"""Synthetic native Wayland test window, not a production preview."""
import gi
gi.require_version("Gtk", "3.0")
from gi.repository import Gtk

window = Gtk.Window(title="Snapvere QA marker")
window.set_default_size(400, 300)
area = Gtk.DrawingArea()

def draw(_area, cr):
    cr.set_source_rgb(1, 0, 1)
    cr.paint()
    return True

area.connect("draw", draw)
window.add(area)
window.connect("destroy", Gtk.main_quit)
window.show_all()
Gtk.main()
