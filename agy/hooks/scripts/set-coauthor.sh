#!/usr/bin/env bash
# Save the co-author choice of the current project.
# Usage: set-coauthor.sh yes|no   (run from the project root)
# On "no", also hide the .noctia folder through .git/info/exclude (local only, never committed).
set -eu

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
STATE_DIR="$PROJECT_DIR/.noctia"
STATE_FILE="$STATE_DIR/coauthor"
EXCLUDE_LINE=".noctia/"

# save_answer ANSWER: store the answer and keep the state folder out of git.
save_answer() {
  mkdir -p "$STATE_DIR"
  echo "$1" > "$STATE_FILE"
  echo '*' > "$STATE_DIR/.gitignore"
  echo "Co-author answer saved: $1 ($STATE_FILE)"
}

# exclude_state_dir: add .noctia/ to the repository's .git/info/exclude. Safe to repeat; does nothing outside a git repo.
exclude_state_dir() {
  local exclude
  exclude=$(git -C "$PROJECT_DIR" rev-parse --git-path info/exclude 2>/dev/null) || return 0
  case "$exclude" in /*) ;; *) exclude="$PROJECT_DIR/$exclude" ;; esac

  mkdir -p "$(dirname "$exclude")"
  if ! grep -qxF "$EXCLUDE_LINE" "$exclude" 2>/dev/null; then
    echo "$EXCLUDE_LINE" >> "$exclude"
    echo "Added $EXCLUDE_LINE to $exclude"
  fi
}

main() {
  case "${1:-}" in
    yes) save_answer yes ;;
    no) save_answer no; exclude_state_dir ;;
    *) echo "Usage: set-coauthor.sh yes|no" >&2; exit 1 ;;
  esac
}

main "$@"