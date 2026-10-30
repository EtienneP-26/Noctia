#!/usr/bin/env bash
# Tests for scripts/build-agy.sh. Run: bash scripts/tests/build-agy.test.sh
set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BUILD="$ROOT/scripts/build-agy.sh"
AGY="$ROOT/agy"
COPY=$(mktemp -d)
trap 'rm -rf "$COPY"' EXIT
FAILED=0

# check NAME CONDITION...: run the condition, report and count a failure.
check() {
  local name=$1; shift
  if "$@"; then echo "ok   $name"; else echo "FAIL $name"; FAILED=1; fi
}

# fm_has FILE KEY: succeed when the frontmatter of FILE has KEY.
fm_has() { awk -v k="$2" 'NR==1&&$0!="---"{exit 1} NR>1&&$0=="---"{exit 1} index($0,k":")==1{f=1; exit} END{exit !f}' "$1"; }

# fm_val FILE KEY: print the frontmatter value of KEY.
fm_val() { awk -v k="$2" 'NR>1&&$0=="---"{exit} index($0,k": ")==1{print substr($0,length(k)+3)}' "$1"; }

test_plugin_json_three_keys() { [ "$(jq 'keys | length' "$AGY/plugin.json")" = 3 ]; }

test_rules_have_trigger() {
  local f
  for f in "$AGY"/rules/*.md; do
    [ "$(head -1 "$f")" = --- ] || return 1
    fm_val "$f" trigger | grep -qxE 'always_on|model_decision|glob|manual' || return 1
  done
}

test_agents_valid() {
  local f
  for f in "$AGY"/agents/*.md; do
    fm_has "$f" name && fm_has "$f" description || return 1
    fm_val "$f" model | grep -qxE 'pro|flash|inherit' || return 1
  done
}

test_one_main_agent() { [ "$(grep -l '^mainAgent: true$' "$AGY"/agents/*.md | xargs -n1 basename)" = chief.md ]; }

test_skills_valid() {
  local f
  for f in "$AGY"/skills/*/SKILL.md; do
    fm_has "$f" description || return 1
    ! fm_has "$f" disable-model-invocation || return 1
  done
}

test_no_claude_text() {
  ! grep -rEq 'CLAUDE_PLUGIN_ROOT|/noctia:|\.claude/plugins' "$AGY/rules" "$AGY/agents" "$AGY/skills" "$AGY/hooks.json" "$AGY/plugin.json"
}

test_no_leftover_phrases() {
  ! grep -rEq 'Runs on pro|pro chief|noreply@anthropic\.com|/git <|\bClaude\b' "$AGY/rules" "$AGY/agents" "$AGY/skills" "$AGY/plugin.json" "$AGY/hooks/scripts/guard-git.sh"
}

test_no_picker_in_agy() {
  ! grep -rEq 'AskUserQuestion|picker' "$AGY/skills" "$AGY/hooks.json" &&
  grep -q 'in their own terminal, from the project root' "$AGY/skills/git/SKILL.md"
}

test_hooks_json_valid() {
  local script
  jq -e . "$AGY/hooks.json" >/dev/null || return 1
  for script in $(jq -r '.. | .command? // empty' "$AGY/hooks.json" | sed -E 's/.*agy-hook\.sh" ([a-z-]+).*/\1/'); do
    [ -f "$AGY/hooks/scripts/$script.sh" ] || return 1
  done
}

test_build_is_deterministic() {
  bash "$BUILD" >/dev/null && cp -R "$AGY" "$COPY/first" && bash "$BUILD" >/dev/null && diff -r "$COPY/first" "$AGY" >/dev/null
}

bash "$BUILD" >/dev/null || { echo "FAIL build"; exit 1; }
for t in $(declare -F | awk '$3 ~ /^test_/ {print $3}'); do check "$t" "$t"; done
exit $FAILED
