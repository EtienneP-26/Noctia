#!/usr/bin/env bash
# Adapter: run a Noctia hook script (written for Claude Code) from an Antigravity CLI (agy) hook.
# Usage: agy-hook.sh <script-name> [PreToolUse|SessionStart]   (agy hook JSON on stdin)
# Converts the agy input to the Claude Code shape, runs the script unchanged, maps its answer back.
# Needs bash and jq. On PreToolUse any failure to convert denies the call (fail closed).
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
NAME="${1:-}"
EVENT="${2:-PreToolUse}"

# emit_decision DECISION REASON: print an agy decision; text must contain no quotes.
emit_decision() {
  printf '{"decision":"%s","reason":"%s"}\n' "$1" "$2"
}

# fail_closed REASON: deny on PreToolUse, stay silent on other events, then stop.
fail_closed() {
  [ "$EVENT" = "PreToolUse" ] && emit_decision deny "$1"
  exit 0
}

# to_claude_input: read agy JSON on stdin, print the Claude Code hook JSON.
to_claude_input() {
  jq -c '
    def first_str($o; $keys): [$keys[] as $k | $o[$k] | select(type == "string" and length > 0)] | .[0];
    def tool_name: {run_command: "Bash", write_to_file: "Write", create_file: "Write",
      replace_file_content: "Edit", multi_replace_file_content: "Edit", edit_file: "Edit"}[.] // .;
    (.toolCall.args // {}) as $raw
    | (if ($raw | type) == "object" then $raw else {} end) as $args
    | (.toolCall.name // "" | tool_name) as $tool
    | (if $tool == "Bash" then
        {command: (first_str($args; ["CommandLine","command","commandLine","cmd"]) // ($raw | tojson))}
      elif $tool == "Write" or $tool == "Edit" then
        {file_path: first_str($args; ["TargetFile","file_path","path","AbsolutePath"]),
         content: first_str($args; ["CodeContent","content"]),
         new_string: first_str($args; ["ReplacementContent","new_string"])}
        | with_entries(select(.value != null))
      else {} end) as $mapped
    | {session_id: .conversationId, transcript_path: .transcriptPath,
       cwd: (.workspacePaths[0] // null), tool_name: $tool, tool_input: ($args + $mapped)}
  '
}

# project_dir JSON: print the first workspace path, or $PWD.
project_dir() {
  jq -r '.workspacePaths[0] // empty' <<<"$1" 2>/dev/null || true
}

# run_script CLAUDE_JSON PROJECT: run the hook script; set OUT, ERR and RC.
run_script() {
  local errfile
  errfile=$(mktemp)
  OUT=$(printf '%s' "$1" | CLAUDE_PROJECT_DIR="$2" CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT" \
    bash "$SCRIPT_DIR/$NAME.sh" 2>"$errfile")
  RC=$?
  ERR=$(cat "$errfile")
  rm -f "$errfile"
}

# map_pre_tool_use: translate the script result into an agy decision.
map_pre_tool_use() {
  local decision="" reason=""
  if [ "$RC" -eq 2 ]; then
    emit_decision deny "$(jq -Rn --arg r "${ERR:-Noctia hook blocked this call}" '$r' | sed 's/^"//; s/"$//')"
    return
  fi
  [ -n "$OUT" ] || return 0
  decision=$(jq -r '.hookSpecificOutput.permissionDecision // empty' <<<"$OUT" 2>/dev/null || true)
  reason=$(jq -r '.hookSpecificOutput.permissionDecisionReason // empty' <<<"$OUT" 2>/dev/null || true)
  case "$decision" in
    deny) jq -nc --arg r "$reason" '{decision: "deny", reason: $r}' ;;
    ask) jq -nc --arg r "$reason" '{decision: "force_ask", reason: $r}' ;;
    allow) echo '{"decision":"allow"}' ;;
  esac
}

# map_session_start: wrap the injected context in an agy injectSteps message.
map_session_start() {
  local ctx
  ctx=$(jq -r '.hookSpecificOutput.additionalContext // empty' <<<"$OUT" 2>/dev/null || true)
  [ -n "$ctx" ] || ctx="$OUT"
  [ -n "$ctx" ] || return 0
  jq -nc --arg m "$ctx" '{injectSteps: [{systemMessage: {systemMessage: $m}}]}'
}

main() {
  local input claude project
  [[ "$NAME" =~ ^[a-z][a-z-]*$ ]] && [ -f "$SCRIPT_DIR/$NAME.sh" ] || fail_closed "Noctia: unknown hook script."
  command -v jq >/dev/null 2>&1 || fail_closed "Noctia: jq is missing, so the git and secret guards cannot run. Install jq."
  input=$(cat)
  if [ "$EVENT" = "PreToolUse" ]; then
    claude=$(to_claude_input <<<"$input" 2>/dev/null) && [ -n "$claude" ] || fail_closed "Noctia: unreadable hook input, call denied."
  else
    claude='{}'
  fi
  project=$(project_dir "$input")
  run_script "$claude" "${project:-$PWD}"
  case "$EVENT" in
    PreToolUse) map_pre_tool_use ;;
    SessionStart) map_session_start ;;
  esac
}

main
