#!/usr/bin/env python3
# Snapvere by Brendigo
"""Verify release ZIPs contain exactly the intended audited browser files."""
import argparse
from pathlib import Path
from zipfile import ZipFile

from build_browser_extensions import BROWSERS, ROOT, VERSION, expected


def verify(archive_dir: Path) -> None:
    for browser in BROWSERS:
        filename = archive_dir / f"Snapvere-{browser}-extension-{VERSION}.zip"
        if not filename.is_file():
            raise AssertionError(f"Missing ZIP: {filename}")
        assets = expected(browser)
        with ZipFile(filename) as archive:
            names = archive.namelist()
            if len(names) != len(set(names)):
                raise AssertionError(f"{browser}: duplicate ZIP entries")
            if set(names) != set(assets):
                raise AssertionError(f"{browser}: unexpected, missing or unsafe ZIP entries")
            for info in archive.infolist():
                if info.file_size != len(assets[info.filename]):
                    raise AssertionError(f"{browser}: size mismatch {info.filename}")
                if info.file_size > 200_000:
                    raise AssertionError(f"{browser}: unexpected large source file")
                if archive.read(info) != assets[info.filename]:
                    raise AssertionError(f"{browser}: ZIP bytes differ {info.filename}")
                if info.date_time != (1980, 1, 1, 0, 0, 0):
                    raise AssertionError(f"{browser}: non-reproducible ZIP timestamp")
        print(f"{browser}: audited {len(names)} ZIP entries, canonical SHA source, no traversal")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--dir", type=Path, required=True)
    verify(p.parse_args().dir)
