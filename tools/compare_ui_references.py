#!/usr/bin/env python3
"""SNAPVERE UI reference audit. Never accepts screenshots as approved baselines.

Inventory mode reports coverage gaps; compare mode requires an external approved
reference PNG for every actual PNG. Results record exact and tolerant pixel deltas.
"""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageChops, ImageStat

# Application/window-state coverage, not the separately deployed marketing site.
REQUIRED = (
    "home.png", "home-clipboard-import-error.png", "home-compact.png", "home-hover.png", "home-focus.png",
    "home-light.png", "home-hover-light.png",
    "settings.png", "settings-hotkeys.png", "settings-capture.png",
    "settings-recording.png", "settings-recording-gif-disabled.png",
    "settings-save.png", "settings-privacy.png", "settings-about.png",
    "settings-light.png", "settings-theme-switched-light.png",
    "settings-hotkeys-light.png", "settings-capture-light.png",
    "settings-recording-light.png", "settings-save-light.png",
    "settings-privacy-light.png", "settings-about-light.png",
    "editor.png", "editor-light.png", "capture-overlay.png",
    "recbar-palette.png", "recbar-stop-error.png",
)
# Native Window/WebView2, gallery/player, and non-default control states are
# intentionally NOT certified by this headless Chromium screenshot harness.
NATIVE_ONLY = (
    "recbar-recording", "recbar-paused", "recbar-error", "recbar-finishing",
    "recdraw", "recframe", "gallery-populated", "viewer-image", "viewer-video",
    "save-as-dialog", "capture-cancel-dialog", "settings-light",
    "home-hover-focus-disabled", "editor-active-hover-focus",
)


def compare(actual: Path, reference: Path, output: Path, threshold: int):
    with Image.open(actual) as a, Image.open(reference) as r:
        a = a.convert("RGB")
        r = r.convert("RGB")
        row = {"file": actual.name, "actual_size": list(a.size), "reference_size": list(r.size)}
        if a.size != r.size:
            row["status"] = "dimension_mismatch"
            return row
        delta = ImageChops.difference(a, r)
        pixels = a.width * a.height
        exact = tolerant = 0
        for rgb in delta.getdata():
            value = max(rgb)
            exact += value > 0
            tolerant += value > threshold
        row.update(
            changed_pixels=exact,
            changed_percent=round(100 * exact / pixels, 4),
            significant_pixels=tolerant,
            significant_percent=round(100 * tolerant / pixels, 4),
            mean_rgb_error=round(sum(ImageStat.Stat(delta).mean) / 3, 4),
            status="match" if exact == 0 else "diff",
        )
        output.mkdir(parents=True, exist_ok=True)
        delta.save(output / (actual.stem + "-diff.png"))
        return row


def audit(actual_dir: Path, reference_dir: Path | None, report_dir: Path,
          threshold: int, inventory_only: bool):
    actual_files = sorted(p for p in actual_dir.glob("*.png") if p.is_file())
    found = {p.name for p in actual_files}
    missing = sorted(set(REQUIRED) - found)
    result = {
        "project": "SNAPVERE Tauri/Rust Windows",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "mode": "inventory" if inventory_only else "reference-comparison",
        "threshold": threshold,
        "actual_dir": str(actual_dir),
        "reference_dir": str(reference_dir) if reference_dir else None,
        "present": sorted(found),
        "missing_required_previews": missing,
        "native_windows_unverified": list(NATIVE_ONLY),
        "comparisons": [],
        "exact_reference_match_for_supplied_previews": False,
        "native_windows_pixel_perfect_accepted": False,
        "warning": "Chromium previews with stubbed Tauri IPC are NOT native Windows hardware QA.",
    }
    if not inventory_only:
        assert reference_dir is not None
        if actual_dir.resolve() == reference_dir.resolve():
            raise ValueError("Approved baseline directory must differ from captured screenshots")
        for actual in actual_files:
            reference = reference_dir / actual.name
            if not reference.is_file():
                result["comparisons"].append({"file": actual.name, "status": "missing_approved_reference"})
                continue
            result["comparisons"].append(compare(actual, reference, report_dir / "diffs", threshold))
        # A green result requires complete capture coverage AND exact 0-pixel
        # deviation from externally approved baseline images.
        result["exact_reference_match_for_supplied_previews"] = bool(
            not missing and actual_files and
            all(row["status"] == "match" for row in result["comparisons"])
        )
    report_dir.mkdir(parents=True, exist_ok=True)
    (report_dir / "ui-reference-report.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--actual-dir", type=Path, default=Path("docs/screenshots"))
    parser.add_argument("--reference-dir", type=Path, help="Approved user-provided PNG baselines")
    parser.add_argument("--report-dir", type=Path, default=Path("docs/visual-audit"))
    parser.add_argument("--threshold", type=int, default=16)
    parser.add_argument("--inventory", action="store_true")
    args = parser.parse_args()
    if not 0 <= args.threshold <= 255:
        parser.error("--threshold must be from 0 to 255")
    if not args.inventory and args.reference_dir is None:
        parser.error("--reference-dir is required for comparisons; use --inventory for preview coverage")
    result = audit(args.actual_dir, args.reference_dir, args.report_dir,
                   args.threshold, args.inventory)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    if result["missing_required_previews"]:
        return 2
    if args.inventory:
        return 0  # inventory is never a pixel-perfect acceptance certificate
    return 0 if result["exact_reference_match_for_supplied_previews"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
