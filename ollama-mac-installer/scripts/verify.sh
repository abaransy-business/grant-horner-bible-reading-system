#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

bash -n "$ROOT_DIR/ollama-mac-installer.command"
bash -n "$ROOT_DIR/scripts/build-dmg.sh"

"$ROOT_DIR/ollama-mac-installer.command" --dry-run --yes --skip-model-pull

echo "Verification passed"
