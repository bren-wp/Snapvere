#!/usr/bin/env python3
# Snapvere by Brendigo
"""Decode actual recorder outputs and check opaque mask interior on every frame."""
import subprocess
import sys

WIDTH, HEIGHT = 128, 96
FRAME = WIDTH * HEIGHT * 3
for path in sys.argv[1:]:
    decoded = subprocess.check_output([
        "ffmpeg", "-v", "error", "-xerror", "-i", path,
        "-map", "0:v:0", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"
    ])
    assert len(decoded) >= FRAME and len(decoded) % FRAME == 0, path
    for offset in range(0, len(decoded), FRAME):
        frame = decoded[offset:offset + FRAME]
        # Lossy H.264 can ring at sharp edges. Inspect the interior and
        # separately ensure the image outside the mask is not blank.
        for y in range(32, 64):
            for x in range(40, 88):
                i = (y * WIDTH + x) * 3
                assert max(frame[i:i + 3]) <= 24, (path, offset, x, y)
        assert min(frame[(12 * WIDTH + 110) * 3:(12 * WIDTH + 110) * 3 + 3]) >= 180, path
    print(f"{path}: decoded {len(decoded) // FRAME} frames; opaque mask interior verified")
