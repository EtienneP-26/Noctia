#!/usr/bin/env bash
# Build and install the Noctia plugin for the Antigravity CLI (agy), and optionally its status line.
# Usage: bash scripts/install-agy.sh [--yes] [--no-statusline]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
YES=0
STATUSLINE=1
STATUS_CMD='bash "$HOME/.gemini/config/plugins/noctia/statusline/noctia-status.sh"'

# install_plugin: run agy plugin install when agy exists, else print the command.
install_plugin() {
  if command -v agy >/dev/null 2>&1; then
    agy plugin install "$ROOT/agy"
  else
    echo "agy not found. Run this once agy is installed:"
    echo "  agy plugin install $ROOT/agy"
  fi
}

# plugin_installed: succeed when the status line script exists in the agy plugin dir.
plugin_installed() {
  [ -f "$HOME/.gemini/config/plugins/noctia/statusline/noctia-status.sh" ]
}

# ask_statusline: succeed when the user wants the status line.
ask_statusline() {
  local answer=""
  [ "$YES" = 1 ] && return 0
  read -r -p "Enable the Noctia status line in agy? [y/N] " answer || true
  [ "$answer" = y ] || [ "$answer" = Y ] || [ "$answer" = yes ]
}

# merge_settings FILE: write the statusLine key into FILE, keeping the other keys.
merge_settings() {
  local file=$1 tmp
  tmp=$(mktemp)
  jq --arg c "$STATUS_CMD" '. + {statusLine: {type: "command", command: $c, stack_with_default: false}}' "$file" > "$tmp"
  cat "$tmp" > "$file"
  rm -f "$tmp"
}

# enable_statusline: edit the agy settings file (backup first, refuse on invalid JSON).
enable_statusline() {
  local dir="$HOME/.gemini/antigravity-cli" file backup
  file="$dir/settings.json"
  command -v jq >/dev/null 2>&1 || { echo "jq is required for the status line. Settings untouched." >&2; return 1; }
  mkdir -p "$dir"
  if [ -s "$file" ]; then
    jq -e 'type == "object"' "$file" >/dev/null 2>&1 \
      || { echo "$file is not a valid JSON object. Settings untouched." >&2; return 1; }
    backup="$file.bak-$(date +%Y%m%d%H%M%S)"
    cp -p "$file" "$backup"
    echo "Backup: $backup"
  else
    echo '{}' > "$file"
  fi
  merge_settings "$file"
  echo "Status line enabled in $file"
}

# parse_args: read the flags.
parse_args() {
  local a
  for a in "$@"; do
    case "$a" in
      --yes) YES=1 ;;
      --no-statusline) STATUSLINE=0 ;;
      *) echo "Usage: install-agy.sh [--yes] [--no-statusline]" >&2; exit 1 ;;
    esac
  done
}

main() {
  parse_args "$@"
  bash "$ROOT/scripts/build-agy.sh"
  install_plugin
  if [ "$STATUSLINE" = 1 ] && ! plugin_installed; then
    echo "Plugin not found in ~/.gemini/config/plugins/noctia. Status line not changed."
  elif [ "$STATUSLINE" = 1 ] && ask_statusline; then
    enable_statusline || echo "Status line not enabled."
  else
    echo "Status line not changed."
  fi
}

main "$@"
