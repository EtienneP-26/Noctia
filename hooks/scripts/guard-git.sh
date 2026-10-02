#!/usr/bin/env bash
# PreToolUse guard: git add/commit/push/tag are locked unless the user unlocked them with /noctia:git.
# Modes (stored in .noctia/git-mode): locked (default) | ask (user approves each command) | auto (no prompt).
# Reads the hook JSON on stdin; needs only bash, grep and tr.
set -u

INPUT=$(cat)
STATE_FILE="${CLAUDE_PROJECT_DIR:-$PWD}/.noctia/git-mode"

# Matches "git [-C dir | -c x=y | --flag]... add|commit|push|tag" anywhere in a command.
GIT_WRITE='(^|[^[:alnum:]_./-])git([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?)*[[:space:]]+(add|commit|push|tag)([[:space:]";&|\\]|$)'

# decide DECISION REASON: print the PreToolUse permission decision as JSON. Reason must contain no quotes.
decide() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"%s","permissionDecisionReason":"%s"}}\n' "$1" "$2"
}

# read_mode: print locked, ask or auto (anything unknown counts as locked).
read_mode() {
  local mode=""
  [ -f "$STATE_FILE" ] && mode=$(tr -d '[:space:]' < "$STATE_FILE")
  case "$mode" in ask|auto) echo "$mode" ;; *) echo locked ;; esac
}

# input_has REGEX: succeed if the hook input matches the extended regex.
input_has() {
  grep -qE "$1" <<<"$INPUT"
}

# guard_state_file: refuse any tool call that touches the mode file directly.
guard_state_file() {
  if input_has '\.noctia/git-mode'; then
    decide deny "Noctia: the git mode file is user-controlled. Do not edit it. Ask the user to run /noctia:git."
    exit 0
  fi
}

# guard_git_command: apply the current mode to a Bash git write command.
guard_git_command() {
  input_has '"tool_name"[[:space:]]*:[[:space:]]*"Bash"' || return 0
  input_has "$GIT_WRITE" || return 0

  case "$(read_mode)" in
    auto)
      return 0 ;;
    ask)
      if input_has '"permission_mode"[[:space:]]*:[[:space:]]*"bypassPermissions"'; then
        decide deny "Noctia: git mode is ask but permissions are bypassed, so it cannot prompt. Ask the user in chat, or have them run /noctia:git auto."
      else
        decide ask "Noctia: git write command. Approve only if you agreed to it."
      fi ;;
    *)
      decide deny "Noctia: git add, commit, push and tag are locked. Do not retry or work around it. Ask the user if they want you to use git; they unlock with /noctia:git ask (approve each command) or /noctia:git auto (full auto)." ;;
  esac
}

main() {
  guard_state_file
  guard_git_command
}

main
