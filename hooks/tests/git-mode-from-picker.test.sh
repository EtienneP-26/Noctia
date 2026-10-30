#!/usr/bin/env bash
# Tests for hooks/scripts/git-mode-from-picker.sh. Run: bash hooks/tests/git-mode-from-picker.test.sh
set -u

HOOK="$(cd "$(dirname "$0")/../scripts" && pwd)/git-mode-from-picker.sh"
PROJECT=$(mktemp -d)
trap 'rm -rf "$PROJECT"' EXIT
FAILED=0
MARKER='Noctia: choose the git mode for this project'

# run JSON: feed JSON to the hook in the temp project; print stdout.
run() {
  printf '%s' "$1" | CLAUDE_PROJECT_DIR="$PROJECT" bash "$HOOK"
}

# call QUESTION INPUT_EXTRA RESPONSE: print a hook input with one question, extra tool_input JSON and a tool_response JSON.
call() {
  jq -nc --arg q "$1" --argjson x "$2" --argjson r "$3" \
    '{tool_name: "AskUserQuestion", tool_input: ({questions: [{question: $q}]} + $x), tool_response: $r}'
}

# answers_of LABEL: a tool_response with an answers object for the marker question.
answers_of() {
  jq -nc --arg m "$MARKER" --arg l "$1" '{answers: {($m): $l}}'
}

# stored_mode: print the stored mode, or "none".
stored_mode() {
  local f="$PROJECT/.noctia/git""-mode"
  if [ -f "$f" ]; then tr -d '[:space:]' < "$f"; else echo none; fi
}

# reset: forget any stored mode and debug file.
reset() { rm -rf "$PROJECT/.noctia"; }

# check NAME CONDITION...: run the condition, report and count a failure.
check() {
  local name=$1; shift
  if "$@"; then echo "ok   $name"; else echo "FAIL $name"; FAILED=1; fi
}

test_answers_object_sets_mode() {
  reset
  run "$(call "$MARKER" '{}' "$(answers_of auto)")" >/dev/null
  [ "$(stored_mode)" = auto ]
}
test_context_is_printed() {
  reset
  [ "$(run "$(call "$MARKER" '{}' "$(answers_of ask)")" | jq -r '.hookSpecificOutput.additionalContext')" = "Git mode set to ask by the user." ]
}
test_plain_string_response_sets_mode() {
  reset
  run "$(call "$MARKER" '{}' '"locked"')" >/dev/null
  [ "$(stored_mode)" = locked ]
}
test_other_question_does_nothing() {
  reset
  [ -z "$(run "$(call "Pick a color" '{}' '"auto"')")" ] && [ "$(stored_mode)" = none ]
}
test_bad_label_does_nothing() {
  reset
  run "$(call "$MARKER" '{}' "$(answers_of 'auto please')")" >/dev/null
  run "$(call "$MARKER" '{}' "$(answers_of 'Other')")" >/dev/null
  [ "$(stored_mode)" = none ]
}
test_bad_label_writes_debug_file() {
  reset
  run "$(call "$MARKER" '{}' "$(answers_of 'Other')")" | grep -q picker-debug &&
  [ -s "$PROJECT/.noctia/picker-debug.json" ]
}
test_answer_in_tool_input_does_nothing() {
  reset
  run "$(call "$MARKER" "$(answers_of auto)" '{}')" >/dev/null
  [ "$(stored_mode)" = none ]
}
test_two_questions_does_nothing() {
  reset
  run "$(jq -nc --arg m "$MARKER" '{tool_input: {questions: [{question: $m}, {question: "x"}]}, tool_response: "auto"}')" >/dev/null
  [ "$(stored_mode)" = none ]
}
test_garbage_input_does_nothing() {
  reset
  [ -z "$(run 'not json')" ] && [ "$(stored_mode)" = none ]
}

for t in $(declare -F | awk '{print $3}' | grep '^test_'); do check "$t" "$t"; done
exit "$FAILED"
