#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
STAGE_DIR="$(mktemp -d)"
ZIP_NAME="${ZIP_NAME:-ollama-windows-installer.zip}"

cleanup() {
  rm -rf "$STAGE_DIR"
}
trap cleanup EXIT

command -v zip >/dev/null 2>&1 || {
  echo "ERROR: zip is required to build the archive." >&2
  exit 1
}

mkdir -p "$DIST_DIR"

cp "$ROOT_DIR/ollama-windows-installer.ps1" "$STAGE_DIR/ollama-windows-installer.ps1"
cp "$ROOT_DIR/ollama-windows-installer.cmd" "$STAGE_DIR/ollama-windows-installer.cmd"
cp "$ROOT_DIR/OllamaWindowsInstaller.iss" "$STAGE_DIR/OllamaWindowsInstaller.iss"
cp "$ROOT_DIR/README.md" "$STAGE_DIR/README.md"

(
  cd "$STAGE_DIR"
  zip -r "$DIST_DIR/$ZIP_NAME" .
)

echo "Built $DIST_DIR/$ZIP_NAME"
