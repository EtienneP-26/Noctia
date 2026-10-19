#!/usr/bin/env bash
# Tests for set-team-mode.sh and set-models.sh. Plain bash, no dependency.
# Usage: bash tests/scripts.test.sh   (from anywhere; works in a temporary project, never touches this repo)
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEAM="$ROOT/hooks/scripts/set-team-mode.sh"
MODELS="$ROOT/hooks/scripts/set-models.sh"
WORK="$(mktemp -d)"
FAILED=0
trap 'rm -rf "$WORK"' EXIT

# new_project: print the path of an empty project and export it as the project dir.
new_project() {
  CLAUDE_PROJECT_DIR="$(mktemp -d "$WORK/project.XXXXXX")"
  export CLAUDE_PROJECT_DIR CLAUDE_PLUGIN_ROOT="$ROOT"
}

# check NAME CONDITION...: run the condition and report pass or fail.
check() {
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then echo "pass  $name"; else echo "FAIL  $name"; FAILED=1; fi
}

# contains FILE TEXT: succeed if the file holds the text.
contains() { grep -qF -- "$2" "$1"; }

# fails COMMAND...: succeed if the command exits non-zero.
fails() { ! "$@"; }

# without_jq COMMAND...: run the command with a PATH that has no jq.
without_jq() {
  local bin="$WORK/nojq" tool
  if [ ! -d "$bin" ]; then
    mkdir -p "$bin"
    for tool in bash sed grep head tail cut mkdir mktemp mv rm dirname cat git; do
      ln -s "$(command -v "$tool")" "$bin/$tool" 2>/dev/null || true
    done
  fi
  PATH="$bin" "$@"
}

test_team_defaults_to_off() {
  new_project
  bash "$TEAM" status | grep -q 'Agent teams: off'
}

test_team_on_creates_settings() {
  new_project
  bash "$TEAM" on >/dev/null
  contains "$CLAUDE_PROJECT_DIR/.claude/settings.local.json" '"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS":"1"' \
    && bash "$TEAM" status | grep -q 'Agent teams: on'
}

test_team_off_writes_zero() {
  new_project
  bash "$TEAM" on >/dev/null && bash "$TEAM" off >/dev/null
  contains "$CLAUDE_PROJECT_DIR/.claude/settings.local.json" '"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "0"' \
    && bash "$TEAM" status | grep -q 'Agent teams: off'
}

test_team_keeps_other_settings() {
  new_project
  mkdir -p "$CLAUDE_PROJECT_DIR/.claude"
  echo '{"permissions":{"allow":["Bash(ls)"]}}' > "$CLAUDE_PROJECT_DIR/.claude/settings.local.json"
  bash "$TEAM" on >/dev/null
  contains "$CLAUDE_PROJECT_DIR/.claude/settings.local.json" 'Bash(ls)'
}

test_team_refuses_unknown_argument() {
  new_project
  fails bash "$TEAM" maybe
}

test_team_without_jq_leaves_existing_file() {
  new_project
  mkdir -p "$CLAUDE_PROJECT_DIR/.claude"
  echo '{"permissions":{}}' > "$CLAUDE_PROJECT_DIR/.claude/settings.local.json"
  fails without_jq bash "$TEAM" on \
    && [ "$(cat "$CLAUDE_PROJECT_DIR/.claude/settings.local.json")" = '{"permissions":{}}' ]
}

test_team_without_jq_creates_new_file() {
  new_project
  without_jq bash "$TEAM" on >/dev/null \
    && contains "$CLAUDE_PROJECT_DIR/.claude/settings.local.json" '"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS":"1"'
}

test_team_refuses_invalid_json() {
  new_project
  mkdir -p "$CLAUDE_PROJECT_DIR/.claude"
  echo 'not json' > "$CLAUDE_PROJECT_DIR/.claude/settings.local.json"
  fails bash "$TEAM" on && [ "$(cat "$CLAUDE_PROJECT_DIR/.claude/settings.local.json")" = 'not json' ]
}

test_models_default_to_the_agent_files() {
  new_project
  bash "$MODELS" show | grep -q 'reader .*haiku .*(default)'
}

test_models_store_an_agent_choice() {
  new_project
  bash "$MODELS" developer=haiku >/dev/null
  contains "$CLAUDE_PROJECT_DIR/.noctia/models" 'developer=haiku' \
    && bash "$MODELS" show | grep -q 'developer .*haiku .*(your choice)'
}

test_models_last_choice_wins_and_default_drops_it() {
  new_project
  bash "$MODELS" developer=haiku >/dev/null && bash "$MODELS" developer=opus >/dev/null
  [ "$(grep -c '^developer=' "$CLAUDE_PROJECT_DIR/.noctia/models")" = 1 ] || return 1
  bash "$MODELS" developer=default >/dev/null
  ! grep -q '^developer=' "$CLAUDE_PROJECT_DIR/.noctia/models"
}

test_models_lead_goes_to_the_settings() {
  new_project
  bash "$MODELS" lead=opus >/dev/null
  contains "$CLAUDE_PROJECT_DIR/.claude/settings.local.json" '"model":"opus"'
}

test_models_reject_unknown_role_and_model() {
  new_project
  fails bash "$MODELS" bogus=opus && fails bash "$MODELS" reader=gpt && fails bash "$MODELS" reader
}

test_models_change_nothing_when_one_choice_is_bad() {
  new_project
  fails bash "$MODELS" reader=sonnet tester=bogus && [ ! -e "$CLAUDE_PROJECT_DIR/.noctia/models" ]
}

test_models_reset_drops_everything() {
  new_project
  bash "$MODELS" reader=sonnet lead=opus >/dev/null && bash "$MODELS" reset >/dev/null
  ! grep -q 'reader=' "$CLAUDE_PROJECT_DIR/.noctia/models" 2>/dev/null \
    && ! contains "$CLAUDE_PROJECT_DIR/.claude/settings.local.json" '"model"'
}

test_models_state_is_git_ignored() {
  new_project
  bash "$MODELS" reader=sonnet >/dev/null
  [ "$(cat "$CLAUDE_PROJECT_DIR/.noctia/.gitignore")" = '*' ]
}

test_session_start_gives_the_choices_to_claude() {
  new_project
  bash "$MODELS" reader=sonnet >/dev/null
  bash "$ROOT/hooks/scripts/session-start.sh" | grep -q 'reader -> sonnet'
}

test_session_start_is_silent_without_choices() {
  new_project
  ! bash "$ROOT/hooks/scripts/session-start.sh" | grep -q '(from /noctia:models)'
}

main() {
  local name
  for name in $(declare -F | awk '{print $3}' | grep '^test_'); do
    check "${name#test_}" "$name"
  done
  [ "$FAILED" = 0 ] && echo "All passed." || { echo "Some tests failed."; exit 1; }
}

main
