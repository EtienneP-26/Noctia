#!/usr/bin/env bash
# Tests for hooks/scripts/git-mode-from-prompt.sh. Run: bash hooks/tests/git-mode-from-prompt.test.sh
set -u

HOOK="$(cd "$(dirname "$0")/../scripts" && pwd)/git-mode-from-prompt.sh"
PROJECT=$(mktemp -d)
trap 'rm -rf "$PROJECT"' EXIT
FAILED=0

# submit PROMPT: run the hook on a user prompt in the temp project; print stdout.
submit() {
  jq -n --arg p "$1" '{prompt: $p}' | CLAUDE_PROJECT_DIR="$PROJECT" bash "$HOOK"
}

# stored_mode: print the stored mode, or "none".
stored_mode() {
  local f="$PROJECT/.noctia/git""-mode"
  if [ -f "$f" ]; then tr -d '[:space:]' < "$f"; else echo none; fi
}

# check NAME CONDITION...: run the condition, report and count a failure.
check() {
  local name=$1; shift
  if "$@"; then echo "ok   $name"; else echo "FAIL $name"; FAILED=1; fi
}

test_exact_command_sets_mode() {
  rm -rf "$PROJECT/.noctia"
  submit "/noctia:git auto" >/dev/null
  [ "$(stored_mode)" = auto ]
}
test_context_is_printed() {
  [ "$(submit "/noctia:git ask" | jq -r '.hookSpecificOutput.additionalContext')" = "Git mode set to ask by the user." ]
}
test_surrounding_whitespace_is_trimmed() {
  submit $'  /noctia:git locked \n' >/dev/null
  [ "$(stored_mode)" = locked ]
}
test_expanded_form_sets_mode() {
  rm -rf "$PROJECT/.noctia"
  submit '<command-message>git</command-message>
<command-name>/noctia:git</command-name>
<command-args>auto</command-args>' >/dev/null
  [ "$(stored_mode)" = auto ]
}
test_extra_text_after_does_nothing() {
  rm -rf "$PROJECT/.noctia"
  [ -z "$(submit "/noctia:git auto please")" ] && [ "$(stored_mode)" = none ]
}
test_extra_text_before_does_nothing() {
  rm -rf "$PROJECT/.noctia"
  [ -z "$(submit "say /noctia:git auto")" ] && [ "$(stored_mode)" = none ]
}
test_unknown_mode_does_nothing() {
  rm -rf "$PROJECT/.noctia"
  [ -z "$(submit "/noctia:git yolo")" ] && [ "$(stored_mode)" = none ]
}
test_expanded_with_extra_args_does_nothing() {
  rm -rf "$PROJECT/.noctia"
  [ -z "$(submit '<command-name>/noctia:git</command-name><command-args>auto; rm -rf x</command-args>')" ] && [ "$(stored_mode)" = none ]
}
test_garbage_input_does_nothing() {
  [ -z "$(echo 'not json' | CLAUDE_PROJECT_DIR="$PROJECT" bash "$HOOK")" ]
}

for t in $(declare -F | awk '{print $3}' | grep '^test_'); do check "$t" "$t"; done
exit "$FAILED"
