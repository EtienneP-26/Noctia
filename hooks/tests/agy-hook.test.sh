#!/usr/bin/env bash
# Tests for hooks/scripts/agy-hook.sh. Run: bash hooks/tests/agy-hook.test.sh
set -u

ADAPTER="$(cd "$(dirname "$0")/../scripts" && pwd)/agy-hook.sh"
PROJECT=$(mktemp -d)
trap 'rm -rf "$PROJECT"' EXIT
FAILED=0
MODE_FILE=".noctia/git""-mode"

# agy_call TOOL ARGS_JSON: build an agy PreToolUse input.
agy_call() {
  jq -nc --arg t "$1" --argjson a "$2" --arg w "$PROJECT" \
    '{conversationId: "c1", workspacePaths: [$w], toolCall: {name: $t, args: $a}}'
}

# run SCRIPT: run the adapter for a PreToolUse script, input on stdin.
run() { bash "$ADAPTER" "$1" PreToolUse 2>/dev/null; }

# decision SCRIPT TOOL ARGS: print the agy decision field (empty when silent).
decision() { agy_call "$2" "$3" | run "$1" | jq -r '.decision // empty'; }

# check NAME CONDITION...: run the condition, report and count a failure.
check() {
  local name=$1; shift
  if "$@"; then echo "ok   $name"; else echo "FAIL $name"; FAILED=1; fi
}

test_commit_denied_with_commandline_key() {
  [ "$(decision guard-git run_command '{"CommandLine":"git commit -m x"}')" = deny ]
}
test_commit_denied_with_command_key() {
  [ "$(decision guard-git run_command '{"command":"git push"}')" = deny ]
}
test_unknown_key_fails_closed() {
  [ "$(decision guard-git run_command '{"weird":"git commit -m x"}')" = deny ]
}
test_harmless_command_is_silent() {
  [ -z "$(agy_call run_command '{"CommandLine":"ls"}' | run guard-git)" ]
}
test_ask_mode_gives_force_ask() {
  mkdir -p "$PROJECT/.noctia"; echo ask > "$PROJECT/$MODE_FILE"
  [ "$(decision guard-git run_command '{"CommandLine":"git add ."}')" = force_ask ]
  rm -rf "$PROJECT/.noctia"
}
test_write_secret_denied() {
  [ "$(decision guard-secrets write_to_file '{"TargetFile":"a.py","CodeContent":"k=AKIAABCDEFGHIJKLMNOP"}')" = deny ]
}
test_edit_secret_denied() {
  [ "$(decision guard-secrets replace_file_content '{"path":"a.py","ReplacementContent":"k=AKIAABCDEFGHIJKLMNOP"}')" = deny ]
}
test_write_clean_is_silent() {
  [ -z "$(decision guard-secrets write_to_file '{"TargetFile":"a.py","CodeContent":"x=1"}')" ]
}
test_write_to_mode_file_denied() {
  [ "$(decision guard-git create_file "{\"TargetFile\":\"$MODE_FILE\",\"CodeContent\":\"auto\"}")" = deny ]
}
test_session_start_injects_steps() {
  local out
  out=$(echo "{\"workspacePaths\":[\"$PROJECT\"]}" | bash "$ADAPTER" session-start SessionStart 2>/dev/null)
  jq -e '.injectSteps[0].systemMessage.systemMessage | contains("Noctia")' <<<"$out" >/dev/null
}
test_garbage_input_denied() {
  [ "$(echo 'not json' | run guard-git | jq -r .decision)" = deny ]
}
test_empty_input_denied() {
  [ "$(printf '' | run guard-git | jq -r .decision)" = deny ]
}
test_unknown_script_denied() {
  [ "$(agy_call run_command '{}' | run ../evil | jq -r .decision)" = deny ]
}

for t in $(declare -F | awk '{print $3}' | grep '^test_'); do check "$t" "$t"; done
exit "$FAILED"
