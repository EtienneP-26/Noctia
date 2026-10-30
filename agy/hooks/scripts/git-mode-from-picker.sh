#!/usr/bin/env bash
# PostToolUse hook (AskUserQuestion): when the USER picks a mode in the /git picker, set it.
# The answer is read from tool_response only, never from tool_input. Needs bash and jq.
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MARKER='Noctia: choose the git mode for this project'

# is_picker INPUT: succeed when the call is exactly one question with the marker text.
is_picker() {
  jq -e --arg m "$MARKER" \
    '(.tool_input.questions | type == "array" and length == 1 and .[0].question == $m)' <<<"$1" >/dev/null 2>&1
}

# answer_of INPUT: print the user's answer found in tool_response (answers object, or a plain string).
answer_of() {
  jq -r --arg m "$MARKER" '
    .tool_response as $r
    | (if ($r | type) == "string" then $r
       elif ($r | type) == "object" then ($r.answers[$m]? // $r.answer? // empty)
       else empty end)
    | if type == "array" then (.[0] // empty) else . end
    | if type == "string" then . else empty end' <<<"$1" 2>/dev/null
}

# save_debug INPUT: keep the raw tool_response (4 KB max) to learn its real shape.
save_debug() {
  local dir="${CLAUDE_PROJECT_DIR:-$PWD}/.noctia"
  mkdir -p "$dir" 2>/dev/null || return 0
  [ -f "$dir/.gitignore" ] || echo '*' > "$dir/.gitignore"
  jq -c '.tool_response' <<<"$1" 2>/dev/null | head -c 4096 > "$dir/picker-debug.json"
}

# say TEXT: print the hook output with TEXT as additional context.
say() {
  jq -nc --arg m "$1" '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $m}}'
}

main() {
  local input mode
  command -v jq >/dev/null 2>&1 || exit 0
  input=$(cat)
  is_picker "$input" || exit 0
  mode=$(answer_of "$input")
  case "$mode" in
    locked|ask|auto)
      bash "$SCRIPT_DIR/set-git-mode.sh" "$mode" >/dev/null 2>&1 || exit 0
      say "Git mode set to $mode by the user." ;;
    *)
      save_debug "$input"
      say "Git mode picker: no valid answer found, nothing changed. Raw response saved in .noctia/picker-debug.json." ;;
  esac
}

main
