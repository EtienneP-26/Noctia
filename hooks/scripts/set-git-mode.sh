#!/usr/bin/env bash
# Set or show the Noctia git mode of the current project.
# Usage: set-git-mode.sh locked|ask|auto|status   (run from the project root)
set -eu

STATE_DIR="${CLAUDE_PROJECT_DIR:-$PWD}/.noctia"
STATE_FILE="$STATE_DIR/git-mode"

# current_mode: print the stored mode, or locked when none is stored.
current_mode() {
  if [ -f "$STATE_FILE" ]; then tr -d '[:space:]' < "$STATE_FILE"; else echo locked; fi
}

# save_mode MODE: store the mode and keep the state folder out of git.
save_mode() {
  mkdir -p "$STATE_DIR"
  echo "$1" > "$STATE_FILE"
  echo '*' > "$STATE_DIR/.gitignore"
  echo "Git mode set to: $1 ($STATE_FILE)"
}

main() {
  case "${1:-status}" in
    locked|ask|auto) save_mode "$1" ;;
    status) echo "Git mode: $(current_mode)" ;;
    *) echo "Usage: set-git-mode.sh locked|ask|auto|status" >&2; exit 1 ;;
  esac
}

main "$@"
