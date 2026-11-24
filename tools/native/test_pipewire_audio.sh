#!/usr/bin/env bash
# Snapvere by Brendigo
# Real isolated PipeWire graph; never select the host's physical audio devices.
set -euo pipefail
if [[ "${SNAPVERE_PIPEWIRE_ISOLATED:-}" != 1 ]]; then
    runtime="$(mktemp -d)"
    trap 'rm -rf -- "$runtime"' EXIT
    chmod 700 "$runtime"
    mkdir -p "$runtime/config" "$runtime/cache" "$runtime/state"
    env XDG_RUNTIME_DIR="$runtime" PIPEWIRE_RUNTIME_DIR="$runtime" \
        XDG_CONFIG_HOME="$runtime/config" XDG_CACHE_HOME="$runtime/cache" \
        XDG_STATE_HOME="$runtime/state" PIPEWIRE_REMOTE=pipewire-0 \
        PULSE_SERVER="unix:$runtime/pulse/native" SNAPVERE_PIPEWIRE_ISOLATED=1 \
        dbus-run-session -- bash "$0"
    exit
fi

root="$(cd "$(dirname "$0")/../.." && pwd)"
runtime="$XDG_RUNTIME_DIR"
[[ -d "$runtime" && "$PIPEWIRE_RUNTIME_DIR" == "$runtime" ]]
pids=()
cleanup() {
    for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
    for pid in "${pids[@]}"; do wait "$pid" 2>/dev/null || true; done
}
trap cleanup EXIT
cc -Wall -Wextra -Werror -O2 "$root/tools/native/pipewire_capture_probe.c" \
    -o "$runtime/audio-probe" $(pkg-config --cflags --libs gstreamer-app-1.0)
pipewire >"$runtime/pipewire.log" 2>&1 & pids+=("$!")
for attempt in {1..50}; do
    [[ -S "$runtime/pipewire-0" ]] && break
    sleep .1
done
[[ -S "$runtime/pipewire-0" ]]
wireplumber >"$runtime/wireplumber.log" 2>&1 & pids+=("$!")
pipewire-pulse >"$runtime/pulse.log" 2>&1 & pids+=("$!")
for attempt in {1..50}; do
    pactl info >/dev/null 2>&1 && break
    sleep .1
done
pactl info
pactl load-module module-null-sink sink_name=snapvere_ci_sink rate=48000 channels=2
pactl load-module module-remap-source master=snapvere_ci_sink.monitor source_name=snapvere_ci_mic
pactl set-sink-mute snapvere_ci_sink 0
pactl set-sink-volume snapvere_ci_sink 100%
pactl set-source-mute snapvere_ci_mic 0
pactl set-source-volume snapvere_ci_mic 100%

# Resolve exact serials from the private graph, never guess a default device.
serials=""
for attempt in {1..50}; do
    serials="$(pw-dump | python3 -c '
import json, sys
nodes = [x.get("info", {}).get("props", {}) for x in json.load(sys.stdin)
         if x.get("type") == "PipeWire:Interface:Node"]
def serial(name, media_class):
    matches = [x["object.serial"] for x in nodes
               if x.get("node.name") == name and x.get("media.class") == media_class
               and "object.serial" in x]
    return str(matches[0]) if len(matches) == 1 else ""
a, b = serial("snapvere_ci_sink", "Audio/Sink"), serial("snapvere_ci_mic", "Audio/Source")
if a and b: print(a, b)
')"
    [[ -n "$serials" ]] && break
    sleep .1
done
[[ -n "$serials" ]]
read -r sink_serial source_serial <<<"$serials"

# Only a generated tone is played, to the virtual sink in this private server.
gst-launch-1.0 -q audiotestsrc is-live=true wave=sine freq=440 volume=0.5 \
    ! audioconvert ! audioresample ! pulsesink device=snapvere_ci_sink \
    >"$runtime/tone.log" 2>&1 & pids+=("$!")
timeout 15s "$runtime/audio-probe" "$sink_serial" monitor
timeout 15s "$runtime/audio-probe" "$source_serial" source
# A nonexistent target must never fall back to the audible default node.
set +e
timeout 15s "$runtime/audio-probe" 4294967295 monitor
status=$?
set -e
[[ "$status" == 1 ]]
echo "PipeWire audio source, sink monitor and fail-closed missing target checks passed"
