#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

bash -n "$ROOT_DIR/scripts/build-zip.sh"

test -f "$ROOT_DIR/ollama-windows-installer.ps1"
test -f "$ROOT_DIR/ollama-windows-installer.cmd"
test -f "$ROOT_DIR/OllamaWindowsInstaller.iss"
test -f "$ROOT_DIR/README.md"

if command -v pwsh >/dev/null 2>&1; then
  pwsh -NoProfile -Command "\$null = [scriptblock]::Create((Get-Content -Raw '$ROOT_DIR/ollama-windows-installer.ps1'))"
  if pwsh -NoProfile -Command "if ([Environment]::OSVersion.Platform -eq 'Win32NT') { exit 0 } else { exit 1 }"; then
    pwsh -NoProfile -File "$ROOT_DIR/ollama-windows-installer.ps1" -DryRun -Yes -SkipModelPull
  else
    echo "not running on Windows; skipped PowerShell dry-run check."
  fi
else
  echo "pwsh not found; skipped PowerShell parse/dry-run checks."
fi

echo "Verification passed"
