#!/usr/bin/env python3
# Snapvere by Brendigo
"""POSIX isolated-workspace reference transaction for a signed binary delta.

Not an installed application updater. Only operates on an owner-private,
explicitly initialized test workspace, with fixed filenames, no elevation,
network access, package-manager calls or executable launch. The operator
must exclude noncooperating writers and protect the parent directory.
"""
import contextlib
import hashlib
import json
import os
from pathlib import Path
import stat

from delta_patch import open_source, snapshot, fingerprint, stage, validate_header
from signed_delta import verify_and_stage, bounded, canonical

if os.name == "posix":
    import fcntl

MARKER = b"snapvere-offline-update-workspace-v1\n"
LIVE = "installed.bin"
TRANSACTION = ".update-transaction"
JOURNAL = "journal.json"
BACKUP = "previous.bin"
CANDIDATE = "candidate.bin"


def private_dir(path):
    if os.name != "posix":
        raise RuntimeError("Reference transaction requires POSIX")
    path = Path(path).absolute()
    info = path.lstat()
    if (path.resolve(strict=True) != path or not stat.S_ISDIR(info.st_mode)
            or info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o700):
        raise ValueError("Expected owner-private real workspace directory")
    return path


def sync_dir(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def initialize(path):
    """Initialize a new isolated workspace; never adopt an existing directory."""
    if os.name != "posix":
        raise RuntimeError("Reference transaction requires POSIX")
    path = Path(path).absolute()
    if path.parent.resolve(strict=True) != path.parent:
        raise ValueError("Workspace parent must be canonical")
    path.mkdir(mode=0o700)
    stage(path / "workspace.marker", lambda out: out.write(MARKER))
    sync_dir(path)
    sync_dir(path.parent)
    return path


@contextlib.contextmanager
def locked(path):
    root = private_dir(path)
    if bounded(root / "workspace.marker", len(MARKER)) != MARKER:
        raise ValueError("Not an isolated update workspace")
    fd = os.open(root / "lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o600:
            raise ValueError("Unsafe workspace lock")
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield root
    finally:
        os.close(fd)


def identity(path):
    with open_source(path) as source:
        info, digest = snapshot(source)
        return info, digest


def matches(path, size, digest):
    try:
        info, actual = identity(path)
    except FileNotFoundError:
        return False
    return info.st_size == size and actual == digest


def copy_exact(source, output, size, digest):
    with open_source(source) as stream:
        before, actual = snapshot(stream)
        if before.st_size != size or actual != digest:
            raise ValueError("Source no longer matches authenticated identity")

        def write(out):
            copied = hashlib.sha256()
            remaining = size
            while remaining:
                chunk = stream.read(min(65536, remaining))
                if not chunk:
                    raise ValueError("Source truncated")
                out.write(chunk)
                copied.update(chunk)
                remaining -= len(chunk)
            if stream.read(1) or copied.hexdigest() != digest or fingerprint(before) != fingerprint(os.fstat(stream.fileno())):
                raise ValueError("Source changed during backup")
        stage(output, write)


def prepare(workspace, patch, descriptor, signature, public_key, pin, target, from_version, to_version):
    """Durably prepare signed candidate and independent previous-version copy."""
    with locked(workspace) as root:
        live = root / LIVE
        before, _ = identity(live)
        mode = stat.S_IMODE(before.st_mode)
        if mode not in (0o600, 0o700):
            raise ValueError("Unsupported workspace binary mode")
        tx = root / TRANSACTION
        tx.mkdir(mode=0o700)  # Existing interrupted work is preserved.
        sync_dir(root)
        h = verify_and_stage(live, patch, descriptor, signature, public_key, pin,
                             tx / CANDIDATE, target, from_version, to_version)
        copy_exact(live, tx / BACKUP, h["base_size"], h["base_sha256"])
        os.chmod(tx / CANDIDATE, mode)
        os.chmod(tx / BACKUP, mode)
        for name in (CANDIDATE, BACKUP):
            with open_source(tx / name) as f:
                os.fsync(f.fileno())
        receipt = {"schema": "snapvere-workspace-transaction-v1", "delta": h, "mode": mode}
        stage(tx / JOURNAL, lambda out: out.write(canonical(receipt)))
        sync_dir(tx)
        sync_dir(root)
        return h


def read_transaction(root):
    tx = private_dir(root / TRANSACTION)
    raw = bounded(tx / JOURNAL, 8192)
    receipt = json.loads(raw)
    if (not isinstance(receipt, dict) or set(receipt) != {"schema", "delta", "mode"}
            or receipt["schema"] != "snapvere-workspace-transaction-v1"
            or receipt["mode"] not in (0o600, 0o700) or canonical(receipt) != raw):
        raise ValueError("Invalid transaction journal")
    return tx, validate_header(receipt["delta"]), receipt["mode"]


def classify(root, tx, h):
    # The receipt is trusted local workspace state, not a publisher signature.
    # Fail closed on missing/corrupt backup or an unexpected live binary.
    if not matches(tx / BACKUP, h["base_size"], h["base_sha256"]):
        raise ValueError("Previous-version backup unavailable or corrupted")
    old = matches(root / LIVE, h["base_size"], h["base_sha256"])
    new = matches(root / LIVE, h["new_size"], h["new_sha256"])
    candidate_exists = os.path.lexists(tx / CANDIDATE)
    if old and candidate_exists and matches(tx / CANDIDATE, h["new_size"], h["new_sha256"]):
        return "prepared"
    if new and not candidate_exists:
        return "applied"
    if old and not candidate_exists:
        return "rolled-back"
    raise ValueError("Unexpected transaction state; preserve all files")


def status(workspace):
    with locked(workspace) as root:
        if not os.path.lexists(root / TRANSACTION):
            return "idle"
        tx, h, _ = read_transaction(root)
        return classify(root, tx, h)


def apply(workspace):
    """Atomic replacement in the isolated workspace; backup is retained."""
    with locked(workspace) as root:
        tx, h, _ = read_transaction(root)
        state = classify(root, tx, h)
        if state == "applied":
            return state
        if state != "prepared":
            raise ValueError("Transaction not prepared")
        os.replace(tx / CANDIDATE, root / LIVE)
        sync_dir(tx)
        sync_dir(root)
        return classify(root, tx, h)


def rollback(workspace):
    """Restore a verified copy, never consume the independent backup."""
    with locked(workspace) as root:
        tx, h, mode = read_transaction(root)
        state = classify(root, tx, h)
        if state == "rolled-back":
            return state
        if state != "applied":
            raise ValueError("Only an applied transaction may be rolled back")
        restore = tx / "restore.bin"
        if os.path.lexists(restore):
            if not matches(restore, h["base_size"], h["base_sha256"]):
                raise ValueError("Unexpected interrupted rollback file")
        else:
            copy_exact(tx / BACKUP, restore, h["base_size"], h["base_sha256"])
        os.chmod(restore, mode)
        with open_source(restore) as f:
            os.fsync(f.fileno())
        os.replace(restore, root / LIVE)
        sync_dir(tx)
        sync_dir(root)
        return classify(root, tx, h)
