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
    local status=$?
    trap - EXIT
    if [[ "$status" != 0 ]]; then
        for file in "$runtime"/*.log; do
            [[ ! -f "$file" ]] || { echo "=== ${file##*/} ==="; tail -60 "$file"; }
        done
    fi
    for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
    for pid in "${pids[@]}"; do wait "$pid" 2>/dev/null || true; done
    exit "$status"
}
trap cleanup EXIT
cc -Wall -Wextra -Werror -O2 -I"$root/apps/desktop/src-tauri/native" "$root/tools/native/pipewire_capture_probe.c" \
    "$root/apps/desktop/src-tauri/native/linux_mp4.c" \
    -o "$runtime/audio-probe" $(pkg-config --cflags --libs gstreamer-app-1.0)
cc -Wall -Wextra -Werror -O2 -I"$root/apps/desktop/src-tauri/native" "$root/tools/native/mixer_probe.c" \
    "$root/apps/desktop/src-tauri/native/linux_audio.c" \
    "$root/apps/desktop/src-tauri/native/linux_audio_identity.c" \
    -o "$runtime/mixer-probe" $(pkg-config --cflags --libs gstreamer-app-1.0 libpipewire-0.3)
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
mic_module="$(pactl load-module module-remap-source master=snapvere_ci_sink.monitor source_name=snapvere_ci_mic)"
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

# Encode actual PCM from each selected virtual node into AAC + H.264 MP4.
# The probe pauses for 1.5 seconds, then resumes the same explicit target.
for kind in source monitor; do
    serial="$source_serial"
    [[ "$kind" != monitor ]] || serial="$sink_serial"
    output="$runtime/$kind.mp4"
    timeout 25s "$runtime/audio-probe" "$serial" "$kind" "$output"
    test "$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of csv=p=0 "$output")" = aac
    test "$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "$output")" = h264
    ffmpeg -v error -xerror -i "$output" -map 0:v:0 -map 0:a:0 -f null -
    ffprobe -v error -show_streams -of json "$output" | python3 -c '
import json, sys
streams = json.load(sys.stdin)["streams"]
a = next(x for x in streams if x["codec_type"] == "audio")
v = next(x for x in streams if x["codec_type"] == "video")
assert a["sample_rate"] == "48000" and a["channels"] == 2, a
ad, vd = float(a["duration"]), float(v["duration"])
assert 0.9 <= ad <= 1.5 and 0.9 <= vd <= 1.5, (ad, vd)
assert abs(ad - vd) <= 0.25, (ad, vd)
print("AAC/H264 decoded, pause excluded, duration skew:", abs(ad - vd))
'
done

# The actual recorder mixer must receive both requested sources.
G_MESSAGES_DEBUG=all timeout 10s "$runtime/mixer-probe" "$source_serial" "$sink_serial"

# Remove the selected virtual microphone during the explicit pause.
# The session must not substitute another available node or publish a partial MP4.
lost="$runtime/lost.mp4"
timeout 25s "$runtime/audio-probe" "$source_serial" source "$lost" \
    >"$runtime/lost.log" 2>&1 & loss_pid=$!; pids+=("$loss_pid")
for attempt in {1..80}; do
    grep -q 'PAUSED:' "$runtime/lost.log" && break
    sleep .05
done
grep -q 'PAUSED:' "$runtime/lost.log"
pactl unload-module "$mic_module"
set +e
wait "$loss_pid"
status=$?
set -e
cat "$runtime/lost.log"
[[ "$status" == 1 && ! -e "$lost" ]]
echo "Selected-device removal rejected without publishing incomplete MP4"
set +e
timeout 10s "$runtime/mixer-probe" "$source_serial" "$sink_serial"
status=$?
set -e
[[ "$status" == 1 ]]
echo "Mixer refuses a missing selected source"
