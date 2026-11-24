#!/usr/bin/env python3
# Snapvere by Brendigo
"""Compare actual preview packet markers and recorder PTS with decoded media."""
import csv
import json
import statistics
import subprocess
import sys
from decimal import Decimal

WIDTH, HEIGHT = 128, 96
FRAME = WIDTH * HEIGHT * 3
with open(sys.argv[1], encoding="utf-8", newline="") as stream:
    rows = [{key: int(value) for key, value in row.items()} for row in csv.DictReader(stream)]
assert len(rows) == 12
assert [row["frame_id"] for row in rows] == list(range(1, 13))
assert [row["marker"] for row in rows] == list(range(1, 13))
assert all(row["revision"] == 1 for row in rows)
assert all(0 <= row["encoder_to_sample_us"] <= row["capture_to_sample_us"] for row in rows)
for path in sys.argv[2:]:
    probe = json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-select_streams", "v:0", "-show_frames",
        "-show_entries", "frame=best_effort_timestamp_time", "-of", "json", path
    ]))
    timestamps = [Decimal(frame["best_effort_timestamp_time"]) for frame in probe["frames"]]
    raw = subprocess.check_output([
        "ffmpeg", "-v", "error", "-xerror", "-i", path, "-map", "0:v:0",
        "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"
    ])
    assert len(timestamps) == len(rows) and len(raw) == FRAME * len(rows), path
    errors = []
    for index, row in enumerate(rows):
        frame = raw[index * FRAME:(index + 1) * FRAME]
        marker = 0
        for bit in range(4):
            pos = (12 * WIDTH + 16 + bit * 24) * 3
            sample = frame[pos:pos + 3]
            assert max(sample) <= 32 or min(sample) >= 223, (path, index, bit, sample)
            marker |= int(min(sample) >= 223) << bit
        assert marker == row["marker"], (path, index, marker, row["marker"])
        for y in range(32, 64):
            for x in range(40, 88):
                pos = (y * WIDTH + x) * 3
                assert max(frame[pos:pos + 3]) <= 24, (path, index, x, y)
        pts = Decimal(row["pts_100ns"]) / Decimal(10_000_000)
        error = abs(timestamps[index] - timestamps[0] - pts)
        errors.append(error)
        assert error <= Decimal("0.01"), (path, index, error)
    print(f"{path}: {len(rows)} decoded frames, marker/mask checks passed; "
          f"max relative PTS error {max(errors) * 1000:.3f} ms; "
          f"initial decoded PTS {timestamps[0]} s")
for key in ["capture_to_sample_us", "encoder_to_sample_us"]:
    samples = [row[key] for row in rows]
    print(f"Synthetic recorder fixture {key}: median {statistics.median(samples):.1f} us, "
          f"max {max(samples)} us")
