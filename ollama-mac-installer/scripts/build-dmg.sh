#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
STAGE_DIR="$(mktemp -d)"
DMG_NAME="${DMG_NAME:-ollama-mac-installer.dmg}"
VOL_NAME="${VOL_NAME:-Ollama Mac Installer}"

cleanup() {
  rm -rf "$STAGE_DIR"
}
trap cleanup EXIT

command -v hdiutil >/dev/null 2>&1 || {
  echo "ERROR: hdiutil is required to build a DMG. Run this on macOS." >&2
  exit 1
}

mkdir -p "$DIST_DIR"

cp "$ROOT_DIR/ollama-mac-installer.command" "$STAGE_DIR/ollama-mac-installer.command"
cp "$ROOT_DIR/README.md" "$STAGE_DIR/README.md"
chmod +x "$STAGE_DIR/ollama-mac-installer.command"

hdiutil create \
  -volname "$VOL_NAME" \
  -srcfolder "$STAGE_DIR" \
  -ov \
  -format UDZO \
  "$DIST_DIR/$DMG_NAME"

echo "Built $DIST_DIR/$DMG_NAME"
