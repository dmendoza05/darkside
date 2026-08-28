#!/usr/bin/env python3
"""Validate and (in CI) pick the next Chrome extension version.

Chrome versions are 1–4 integers from 0 to 65535, with no leading zeros.
Each new release must be greater than every version already published.
https://developer.chrome.com/docs/extensions/reference/manifest/version
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

MAX = 65535


def parse_version(text: str) -> tuple[int, ...]:
    if not isinstance(text, str) or not text:
        raise ValueError("version must be a non-empty string")
    parts = text.split(".")
    if not 1 <= len(parts) <= 4:
        raise ValueError("version must be 1 to 4 dot-separated integers")
    numbers = []
    for part in parts:
        if not part.isascii() or not part.isdigit():
            raise ValueError(f"invalid version component {part!r}")
        if len(part) > 1 and part.startswith("0"):
            raise ValueError(f"leading zeros are not allowed: {part!r}")
        number = int(part)
        if number > MAX:
            raise ValueError(f"{number} is above {MAX}")
        numbers.append(number)
    return tuple(numbers)


def format_version(parts: tuple[int, ...]) -> str:
    return ".".join(str(n) for n in parts)


def pad(parts: tuple[int, ...]) -> tuple[int, ...]:
    return parts + (0,) * (4 - len(parts))


def increment(parts: tuple[int, ...]) -> tuple[int, ...]:
    """Add one to the last number, carrying over past 65535. Short versions become x.y.z."""
    values = list(parts)
    if len(values) < 3:
        values.extend([0] * (3 - len(values)))
    for i in range(len(values) - 1, -1, -1):
        if values[i] < MAX:
            values[i] += 1
            return tuple(values)
        values[i] = 0
    raise ValueError("cannot increment past 65535.65535.65535.65535")


def read_manifest(path: Path) -> tuple[dict, tuple[int, ...]]:
    manifest = json.loads(path.read_text())
    raw = manifest.get("version")
    try:
        return manifest, parse_version(raw)
    except ValueError as exc:
        raise ValueError(f"manifest.json version {raw!r} is not valid: {exc}") from exc


def published_versions() -> list[tuple[int, ...]]:
    result = subprocess.run(
        ["gh", "release", "list", "--limit", "1000", "--json", "tagName"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(
            "could not list GitHub Releases:\n" + (result.stderr.strip() or result.stdout.strip())
        )
    versions = []
    for item in json.loads(result.stdout or "[]"):
        tag = item.get("tagName", "").removeprefix("v")
        try:
            versions.append(parse_version(tag))
        except ValueError:
            continue
    return versions


def next_free_version(current: tuple[int, ...], published: list[tuple[int, ...]]) -> tuple[int, ...]:
    taken = {pad(v) for v in published}
    chosen = current
    if published:
        latest = max(published, key=pad)
        if pad(chosen) <= pad(latest):
            chosen = increment(latest)
    while pad(chosen) in taken:
        chosen = increment(chosen)
    return chosen


def write_github_output(*, version: str, tag: str, bumped: bool) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    if not path:
        return
    with open(path, "a") as handle:
        handle.write(f"version={version}\n")
        handle.write(f"tag={tag}\n")
        handle.write(f"bumped={'true' if bumped else 'false'}\n")


def cmd_validate(path: Path) -> None:
    _, parts = read_manifest(path)
    print(format_version(parts))


def cmd_bump(path: Path) -> None:
    manifest, current = read_manifest(path)
    chosen = next_free_version(current, published_versions())
    version = format_version(chosen)
    bumped = pad(chosen) != pad(current) or version != format_version(current)
    if bumped:
        manifest["version"] = version
        path.write_text(json.dumps(manifest, indent=2) + "\n")
        print(f"Bumped version {format_version(current)} -> {version}", file=sys.stderr)
    write_github_output(version=version, tag=f"v{version}", bumped=bumped)
    print(version)


def main(argv: list[str]) -> int:
    if len(argv) != 3 or argv[1] not in {"validate", "bump"}:
        print("usage: chrome_version.py validate|bump <manifest.json>", file=sys.stderr)
        return 2
    try:
        path = Path(argv[2])
        if argv[1] == "validate":
            cmd_validate(path)
        else:
            cmd_bump(path)
    except (ValueError, RuntimeError, OSError, json.JSONDecodeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
