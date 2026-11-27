#!/usr/bin/env python3
# Snapvere by Brendigo
"""Offline reference codec for exact-base binary deltas.

Never modifies or launches an installed app. Reconstructs only to a new
staging file. SHA-256 checks integrity, not publisher authentication.
A signed native applier and installation-specific rollback are separate gates.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import struct
import zlib

MAGIC = b"SVDELTA1"
BLOCK = 65536
MAX_BYTES = 512 * 1024 * 1024
MAX_HEADER = 4096
MAX_OPS = MAX_BYTES // BLOCK + 1
VERSION = re.compile(r"(?:0|[1-9][0-9]{0,5})\.(?:0|[1-9][0-9]{0,5})\.(?:0|[1-9][0-9]{0,5})")
DIGEST = re.compile(r"[0-9a-f]{64}")
TARGETS = {"windows-free", "windows-pro", "linux-free", "linux-pro"}


def exact(stream, size):
    value = stream.read(size)
    if len(value) != size:
        raise ValueError("Truncated delta")
    return value


def open_source(path):
    path = Path(path)
    before = path.lstat()
    if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or not 1 <= before.st_size <= MAX_BYTES:
        raise ValueError("Expected bounded regular single-link source")
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0))
    stream = os.fdopen(fd, "rb")
    try:
        current = os.fstat(fd)
        if (before.st_dev, before.st_ino, before.st_size) != (current.st_dev, current.st_ino, current.st_size):
            raise ValueError("Source identity changed")
        return stream
    except BaseException:
        stream.close()
        raise


def snapshot(stream):
    before = os.fstat(stream.fileno())
    stream.seek(0)
    digest = hashlib.file_digest(stream, "sha256").hexdigest()
    after = os.fstat(stream.fileno())
    if fingerprint(before) != fingerprint(after):
        raise ValueError("Source changed during hashing")
    stream.seek(0)
    return before, digest


def fingerprint(info):
    return info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns, info.st_nlink


def validate_header(h):
    fields = {"target", "from", "to", "base_size", "new_size", "base_sha256", "new_sha256"}
    if not isinstance(h, dict) or set(h) != fields or h["target"] not in TARGETS:
        raise ValueError("Invalid delta identity")
    for key in ("from", "to"):
        if not isinstance(h[key], str) or not VERSION.fullmatch(h[key]):
            raise ValueError("Invalid delta version")
    if tuple(map(int, h["from"].split("."))) >= tuple(map(int, h["to"].split("."))):
        raise ValueError("Delta must upgrade")
    for key in ("base_size", "new_size"):
        if type(h[key]) is not int or not 1 <= h[key] <= MAX_BYTES:
            raise ValueError("Invalid delta size")
    for key in ("base_sha256", "new_sha256"):
        if not isinstance(h[key], str) or not DIGEST.fullmatch(h[key]):
            raise ValueError("Invalid delta digest")
    return h


def read_header(stream):
    if exact(stream, len(MAGIC)) != MAGIC:
        raise ValueError("Invalid delta magic")
    length, = struct.unpack(">I", exact(stream, 4))
    if not 1 <= length <= MAX_HEADER:
        raise ValueError("Invalid header size")
    return validate_header(json.loads(exact(stream, length)))


def stage(path, writer):
    """Exclusive output, never overwrite a file or delete an unknown path."""
    path = Path(path)
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0)
    fd = os.open(path, flags, 0o600)
    created = os.fstat(fd)
    try:
        with os.fdopen(fd, "wb") as stream:
            result = writer(stream)
            stream.flush()
            os.fsync(stream.fileno())
        return result
    except BaseException:
        # Only clean up the exact inode we created. Parent must be trusted.
        current = path.lstat() if path.exists() else None
        if current and (current.st_dev, current.st_ino) == (created.st_dev, created.st_ino):
            path.unlink()
        raise


def build(base, new, output, target, from_version, to_version):
    with open_source(base) as old, open_source(new) as candidate:
        old_info, old_hash = snapshot(old)
        new_info, new_hash = snapshot(candidate)
        if old_hash == new_hash:
            raise ValueError("Identical binaries do not require a delta")
        h = validate_header(dict(target=target, **{"from": from_version, "to": to_version},
                                 base_size=old_info.st_size, new_size=new_info.st_size,
                                 base_sha256=old_hash, new_sha256=new_hash))
        index = {}
        for offset in range(0, old_info.st_size, BLOCK):
            chunk = old.read(BLOCK)
            index.setdefault(hashlib.sha256(chunk).digest(), offset)
        encoded = json.dumps(h, sort_keys=True, separators=(",", ":")).encode()
        def write(out):
            out.write(MAGIC + struct.pack(">I", len(encoded)) + encoded)
            actual = hashlib.sha256()
            copied = 0
            remaining = new_info.st_size
            while remaining:
                chunk = exact(candidate, min(BLOCK, remaining))
                remaining -= len(chunk)
                actual.update(chunk)
                offset = index.get(hashlib.sha256(chunk).digest())
                if offset is not None:
                    old.seek(offset)
                    if old.read(len(chunk)) == chunk:
                        out.write(b"C" + struct.pack(">QI", offset, len(chunk)))
                        copied += len(chunk)
                        continue
                compressed = zlib.compress(chunk, 9)
                if len(compressed) < len(chunk):
                    out.write(b"Z" + struct.pack(">II", len(chunk), len(compressed)) + compressed)
                else:
                    out.write(b"L" + struct.pack(">I", len(chunk)) + chunk)
            out.write(b"E")
            if candidate.read(1) or actual.hexdigest() != new_hash:
                raise ValueError("Candidate changed during generation")
            if fingerprint(os.fstat(old.fileno())) != fingerprint(old_info) or fingerprint(os.fstat(candidate.fileno())) != fingerprint(new_info):
                raise ValueError("Input changed during generation")
            if not copied or out.tell() >= new_info.st_size or out.tell() > MAX_BYTES:
                raise ValueError("No useful incremental update; full binaries are forbidden")
            return {"copied_bytes": copied, "patch_bytes": out.tell(), "new_bytes": new_info.st_size, **h}
        return stage(output, write)


def reconstruct(base, patch, output, target, from_version, to_version):
    with open_source(base) as old, open_source(patch) as delta:
        patch_info = os.fstat(delta.fileno())
        h = read_header(delta)
        if (h["target"], h["from"], h["to"]) != (target, from_version, to_version):
            raise ValueError("Wrong edition, platform or version")
        old_info, old_hash = snapshot(old)
        if old_info.st_size != h["base_size"] or old_hash != h["base_sha256"]:
            raise ValueError("Wrong base binary")
        def write(out):
            digest = hashlib.sha256()
            remaining = h["new_size"]
            copied = 0
            ops = 0
            while remaining:
                ops += 1
                if ops > MAX_OPS:
                    raise ValueError("Too many delta operations")
                op = exact(delta, 1)
                expected = min(BLOCK, remaining)
                if op == b"C":
                    offset, size = struct.unpack(">QI", exact(delta, 12))
                    if size != expected or offset % BLOCK or offset + size > h["base_size"]:
                        raise ValueError("Invalid copy range")
                    old.seek(offset)
                    data = exact(old, size)
                    copied += size
                elif op == b"L":
                    size, = struct.unpack(">I", exact(delta, 4))
                    if size != expected:
                        raise ValueError("Invalid literal length")
                    data = exact(delta, size)
                elif op == b"Z":
                    size, packed = struct.unpack(">II", exact(delta, 8))
                    if size != expected or not 1 <= packed < size:
                        raise ValueError("Invalid compressed block")
                    decoder = zlib.decompressobj()
                    data = decoder.decompress(exact(delta, packed), size + 1)
                    if len(data) != size or not decoder.eof or decoder.unused_data or decoder.unconsumed_tail:
                        raise ValueError("Invalid compressed payload")
                else:
                    raise ValueError("Unknown delta operation")
                out.write(data)
                digest.update(data)
                remaining -= len(data)
            if exact(delta, 1) != b"E" or delta.read(1) or not copied or patch_info.st_size >= h["new_size"]:
                raise ValueError("Invalid incremental delta termination")
            if digest.hexdigest() != h["new_sha256"]:
                raise ValueError("Reconstructed binary digest mismatch")
            if fingerprint(os.fstat(old.fileno())) != fingerprint(old_info) or fingerprint(os.fstat(delta.fileno())) != fingerprint(patch_info):
                raise ValueError("Input changed during reconstruction")
            return h
        return stage(output, write)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=("build", "reconstruct"))
    parser.add_argument("--base", type=Path, required=True)
    parser.add_argument("--input", type=Path, required=True, help="New binary (build) or delta (reconstruct)")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--target", choices=sorted(TARGETS), required=True)
    parser.add_argument("--from-version", required=True)
    parser.add_argument("--to-version", required=True)
    args = parser.parse_args()
    action = build if args.operation == "build" else reconstruct
    print(json.dumps(action(args.base, args.input, args.output, args.target, args.from_version, args.to_version), indent=2))


if __name__ == "__main__":
    main()
