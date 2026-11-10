#!/usr/bin/env bash
# Noctia status line for Claude Code. Reads the status line JSON on stdin, prints one line.
# Never fails: with no jq or bad JSON it prints "Noctia".
set -uo pipefail
HERE=${BASH_SOURCE[0]%/*}; [ "$HERE" = "${BASH_SOURCE[0]}" ] && HERE=.
. "$HERE/limits.sh"

ESC=$'\033'
MODE_FILE="git""-mode"
FIELDS=()
SEGS=()
QUIET=0
{ [ "${1:-}" = --quiet ] || [ "${NOCTIA_STATUS_QUIET:-}" = 1 ]; } && QUIET=1

# clean: stdin to stdout, drop control characters and ESC.
clean() { tr -d '\000-\037\177'; }

# say TEXT: print one line unless quiet mode is on (usage is still written).
say() { [ "$QUIET" = 1 ] || printf '%s\n' "$1"; }

# add COLOR TEXT: append one coloured segment (TEXT is cleaned first).
add() {
  local text
  text=$(printf '%s' "$2" | clean)
  [ -n "$text" ] || return 0
  SEGS+=("$(printf '%s[38;2;%sm%s%s[0m' "$ESC" "${1// /;}" "$text" "$ESC")")
}

# read_fields: one jq call; FIELDS 0 model, 1 context %, 2 dir, 9-12 rate limits (same slots as noctia-status.sh).
read_fields() {
  local out
  out=$(jq -r '
    def s: (strings // "") | gsub("[[:cntrl:]]"; "");
    def n: (numbers // "");
    (.model.display_name | s), (.context_window.used_percentage | n),
    (.workspace.current_dir | s), "", "", "", "", "", "",
    (.rate_limits.five_hour.used_percentage | n), (.rate_limits.five_hour.resets_at | n),
    (.rate_limits.seven_day.used_percentage | n), (.rate_limits.seven_day.resets_at | n), "end"
  ' 2>/dev/null) || return 1
  mapfile -t FIELDS <<< "$out"
  [ "${#FIELDS[@]}" -ge 14 ]
}

# add_context: used context in percent, coloured by level.
add_context() {
  local p=${FIELDS[1]} c="134 239 172"
  [[ "$p" =~ ^[0-9]+(\.[0-9]+)?$ ]] || return 0
  p=$(printf '%.0f' "$p")
  if [ "$p" -ge 80 ]; then c="252 165 165"; elif [ "$p" -ge 60 ]; then c="252 211 77"; fi
  add "$c" "ctx ${p}%"
}

# add_git_mode: git mode read from the project state file (default locked).
add_git_mode() {
  local dir=${FIELDS[2]} mode="" c
  [ -n "$dir" ] && [ -f "$dir/.noctia/$MODE_FILE" ] && mode=$(head -c 40 "$dir/.noctia/$MODE_FILE" 2>/dev/null | clean | tr -d '[:space:]')
  [ -n "$mode" ] || mode=locked
  case "$mode" in locked) c="134 239 172" ;; ask) c="252 211 77" ;; auto) c="252 165 165" ;; *) c="148 163 184" ;; esac
  add "$c" "git:$mode"
}

# render: join segments with the separator.
render() {
  local out="" s
  for s in "${SEGS[@]}"; do out="$out${out:+ · }$s"; done
  say "$out"
}

main() {
  command -v jq >/dev/null 2>&1 || { say Noctia; return 0; }
  read_fields || { say Noctia; return 0; }
  add "167 139 250" "Noctia"
  [ -n "${FIELDS[0]}" ] && add "103 232 249" "${FIELDS[0]}"
  add_context; add_limits; add_git_mode
  render
}

main 2>/dev/null < <(cat) || say Noctia
exit 0
