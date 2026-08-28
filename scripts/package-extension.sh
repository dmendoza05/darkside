#!/usr/bin/env bash
# Build a Chrome Web Store ZIP with manifest.json at the archive root.
# https://developer.chrome.com/docs/webstore/prepare
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${1:-"$ROOT/dist"}"
mkdir -p "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"

VERSION="$(python3 "$ROOT/scripts/chrome_version.py" validate "$ROOT/manifest.json")"
NAME="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["name"])' "$ROOT/manifest.json")"
ZIP_PATH="$OUT_DIR/darkside-${VERSION}.zip"

STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT

cp "$ROOT/manifest.json" "$ROOT/service-worker.js" "$ROOT/LICENSE" "$STAGING/"
cp -R "$ROOT/popup" "$ROOT/options" "$ROOT/content" "$ROOT/shared" "$STAGING/"
mkdir -p "$STAGING/icons"
cp "$ROOT/icons/icon16.png" \
   "$ROOT/icons/icon32.png" \
   "$ROOT/icons/icon48.png" \
   "$ROOT/icons/icon128.png" \
   "$ROOT/icons/logo.png" \
   "$STAGING/icons/"

find "$STAGING" \( -name '.DS_Store' -o -name 'Thumbs.db' -o -name '*~' \) -delete

rm -f "$ZIP_PATH"
# Zip from inside staging so the archive root is manifest.json, not a folder.
(cd "$STAGING" && zip -r -X "$ZIP_PATH" .)

python3 - "$ZIP_PATH" <<'PY'
import sys, zipfile

path = sys.argv[1]
names = zipfile.ZipFile(path).namelist()
if "manifest.json" not in names:
    raise SystemExit("manifest.json must be at the ZIP root, not in a folder")
print(f"OK  {path}  ({len(names)} entries)")
for name in sorted(names):
    print(f"  {name}")
PY

echo
echo "Packed ${NAME} ${VERSION} -> ${ZIP_PATH}"
