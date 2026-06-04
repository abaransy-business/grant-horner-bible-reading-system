#!/bin/bash
set -euo pipefail

APP_NAME="Ollama Mac Installer"
DEFAULT_MODEL="gemma4"
DEFAULT_ORIGINS="https://tenlistbible.com,https://www.tenlistbible.com"
DEFAULT_DOWNLOAD_URL="https://ollama.com/download/Ollama-darwin.zip"
API_URL="${OLLAMA_API_URL:-http://localhost:11434}"

MODEL="${TENLIST_OLLAMA_MODEL:-${OLLAMA_MODEL:-$DEFAULT_MODEL}}"
ORIGINS="${TENLIST_OLLAMA_ORIGINS:-${OLLAMA_ORIGINS:-$DEFAULT_ORIGINS}}"
DOWNLOAD_URL="${OLLAMA_DOWNLOAD_URL:-$DEFAULT_DOWNLOAD_URL}"
SKIP_MODEL_PULL="${SKIP_MODEL_PULL:-0}"
ASSUME_YES="${ASSUME_YES:-1}"
DRY_RUN=0
OLLAMA_BIN=""
OLLAMA_APP_PATH=""
TEMP_DIR_TO_CLEAN=""

cleanup_temp_dir() {
  if [ -n "${TEMP_DIR_TO_CLEAN:-}" ]; then
    rm -rf "$TEMP_DIR_TO_CLEAN"
  fi
}
trap cleanup_temp_dir EXIT

log() {
  printf "\n>>> %s\n" "$*"
}

note() {
  printf "%s\n" "$*"
}

warn() {
  printf "WARNING: %s\n" "$*" >&2
}

fail() {
  printf "ERROR: %s\n" "$*" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
Ollama Mac Installer

Installs/configures Ollama for a browser app that talks to the local Ollama API.

Usage:
  ./ollama-mac-installer.command [options]

Options:
  --model MODEL          Ollama model tag to pull. Default: gemma4
  --origins ORIGINS      Comma-separated browser origins allowed by Ollama.
                         Default: https://tenlistbible.com,https://www.tenlistbible.com
  --download-url URL     Ollama macOS zip URL. Default: official Ollama download URL.
  --skip-model-pull      Configure/start Ollama but do not pull the model.
  --yes                  Do not prompt before installing/restarting/pulling.
  --dry-run              Print the planned actions without changing the system.
  --help                 Show this help.

Environment overrides:
  TENLIST_OLLAMA_MODEL       Same as --model.
  TENLIST_OLLAMA_ORIGINS     Same as --origins.
  OLLAMA_DOWNLOAD_URL        Same as --download-url.
  SKIP_MODEL_PULL=1          Same as --skip-model-pull.
  ASSUME_YES=1               Same as --yes.
  OLLAMA_API_URL             Default: http://localhost:11434
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --model)
      [ "$#" -ge 2 ] || fail "--model requires a value"
      MODEL="$2"
      shift 2
      ;;
    --origins)
      [ "$#" -ge 2 ] || fail "--origins requires a value"
      ORIGINS="$2"
      shift 2
      ;;
    --download-url)
      [ "$#" -ge 2 ] || fail "--download-url requires a value"
      DOWNLOAD_URL="$2"
      shift 2
      ;;
    --skip-model-pull)
      SKIP_MODEL_PULL=1
      shift
      ;;
    --yes)
      ASSUME_YES=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      fail "Unknown option: $1"
      ;;
  esac
done

run() {
  if [ "$DRY_RUN" = "1" ]; then
    printf "+ "
    printf "%q " "$@"
    printf "\n"
    return 0
  fi

  "$@"
}

confirm() {
  if [ "$ASSUME_YES" = "1" ]; then
    return 0
  fi

  printf "%s [y/N] " "$*"
  read -r answer
  case "$answer" in
    y|Y|yes|YES|Yes)
      return 0
      ;;
    *)
      fail "Canceled"
      ;;
  esac
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

require_macos() {
  [ "$(uname -s)" = "Darwin" ] || fail "This installer only supports macOS."

  local version major
  version="$(sw_vers -productVersion)"
  major="${version%%.*}"

  if [ "$major" -lt 14 ]; then
    fail "Ollama requires macOS 14 Sonoma or newer. Current macOS version: $version"
  fi
}

find_ollama() {
  if command -v ollama >/dev/null 2>&1; then
    OLLAMA_BIN="$(command -v ollama)"
  elif [ -x "/Applications/Ollama.app/Contents/Resources/ollama" ]; then
    OLLAMA_BIN="/Applications/Ollama.app/Contents/Resources/ollama"
  elif [ -x "$HOME/Applications/Ollama.app/Contents/Resources/ollama" ]; then
    OLLAMA_BIN="$HOME/Applications/Ollama.app/Contents/Resources/ollama"
  else
    OLLAMA_BIN=""
  fi

  if [ -d "/Applications/Ollama.app" ]; then
    OLLAMA_APP_PATH="/Applications/Ollama.app"
  elif [ -d "$HOME/Applications/Ollama.app" ]; then
    OLLAMA_APP_PATH="$HOME/Applications/Ollama.app"
  else
    OLLAMA_APP_PATH=""
  fi
}

ensure_cli_symlink() {
  [ -n "$OLLAMA_APP_PATH" ] || return 0

  local cli_path
  cli_path="$OLLAMA_APP_PATH/Contents/Resources/ollama"
  [ -x "$cli_path" ] || return 0

  if command -v ollama >/dev/null 2>&1; then
    return 0
  fi

  if [ "$OLLAMA_APP_PATH" = "/Applications/Ollama.app" ]; then
    log "Adding ollama CLI link to /usr/local/bin"
    run mkdir -p "/usr/local/bin" 2>/dev/null || run sudo mkdir -p "/usr/local/bin"
    run ln -sf "$cli_path" "/usr/local/bin/ollama" 2>/dev/null || run sudo ln -sf "$cli_path" "/usr/local/bin/ollama"
    OLLAMA_BIN="/usr/local/bin/ollama"
  fi
}

install_ollama() {
  require_command curl
  require_command unzip

  log "Ollama was not found"
  note "This will download Ollama from:"
  note "$DOWNLOAD_URL"
  confirm "Install Ollama now?"

  local temp_dir install_parent target_app needs_sudo
  temp_dir="$(mktemp -d)"
  TEMP_DIR_TO_CLEAN="$temp_dir"
  install_parent="/Applications"
  target_app="$install_parent/Ollama.app"
  needs_sudo=0

  if [ ! -w "$install_parent" ]; then
    if sudo -v; then
      needs_sudo=1
    else
      warn "Could not get admin permission for /Applications. Falling back to $HOME/Applications."
      install_parent="$HOME/Applications"
      target_app="$install_parent/Ollama.app"
      needs_sudo=0
    fi
  fi

  log "Downloading Ollama"
  run curl --fail --show-error --location --progress-bar \
    -o "$temp_dir/Ollama-darwin.zip" \
    "$DOWNLOAD_URL"

  log "Unpacking Ollama"
  run unzip -q "$temp_dir/Ollama-darwin.zip" -d "$temp_dir"
  [ "$DRY_RUN" = "1" ] || [ -d "$temp_dir/Ollama.app" ] || fail "Downloaded archive did not contain Ollama.app"

  log "Installing Ollama to $install_parent"
  if [ "$needs_sudo" = "1" ]; then
    run sudo rm -rf "$target_app"
    run sudo mv "$temp_dir/Ollama.app" "$target_app"
  else
    run mkdir -p "$install_parent"
    run rm -rf "$target_app"
    run mv "$temp_dir/Ollama.app" "$target_app"
  fi

  OLLAMA_APP_PATH="$target_app"
  OLLAMA_BIN="$target_app/Contents/Resources/ollama"
  ensure_cli_symlink
}

configure_ollama_environment() {
  log "Configuring Ollama browser access"
  note "Allowed origins: $ORIGINS"

  export OLLAMA_ORIGINS="$ORIGINS"
  run launchctl setenv OLLAMA_ORIGINS "$ORIGINS"

  if [ -n "${TENLIST_OLLAMA_CONTEXT_LENGTH:-}" ]; then
    note "Context length: $TENLIST_OLLAMA_CONTEXT_LENGTH"
    export OLLAMA_CONTEXT_LENGTH="$TENLIST_OLLAMA_CONTEXT_LENGTH"
    run launchctl setenv OLLAMA_CONTEXT_LENGTH "$TENLIST_OLLAMA_CONTEXT_LENGTH"
  fi
}

stop_ollama_app_if_running() {
  if pgrep -x Ollama >/dev/null 2>&1; then
    log "Restarting Ollama so the new browser access setting takes effect"
    confirm "Quit the running Ollama app and restart it?"
    run pkill -x Ollama
    sleep 2
  fi
}

start_ollama() {
  log "Starting Ollama"

  if [ -n "$OLLAMA_APP_PATH" ]; then
    if [ "$OLLAMA_APP_PATH" = "/Applications/Ollama.app" ]; then
      run open -a Ollama --args hidden || true
    else
      run open "$OLLAMA_APP_PATH" --args hidden || true
    fi
  fi

  if [ "$DRY_RUN" = "1" ]; then
    return 0
  fi

  if wait_for_ollama 20; then
    return 0
  fi

  warn "The Ollama app did not start the API quickly. Starting ollama serve in the background."
  mkdir -p "$HOME/.ollama/logs"
  nohup "$OLLAMA_BIN" serve > "$HOME/.ollama/logs/tenlist-ollama-serve.log" 2>&1 &

  wait_for_ollama 45 || fail "Ollama did not become available at $API_URL"
}

wait_for_ollama() {
  local attempts i
  attempts="$1"

  for i in $(seq 1 "$attempts"); do
    if curl -fsS "$API_URL/api/tags" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  return 1
}

warn_on_low_disk_space() {
  local available_kb available_gb
  available_kb="$(df -Pk "$HOME" | awk 'NR == 2 { print $4 }')"
  available_gb=$((available_kb / 1024 / 1024))

  if [ "$available_gb" -lt 20 ]; then
    warn "Only about ${available_gb}GB is available under $HOME. Large models may need significantly more free space."
    confirm "Continue anyway?"
  fi
}

model_installed() {
  "$OLLAMA_BIN" list 2>/dev/null | awk 'NR > 1 { print $1 }' | grep -Fx "$MODEL" >/dev/null 2>&1
}

pull_model() {
  if [ "$SKIP_MODEL_PULL" = "1" ]; then
    log "Skipping model pull"
    return 0
  fi

  if [ "$DRY_RUN" = "1" ]; then
    log "Would check/pull model: $MODEL"
    return 0
  fi

  if model_installed; then
    log "Model already installed: $MODEL"
    return 0
  fi

  log "Model is not installed: $MODEL"
  note "This can download several GB and may take a while."
  warn_on_low_disk_space
  confirm "Pull $MODEL now?"

  "$OLLAMA_BIN" pull "$MODEL"
}

check_cors_headers() {
  if [ "$DRY_RUN" = "1" ]; then
    return 0
  fi

  local first_origin headers
  first_origin="${ORIGINS%%,*}"
  headers="$(curl -sS -i -X OPTIONS "$API_URL/api/chat" \
    -H "Origin: $first_origin" \
    -H "Access-Control-Request-Method: POST" 2>/dev/null || true)"

  if ! printf "%s" "$headers" | grep -qi '^access-control-allow-origin:'; then
    warn "Could not confirm CORS headers for $first_origin. If the website cannot connect, quit and reopen Ollama, then try again."
  fi
}

print_summary() {
  cat <<SUMMARY

Done.

Ollama API:       $API_URL
Model:            $MODEL
Allowed origins:  $ORIGINS

Open your web app and retry the local Ollama connection.
SUMMARY
}

main() {
  log "$APP_NAME"
  note "Model: $MODEL"
  note "Allowed origins: $ORIGINS"

  require_macos
  require_command curl

  find_ollama
  if [ -z "$OLLAMA_BIN" ]; then
    install_ollama
  else
    log "Found Ollama: $OLLAMA_BIN"
    ensure_cli_symlink
  fi

  [ -n "$OLLAMA_BIN" ] || fail "Could not find the Ollama CLI after installation."

  configure_ollama_environment
  stop_ollama_app_if_running
  start_ollama
  pull_model
  check_cors_headers
  print_summary
}

main "$@"
