#!/usr/bin/env bash
# Noctia status line for the Antigravity CLI (agy). Reads the agy JSON on stdin, prints one line.
# Never fails: with no jq or bad JSON it prints "Noctia".
set -uo pipefail

ESC=$'\033'
MODE_FILE="git""-mode"
FIELDS=()
SEGS=()
PLAIN=()

# clean: stdin to stdout, drop control characters and ESC.
clean() { tr -d '\000-\037\177'; }

# rgb R G B: print the truecolor escape for a foreground colour.
rgb() { printf '%s[38;2;%s;%s;%sm' "$ESC" "$1" "$2" "$3"; }

# read_fields: one jq call, fill FIELDS (model, effort, percent, usd, estimated, cwd, subagents, tasks).
read_fields() {
  local out
  out=$(jq -r '
    def s: (strings // "") | gsub("[[:cntrl:]]"; "");
    def n: (numbers // "");
    (.model.display_name | s), (.model.effort | s),
    (.context_window.used_percentage | n), (.cost.total_usd | n),
    ((.cost.estimated // false) | tostring), (.cwd | s),
    ((.subagents | if type == "array" then length elif type == "number" then . else 0 end)),
    (.task_count | n), (.terminal_width | n), "end"
  ' 2>/dev/null) || return 1
  mapfile -t FIELDS <<< "$out"
  [ "${#FIELDS[@]}" -ge 10 ]
}

# add COLOR TEXT: append one coloured segment (TEXT is cleaned first).
add() {
  local text
  text=$(printf '%s' "$2" | clean)
  [ -n "$text" ] || return 0
  SEGS+=("$(rgb $1)$text$ESC[0m")
  PLAIN+=("$text")
}

# percent_color P: print the RGB triple for a context percentage (same thresholds as the banner).
percent_color() {
  if [ "$1" -ge 80 ]; then echo "252 165 165"; elif [ "$1" -ge 60 ]; then echo "252 211 77"; else echo "134 239 172"; fi
}

# mode_color MODE: print the RGB triple for a git mode.
mode_color() {
  case "$1" in locked) echo "134 239 172" ;; ask) echo "252 211 77" ;; auto) echo "252 165 165" ;; *) echo "148 163 184" ;; esac
}

# add_model: model name and effort.
add_model() {
  local m=${FIELDS[0]}
  [ -n "${FIELDS[1]}" ] && m="$m (${FIELDS[1]})"
  add "103 232 249" "$m"
}

# add_context: used context in percent.
add_context() {
  local p=${FIELDS[2]}
  [[ "$p" =~ ^[0-9]+(\.[0-9]+)?$ ]] || return 0
  p=$(printf '%.0f' "$p")
  add "$(percent_color "$p")" "ctx ${p}%"
}

# add_cost: cost in dollars, with ~ when estimated.
add_cost() {
  [[ "${FIELDS[3]}" =~ ^[0-9]+(\.[0-9]+)?$ ]] || return 0
  local pre=""
  [ "${FIELDS[4]}" = true ] && pre="~"
  add "148 163 184" "$(printf '%s$%.2f' "$pre" "${FIELDS[3]}")"
}

# add_git_mode: git mode read from the project state file.
add_git_mode() {
  local dir=${FIELDS[5]} mode=""
  [ -n "$dir" ] && [ -f "$dir/.noctia/$MODE_FILE" ] && mode=$(head -c 40 "$dir/.noctia/$MODE_FILE" 2>/dev/null | clean | tr -d '[:space:]')
  [ -n "$mode" ] || mode=locked
  add "$(mode_color "$mode")" "git:$mode"
}

# add_counts: running subagents and task count, when above zero.
add_counts() {
  local s=${FIELDS[6]} t=${FIELDS[7]}
  [[ "$s" =~ ^[0-9]+$ ]] && [ "$s" -gt 0 ] && add "167 139 250" "agents:$s"
  [[ "$t" =~ ^[0-9]+$ ]] && [ "$t" -gt 0 ] && add "167 139 250" "tasks:$t"
  return 0
}

# add_mentor: first line of .noctia/mentor (the current step), when the file exists.
add_mentor() {
  local dir=${FIELDS[5]} step
  [ -n "$dir" ] && [ -f "$dir/.noctia/mentor" ] || return 0
  step=$(head -n 1 "$dir/.noctia/mentor" 2>/dev/null | head -c 40 | clean)
  add "252 211 77" "mentor${step:+: $step}"
}

# render: join segments, dropping the last ones that do not fit terminal_width.
render() {
  local width=${FIELDS[8]} used=0 i out=""
  [[ "$width" =~ ^[0-9]+$ ]] && [ "$width" -gt 0 ] || width=100000
  for i in "${!SEGS[@]}"; do
    used=$((used + ${#PLAIN[$i]} + 3))
    [ "$used" -le "$width" ] || break
    out="$out${out:+ | }${SEGS[$i]}"
  done
  printf '%s\n' "$out"
}

main() {
  command -v jq >/dev/null 2>&1 || { echo Noctia; return 0; }
  read_fields || { echo Noctia; return 0; }
  add "167 139 250" "☾ Noctia"
  add_model; add_context; add_cost; add_git_mode; add_counts; add_mentor
  render
}

main 2>/dev/null < <(cat) || echo Noctia
exit 0
