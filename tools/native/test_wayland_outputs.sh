#!/usr/bin/env bash
# Snapvere by Brendigo
# Real wlroots output protocol events; no mock portal or screen-recording claim.
set -euo pipefail
if [[ "${SNAPVERE_WLR_SESSION:-}" != 1 ]]; then
  exec dbus-run-session -- env SNAPVERE_WLR_SESSION=1 bash "$0"
fi
root="$(cd "$(dirname "$0")/../.." && pwd)"
runtime="$(mktemp -d)"
chmod 700 "$runtime"
export XDG_RUNTIME_DIR="$runtime"
export WLR_BACKENDS=headless WLR_HEADLESS_OUTPUTS=2 WLR_RENDERER=pixman
export WLR_LIBINPUT_NO_DEVICES=1 XDG_SESSION_TYPE=wayland
unset DISPLAY WAYLAND_DISPLAY SWAYSOCK
pid=""
cleanup() {
  if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi
  rm -rf -- "$runtime"
}
trap cleanup EXIT
cat > "$runtime/sway.conf" <<'CONF'
output HEADLESS-1 mode --custom 2400x1350 position -1920 0 scale 1.25
output HEADLESS-2 mode --custom 2880x1620 position 0 0 scale 1.5
CONF
sway --config "$runtime/sway.conf" >"$runtime/sway.log" 2>&1 &
pid=$!
for _ in $(seq 1 100); do
  kill -0 "$pid" || { cat "$runtime/sway.log"; exit 1; }
  shopt -s nullglob
  sockets=("$runtime"/wayland-*)
  for socket in "${sockets[@]}"; do
    if [[ -S "$socket" ]]; then export WAYLAND_DISPLAY="${socket##*/}"; break; fi
  done
  [[ -n "${WAYLAND_DISPLAY:-}" ]] && break
  sleep 0.1
done
[[ -n "${WAYLAND_DISPLAY:-}" ]] || { cat "$runtime/sway.log"; exit 1; }
sleep 1
cd "$root/apps/desktop/src-tauri"
cargo test --locked --features linux-native-media native_wlroots_mixed_dpi_inventory -- --ignored
cargo test --locked --features linux-native-media,pro native_wlroots_mixed_dpi_inventory -- --ignored
