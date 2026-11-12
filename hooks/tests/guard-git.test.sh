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

# set_coauthor ANSWER: store the co-author answer of the fake project (none removes it).
set_coauthor() {
  mkdir -p "$PROJECT/.noctia"
  if [ "$1" = none ]; then rm -f "$PROJECT/.noctia/coauthor"; else echo "$1" > "$PROJECT/.noctia/coauthor"; fi
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
test_commit_asks_in_ask_mode() { set_mode ask; set_coauthor no; [ "$(bash_decision "git -C . commit -m x")" = ask ]; }
test_commit_allowed_in_auto_mode() { set_mode auto; set_coauthor no; [ -z "$(bash_decision "git commit -m x")" ]; }
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
test_git_on_mode_scripts_allowed() {
  set_mode auto
  [ -z "$(bash_decision 'git add hooks/scripts/git-mode-from-prompt.sh')" ] &&
  [ -z "$(bash_decision 'git diff HEAD -- hooks/scripts/set-git-mode.sh')" ] &&
  [ -z "$(bash_decision 'bash scripts/build-agy.sh')" ]
}
test_sed_rm_mode_file_denied() {
  set_mode locked
  [ "$(bash_decision "sed -i s/locked/auto/ $MODE_FILE")" = deny ] &&
  [ "$(bash_decision "rm $MODE_FILE")" = deny ]
}
test_cat_mode_file_allowed() { set_mode locked; [ -z "$(bash_decision "cat $MODE_FILE")" ]; }
test_write_edit_mode_file_denied() {
  set_mode locked
  [ "$(write_decision Write "$PROJECT/$MODE_FILE")" = deny ] &&
  [ "$(write_decision Edit "$PROJECT/$MODE_FILE")" = deny ]
}
test_write_other_file_allowed() { [ -z "$(write_decision Write "$PROJECT/src/a.txt")" ]; }

test_skill_flow_allowed() {
  set_mode locked
  [ -z "$(bash_decision 'bash "/home/u/.claude/plugins/cache/n/noctia/1/hooks/scripts/set-git-mode.sh" status')" ] &&
  [ -z "$(bash_decision 'bash /p/hooks/scripts/set-git-mode.sh status 2>&1')" ] &&
  [ -z "$(bash_decision 'bash /p/hooks/scripts/set-git-mode.sh status || true')" ] &&
  [ -z "$(bash_decision 'bash "/p/hooks/scripts/set-coauthor.sh" yes')" ] &&
  [ -z "$(bash_decision 'bash "/p/hooks/scripts/set-coauthor.sh" no')" ]
}
test_script_reads_allowed() {
  set_mode locked
  [ -z "$(bash_decision 'cat hooks/scripts/set-git-mode.sh')" ] &&
  [ -z "$(bash_decision 'grep -n mode hooks/scripts/set-git-mode.sh hooks/scripts/guard-git.sh')" ] &&
  [ -z "$(bash_decision "sed -n '1,40p' hooks/scripts/set-git-mode.sh")" ] &&
  [ -z "$(bash_decision 'cat .noctia/coauthor')" ]
}
test_description_field_ignored() {
  set_mode locked
  [ -z "$(jq -n '{tool_name:"Bash",tool_input:{command:"ls",description:"check git-mode and set-git-mode.sh auto"}}' | CLAUDE_PROJECT_DIR="$PROJECT" bash "$HOOK")" ]
}
test_git_bypasses_denied() {
  set_mode locked
  local c
  for c in '/usr/bin/git commit -m x' '"git" commit -m x' 'g"it" push' "git -C 'my dir' commit -m x" 'git -C "my dir" add .' \
    'git -c user.name=x commit -m x' 'GIT_DIR=x git commit -m x' 'FOO=1 BAR=2 /usr/bin/git tag v1' 'bash -c "git push"' '(git add .)'; do
    [ "$(bash_decision "$c")" = deny ] || { echo "  not denied: $c"; return 1; }
  done
}
test_state_file_bypasses_denied() {
  set_mode locked
  local c
  for c in 'echo auto > .noctia/git-mod?' 'echo auto > .noctia/git-"mode"' 'echo auto > .noctia/g*' 'cp /tmp/x .noctia/git-mode' 'mv /tmp/x .noctia/coauthor' \
    'echo yes > .noctia/coauthor' 'sed -i s/no/yes/ .noctia/coauthor' 'printf yes | tee .noctia/coauthor' 'cd .noctia && echo yes > coauthor' 'rm .noctia/coauthor'; do
    [ "$(bash_decision "$c")" = deny ] || { echo "  not denied: $c"; return 1; }
  done
}
test_write_edit_coauthor_denied() {
  [ "$(write_decision Write "$PROJECT/.noctia/coauthor")" = deny ] && [ "$(write_decision Edit "$PROJECT/.noctia/coauthor")" = deny ]
}
test_coauthor_yes() {
  set_mode auto; set_coauthor yes
  [ "$(bash_decision 'git commit -m x')" = deny ] &&
  [ -z "$(bash_decision 'git commit -m "x

Co-Authored-By: Claude <noreply@anthropic.com>"')" ]
}
test_coauthor_no() {
  set_mode auto; set_coauthor no
  [ "$(bash_decision 'git commit -m "x

Co-Authored-By: Claude <noreply@anthropic.com>"')" = deny ] &&
  [ -z "$(bash_decision 'git commit -m x')" ]
}
test_coauthor_missing() {
  set_mode auto; set_coauthor none
  [ "$(bash_decision 'git commit -m x')" = deny ] && [ -z "$(bash_decision 'git add .')" ]
}
test_coauthor_checked_in_ask_mode() {
  set_mode ask; set_coauthor yes
  [ "$(bash_decision 'git commit -m x')" = deny ] &&
  [ "$(bash_decision 'git commit -m "x Co-Authored-By: A <a@b.c>"')" = ask ]
}

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

# with_settings JSON: point NOCTIA_SETTINGS at a file holding JSON.
with_settings() { export NOCTIA_SETTINGS="$PROJECT/s.json"; echo "$1" > "$NOCTIA_SETTINGS"; }

test_default_mode_ask_from_settings() {
  rm -rf "$PROJECT/.noctia"; with_settings '{"git":{"default_mode":"ask"}}'
  local r; r=$(bash_decision "git push"); unset NOCTIA_SETTINGS; [ "$r" = ask ]
}
test_default_mode_auto_setting_allows_commit() {
  rm -rf "$PROJECT/.noctia"; set_coauthor no; with_settings '{"git":{"default_mode":"auto"}}'
  local r; r=$(bash_decision "git commit -m x"); unset NOCTIA_SETTINGS; [ -z "$r" ]
}
test_project_mode_file_beats_auto_setting() {
  set_mode locked; set_coauthor no; with_settings '{"git":{"default_mode":"auto"}}'
  local r; r=$(bash_decision "git commit -m x"); unset NOCTIA_SETTINGS; [ "$r" = deny ]
}
test_project_mode_beats_setting() {
  set_mode locked; with_settings '{"git":{"default_mode":"ask"}}'
  local r; r=$(bash_decision "git push"); unset NOCTIA_SETTINGS; [ "$r" = deny ]
}
test_default_coauthor_yes_acts_as_answer() {
  set_mode auto; set_coauthor none; with_settings '{"git":{"default_coauthor":"no"}}'
  local r; r=$(bash_decision "git commit -m x"); unset NOCTIA_SETTINGS
  [ -z "$r" ] && [ "$(NOCTIA_SETTINGS=/nonexistent bash_decision "git commit -m x")" = deny ]
}
test_settings_write_denied() {
  local f='~/.claude/noctia/settings.json' c
  for c in "echo {} > $f" "echo x | tee $f" "sed -i s/a/b/ $f" "cp /tmp/x $f" "mv /tmp/x $f" \
    "python3 -c \"open('$f','w').write('x')\""; do
    [ "$(bash_decision "$c")" = deny ] || { echo "  not denied: $c"; return 1; }
  done
}
test_settings_set_and_picker_script_denied() {
  [ "$(bash_decision 'python3 dashboard/settings.py set git.default_mode ask')" = deny ] &&
  [ "$(bash_decision 'bash hooks/scripts/config-from-picker.sh x')" = deny ]
}
test_settings_api_post_denied() {
  [ "$(bash_decision 'curl -X POST localhost:7777/api/settings -d {}')" = deny ] &&
  [ "$(bash_decision 'curl -s -d x http://localhost:7777/api/localai')" = deny ] &&
  [ "$(bash_decision 'wget --post-data=x localhost:7777/api/agents')" = deny ]
}
test_settings_api_get_allowed() { [ -z "$(bash_decision 'curl -s localhost:7777/api/settings')" ]; }
test_settings_edit_denied() { [ "$(write_decision Edit /home/u/.claude/noctia/settings.json)" = deny ]; }
test_settings_reads_allowed() {
  [ -z "$(bash_decision 'cat ~/.claude/noctia/settings.json')" ] &&
  [ -z "$(bash_decision 'grep git ~/.claude/noctia/settings.json')" ] &&
  [ -z "$(bash_decision 'python3 dashboard/settings.py get git.default_mode')" ]
}
test_settings_path_bypass_denied() {
  local p
  for p in '/home/u/.claude/noctia/./settings.json' '/home/u/.claude/noctia//settings.json' '~/.claude/noctia/x/../settings.json' \
    '$HOME/.claude/noctia/agents.json' '/home/u/.config/noctia/localai.json'; do
    [ "$(write_decision Write "$p")" = deny ] || { echo "  not denied: $p"; return 1; }
  done
  [ "$(NOCTIA_LOCALAI_CONFIG=/x/y/c.json write_decision Edit /x//y/c.json)" = deny ]
}
test_settings_glob_denied() {
  [ "$(bash_decision 'mv x ~/.claude/noctia/settings.js?n')" = deny ] &&
  [ "$(bash_decision 'mv x settings.js?n')" = deny ] &&
  [ "$(bash_decision 'cp x localai.j*')" = deny ]
}
test_settings_api_bypass_denied() {
  [ "$(bash_decision "python3 -c \"import urllib.request as u;u.urlopen('http://localhost:7777/api/settings',b'{}')\"")" = deny ] &&
  [ "$(bash_decision 'curl --request POST localhost:7777/api/agents')" = deny ] &&
  [ "$(bash_decision 'node -e fetch\(\"localhost/api/localai\"\)')" = deny ]
}
test_settings_readonly_more_allowed() {
  [ -z "$(bash_decision 'curl -s localhost:7777/api/localai | jq .')" ] &&
  [ -z "$(bash_decision 'wget -qO- localhost:7777/api/agents')" ] &&
  [ -z "$(bash_decision 'jq . ~/.config/noctia/localai.json')" ] &&
  [ -z "$(bash_decision 'less ~/.claude/noctia/agents.json')" ]
}
test_config_picker_forged_denied() {
  local j='{"tool_name":"AskUserQuestion","tool_input":{"questions":[{"question":"Noctia config: pick"}],"answers":{"a":"b"}}}'
  [ "$(echo "$j" | CLAUDE_PROJECT_DIR="$PROJECT" bash "$HOOK" | jq -r '.hookSpecificOutput.permissionDecision // empty')" = deny ]
}
test_config_picker_normal_allowed() {
  [ -z "$(echo '{"tool_name":"AskUserQuestion","tool_input":{"questions":[{"question":"Noctia config: pick"}]}}' | CLAUDE_PROJECT_DIR="$PROJECT" bash "$HOOK")" ]
}

for t in $(declare -F | awk '{print $3}' | grep '^test_'); do check "$t" "$t"; done
exit "$FAILED"
