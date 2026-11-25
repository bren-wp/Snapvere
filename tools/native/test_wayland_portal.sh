#!/usr/bin/env bash
# Snapvere by Brendigo
# Only isolated virtual outputs. No host consent, screen data or config changes.
set -euo pipefail
if [[ "${SNAPVERE_PORTAL_QA:-}" != 1 ]]; then
  exec dbus-run-session -- env SNAPVERE_PORTAL_QA=1 bash "$0"
fi
root="$(cd "$(dirname "$0")/../.." && pwd)"
runtime="$(mktemp -d)"
chmod 700 "$runtime"
export XDG_RUNTIME_DIR="$runtime" PIPEWIRE_RUNTIME_DIR="$runtime"
export XDG_CONFIG_HOME="$runtime/config" XDG_CACHE_HOME="$runtime/cache"
export XDG_STATE_HOME="$runtime/state" XDG_DATA_HOME="$runtime/data"
export XDG_CURRENT_DESKTOP=sway XDG_SESSION_DESKTOP=sway XDG_SESSION_TYPE=wayland
export WLR_BACKENDS=headless WLR_HEADLESS_OUTPUTS=2 WLR_RENDERER=pixman
export WLR_LIBINPUT_NO_DEVICES=1 GDK_BACKEND=wayland GTK_USE_PORTAL=0
export NO_AT_BRIDGE=1
export PIPEWIRE_REMOTE=pipewire-0
unset DISPLAY WAYLAND_DISPLAY WAYLAND_SOCKET SWAYSOCK
mkdir -p "$XDG_CONFIG_HOME/xdg-desktop-portal" "$XDG_CONFIG_HOME/xdg-desktop-portal-wlr" "$XDG_CACHE_HOME" "$XDG_STATE_HOME" "$XDG_DATA_HOME"
pids=()
cleanup() {
  status=$?
  trap - EXIT
  if [[ "$status" != 0 ]]; then
    for file in "$runtime"/*.log; do [[ ! -f "$file" ]] || { echo "=== $file ==="; tail -60 "$file"; }; done
  fi
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
  for pid in "${pids[@]}"; do wait "$pid" 2>/dev/null || true; done
  # The document portal may mount FUSE inside this private runtime.
  # Unmount only this test's mount; never recurse into an active portal mount.
  if mountpoint -q "$runtime/doc"; then
    if ! fusermount3 -uz "$runtime/doc"; then
      echo "Failed to unmount private document portal"
      exit 1
    fi
  fi
  rm -rf -- "$runtime" || status=1
  exit "$status"
}
trap cleanup EXIT
cat > "$runtime/sway.conf" <<'CONF'
xwayland disable
output HEADLESS-1 mode --custom 640x480 position 0 0 scale 1 bg #123456 solid_color
output HEADLESS-2 mode --custom 640x480 position 640 0 scale 1 bg #123456 solid_color
workspace 1 output HEADLESS-1
workspace 2 output HEADLESS-2
default_border none
default_floating_border none
CONF
sway --config "$runtime/sway.conf" >"$runtime/sway.log" 2>&1 & pids+=("$!")
shopt -s nullglob
for _ in {1..100}; do
  for socket in "$runtime"/wayland-*; do
    if [[ -S "$socket" ]]; then export WAYLAND_DISPLAY="${socket##*/}"; break; fi
  done
  for socket in "$runtime"/sway-ipc.*.sock; do
    if [[ -S "$socket" ]]; then export SWAYSOCK="$socket"; break; fi
  done
  [[ -n "${WAYLAND_DISPLAY:-}" && -n "${SWAYSOCK:-}" ]] && break
  sleep .1
done
[[ -n "${WAYLAND_DISPLAY:-}" && -n "${SWAYSOCK:-}" ]]
swaymsg -t get_outputs | python3 -c 'import json,sys; outputs={o["name"]:o["rect"] for o in json.load(sys.stdin) if o["active"]}; assert outputs["HEADLESS-1"]==dict(x=0,y=0,width=640,height=480); assert outputs["HEADLESS-2"]==dict(x=640,y=0,width=640,height=480)'
# Damage-driven ext_image_copy_capture may not emit on an idle output.
# Map a separate animated, known-color surface on the authorized output.
swaymsg 'focus output HEADLESS-1; workspace 1'
/usr/bin/python3 "$root/tools/native/wayland_marker.py" --baseline >"$runtime/baseline.log" 2>&1 & baseline_pid=$!; pids+=("$baseline_pid")
baseline_ready=0
for _ in {1..100}; do
  kill -0 "$baseline_pid" || { cat "$runtime/baseline.log"; exit 1; }
  if swaymsg -t get_tree | grep 'Snapvere QA baseline' >/dev/null; then
    baseline_ready=1
    break
  fi
  sleep .1
done
[[ "$baseline_ready" == 1 ]] || { echo "GTK baseline window did not map"; exit 1; }
swaymsg '[title="Snapvere QA baseline"] move container to output HEADLESS-1'
swaymsg '[title="Snapvere QA baseline"] fullscreen enable'
swaymsg 'focus output HEADLESS-2; workspace 2'
/usr/bin/python3 "$root/tools/native/wayland_marker.py" >"$runtime/marker.log" 2>&1 & marker_pid=$!; pids+=("$marker_pid")
marker_ready=0
for _ in {1..100}; do
  kill -0 "$marker_pid" || { cat "$runtime/marker.log"; exit 1; }
  if swaymsg -t get_tree | grep 'Snapvere QA marker' >/dev/null; then
    marker_ready=1
    break
  fi
  sleep .1
done
[[ "$marker_ready" == 1 ]] || { echo "GTK control window did not map"; exit 1; }
swaymsg '[title="Snapvere QA marker"] move container to output HEADLESS-2'
swaymsg '[title="Snapvere QA marker"] fullscreen enable'
# Prove that the control window is actually visible on the other output.
for _ in {1..30}; do
  grim -o HEADLESS-2 "$runtime/control.png"
  if /usr/bin/python3 - "$runtime/control.png" <<'PY'
from PIL import Image
import sys
r,g,b=Image.open(sys.argv[1]).convert("RGB").getpixel((320,240))
sys.exit(0 if r>220 and g<35 and b>220 else 1)
PY
  then break; fi
  kill -0 "$marker_pid" || { cat "$runtime/marker.log"; exit 1; }
  sleep .1
done
/usr/bin/python3 - "$runtime/control.png" <<'PY'
from PIL import Image
import sys
r,g,b=Image.open(sys.argv[1]).convert("RGB").getpixel((320,240))
assert r>220 and g<35 and b>220, ("Control window is not visible on the other output", (r,g,b))
PY
# Independently verify both real repaint phases on the authorized output.
/usr/bin/python3 - "$runtime/background.png" <<'PY'
from PIL import Image
import subprocess, sys, time
phases = set()
for _ in range(60):
    subprocess.run(["grim", "-o", "HEADLESS-1", sys.argv[1]], check=True)
    r,g,b=Image.open(sys.argv[1]).convert("RGB").getpixel((320,240))
    if abs(r-18)<=2 and abs(g-52)<=2:
        for phase in (80,92):
            if abs(b-phase)<=2: phases.add(phase)
    if len(phases)==2: break
    time.sleep(.025)
assert phases == {80,92}, ("Animated authorized-output fixture not visible", phases)
PY
grim -o HEADLESS-1 "$runtime/background.png"
/usr/bin/python3 - "$runtime/background.png" <<'PY'
from PIL import Image
import sys
r,g,b=Image.open(sys.argv[1]).convert("RGB").getpixel((320,240))
assert abs(r-18)<=12 and abs(g-52)<=12 and abs(b-86)<=12, (r,g,b)
PY
# This chooser policy exists ONLY in the disposable test session. Production
# still uses the desktop's real consent dialog and strict stream metadata.
cat > "$XDG_CONFIG_HOME/xdg-desktop-portal/portals.conf" <<'CONF'
[preferred]
default=wlr
org.freedesktop.impl.portal.ScreenCast=wlr
CONF
cat > "$XDG_CONFIG_HOME/xdg-desktop-portal-wlr/config" <<'CONF'
[screencast]
output_name=HEADLESS-1
chooser_type=none
max_fps=30
CONF
dbus-update-activation-environment WAYLAND_DISPLAY XDG_RUNTIME_DIR XDG_CURRENT_DESKTOP XDG_SESSION_TYPE XDG_CONFIG_HOME XDG_CACHE_HOME XDG_STATE_HOME XDG_DATA_HOME PIPEWIRE_RUNTIME_DIR PIPEWIRE_REMOTE
pipewire >"$runtime/pipewire.log" 2>&1 & pids+=("$!")
for _ in {1..100}; do [[ -S "$runtime/pipewire-0" ]] && break; sleep .1; done
[[ -S "$runtime/pipewire-0" ]]
wireplumber >"$runtime/wireplumber.log" 2>&1 & pids+=("$!")
# Start the actual backend with diagnostics captured. CI may select the
# explicitly pinned upstream build; local QA defaults to the distro binary.
backend="${SNAPVERE_QA_PORTAL_BACKEND:-}"
if [[ -z "$backend" ]]; then
  backend="$(dpkg-query -L xdg-desktop-portal-wlr | grep -E '/(libexec|lib)/xdg-desktop-portal-wlr$')"
fi
[[ "$backend" == /* && -x "$backend" ]]
echo "Testing portal backend: $backend"
"$backend" -l DEBUG -c "$XDG_CONFIG_HOME/xdg-desktop-portal-wlr/config" >"$runtime/portal-wlr.log" 2>&1 & backend_pid=$!; pids+=("$backend_pid")
backend_ready=0
for _ in {1..100}; do
  kill -0 "$backend_pid" || { cat "$runtime/portal-wlr.log"; exit 1; }
  if gdbus call --session --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus --method org.freedesktop.DBus.NameHasOwner org.freedesktop.impl.portal.desktop.wlr | grep -F '(true,)' >/dev/null; then
    backend_ready=1
    break
  fi
  sleep .1
done
[[ "$backend_ready" == 1 ]] || { echo "Wayland portal backend did not acquire its bus name"; exit 1; }
cc -Wall -Wextra -Werror -O2 -I"$root/apps/desktop/src-tauri/native" \
    "$root/tools/native/wayland_portal_probe.c" "$root/apps/desktop/src-tauri/native/linux_wayland.c" \
    -o "$runtime/portal-probe" $(pkg-config --cflags --libs gio-unix-2.0 gstreamer-app-1.0 gstreamer-video-1.0)
G_MESSAGES_DEBUG=all timeout 105 "$runtime/portal-probe" >"$runtime/probe.log" 2>&1 & probe=$!; pids+=("$probe")
for _ in {1..900}; do
  grep -q '^SEPARATE_OUTPUT_MARKER_ABSENT$' "$runtime/probe.log" && break
  kill -0 "$probe" 2>/dev/null || { cat "$runtime/probe.log"; exit 1; }
  sleep .1
done
grep -q '^SEPARATE_OUTPUT_MARKER_ABSENT$' "$runtime/probe.log"
# Both monotonic readings use Linux CLOCK_MONOTONIC on the same machine.
started="$(python3 -c 'import time; print(time.monotonic_ns()//1000)')"
swaymsg '[title="Snapvere QA baseline"] fullscreen disable'
swaymsg '[title="Snapvere QA marker"] fullscreen disable'
swaymsg '[title="Snapvere QA marker"] move container to output HEADLESS-1'
swaymsg 'focus output HEADLESS-1'
swaymsg '[title="Snapvere QA marker"] focus'
swaymsg '[title="Snapvere QA marker"] fullscreen enable'
# Independently prove that the moved native window actually reached the
# captured output. Do not use this screenshot as a portal test substitute.
visible=0
for _ in {1..20}; do
  grim -o HEADLESS-1 "$runtime/moved.png"
  if /usr/bin/python3 - "$runtime/moved.png" <<'PY'
from PIL import Image
import sys
r,g,b=Image.open(sys.argv[1]).convert("RGB").getpixel((320,240))
sys.exit(0 if r>220 and g<35 and b>220 else 1)
PY
  then visible=1; break; fi
  sleep .05
done
[[ "$visible" == 1 ]] || { echo "Moved marker not visible on captured output"; exit 1; }
echo "Native marker verified visible on captured output"
wait "$probe"
cat "$runtime/probe.log"
python3 - "$started" "$runtime/probe.log" <<'PY'
import sys
lines=open(sys.argv[2], encoding="utf-8").read().splitlines()
received=[int(s.split()[1]) for s in lines if s.startswith("SAME_OUTPUT_MARKER_PRESENT ")]
assert len(received)==1 and received[0]>=int(sys.argv[1])
assert "BASELINE_REPAINT_PHASES 2" in lines
assert "SUSTAINED_MARKER_SAMPLES 3" in lines
print(f"Native compositor move-to-PipeWire sample: {(received[0]-int(sys.argv[1]))/1000:.3f} ms")
print("Same-output exclusion is NOT supported by this tested path.")
PY
