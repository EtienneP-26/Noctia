#!/usr/bin/env bash
# Tests for hooks/scripts/guard-git.sh. Run: bash hooks/tests/guard-git.test.sh
set -u

HOOK="$(cd "$(dirname "$0")/../scripts" && pwd)/guard-git.sh"
PROJECT=$(mktemp -d)
trap 'rm -rf "$PROJECT"' EXIT
FAILED=0
MODE_FILE=".noctia/git""-mode"

# set_mode MODE: store the git mode of the fake project.
set_mode() {
  mkdir -p "$PROJECT/.noctia"
  echo "$1" > "$PROJECT/$MODE_FILE"
}

# bash_decision COMMAND: print the permission decision for a Bash call (empty when none).
bash_decision() {
  jq -n --arg c "$1" '{tool_name: "Bash", tool_input: {command: $c}}' |
    CLAUDE_PROJECT_DIR="$PROJECT" bash "$HOOK" | jq -r '.hookSpecificOutput.permissionDecision // empty'
}

# write_decision TOOL PATH: print the permission decision for a Write/Edit call.
write_decision() {
  jq -n --arg t "$1" --arg p "$2" '{tool_name: $t, tool_input: {file_path: $p, content: "auto"}}' |
    CLAUDE_PROJECT_DIR="$PROJECT" bash "$HOOK" | jq -r '.hookSpecificOutput.permissionDecision // empty'
}

# check NAME CONDITION...: run the condition, report and count a failure.
check() {
  local name=$1; shift
  if "$@"; then echo "ok   $name"; else echo "FAIL $name"; FAILED=1; fi
}

test_commit_denied_when_locked() { set_mode locked; [ "$(bash_decision "git commit -m x")" = deny ]; }
test_commit_denied_without_mode_file() { rm -rf "$PROJECT/.noctia"; [ "$(bash_decision "git push")" = deny ]; }
test_commit_asks_in_ask_mode() { set_mode ask; [ "$(bash_decision "git -C . commit -m x")" = ask ]; }
test_commit_allowed_in_auto_mode() { set_mode auto; [ -z "$(bash_decision "git commit -m x")" ]; }
test_read_only_git_allowed() { set_mode locked; [ -z "$(bash_decision "git status && git log")" ]; }

test_script_with_mode_denied() {
  set_mode locked
  [ "$(bash_decision 'bash "/p/hooks/scripts/set-git-mode.sh" auto')" = deny ] &&
  [ "$(bash_decision 'bash /p/hooks/scripts/set-git-mode.sh ask')" = deny ] &&
  [ "$(bash_decision 'bash /p/set-git-mode.sh status; bash /p/set-git-mode.sh auto')" = deny ]
}
test_script_status_allowed() {
  set_mode locked
  [ -z "$(bash_decision 'bash /p/hooks/scripts/set-git-mode.sh status')" ] &&
  [ -z "$(bash_decision 'bash "/p/hooks/scripts/set-git-mode.sh"')" ]
}
test_redirect_into_mode_file_denied() {
  set_mode locked
  [ "$(bash_decision "echo auto > $MODE_FILE")" = deny ] &&
  [ "$(bash_decision 'cd .noctia && echo auto > git-mode')" = deny ] &&
  [ "$(bash_decision 'printf auto | tee git-mode')" = deny ]
}
test_cat_mode_file_allowed() { set_mode locked; [ -z "$(bash_decision "cat $MODE_FILE")" ]; }
test_write_edit_mode_file_denied() {
  set_mode locked
  [ "$(write_decision Write "$PROJECT/$MODE_FILE")" = deny ] &&
  [ "$(write_decision Edit "$PROJECT/$MODE_FILE")" = deny ]
}
test_write_other_file_allowed() { [ -z "$(write_decision Write "$PROJECT/src/a.txt")" ]; }

# ask_decision EXTRA LABELS: decision for an AskUserQuestion call on the picker; EXTRA is merged into tool_input.
ask_decision() {
  jq -n --argjson x "$1" --argjson l "$2" '{tool_name: "AskUserQuestion", tool_input: ({questions: [{question: "Noctia: choose the git mode for this project", options: ($l | map({label: .}))}]} + $x)}' |
    CLAUDE_PROJECT_DIR="$PROJECT" bash "$HOOK" | jq -r '.hookSpecificOutput.permissionDecision // empty'
}

test_picker_with_answers_denied() {
  [ "$(ask_decision '{"answers": {"q": "auto"}}' '["locked","ask","auto"]')" = deny ] &&
  [ "$(ask_decision '{"annotations": {"q": {"notes": "x"}}}' '["locked","ask","auto"]')" = deny ]
}
test_picker_with_wrong_options_denied() { [ "$(ask_decision '{}' '["locked","auto"]')" = deny ]; }
test_picker_normal_allowed() { [ -z "$(ask_decision '{}' '["locked","ask","auto"]')" ]; }
test_other_question_allowed() {
  [ -z "$(echo '{"tool_name":"AskUserQuestion","tool_input":{"questions":[{"question":"Which db?"}],"answers":{"a":"b"}}}' | CLAUDE_PROJECT_DIR="$PROJECT" bash "$HOOK")" ]
}

for t in $(declare -F | awk '{print $3}' | grep '^test_'); do check "$t" "$t"; done
exit "$FAILED"
