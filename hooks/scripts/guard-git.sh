#!/usr/bin/env bash
# PreToolUse guard: git add/commit/push/tag are locked unless the user unlocked them with /noctia:git.
# Modes (stored in .noctia/git-mode): locked (default) | ask (user approves each command) | auto (no prompt).
# Reads the hook JSON on stdin; needs only bash, grep and tr.
set -u

INPUT=$(cat)
STATE_FILE="${CLAUDE_PROJECT_DIR:-$PWD}/.noctia/git-mode"

# Matches "git [-C dir | -c x=y | --flag]... add|commit|push|tag" anywhere in a command.
GIT_WRITE='(^|[^[:alnum:]_./-])git([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?)*[[:space:]]+(add|commit|push|tag)([[:space:]";&|\\]|$)'

PICKER_MARKER='Noctia: choose the git mode for this project'

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

# deny_unlock: refuse a change of the mode file; the user must run the command in their own terminal.
deny_unlock() {
  decide deny "Noctia: the git mode is user-controlled. Do not edit it or run set-git-mode.sh with a mode. Ask the user to type /noctia:git <locked|ask|auto> in the chat. In agy the user runs this in their terminal: bash $(dirname "$0")/set-git-mode.sh <locked|ask|auto>"
  exit 0
}

# is_bash: succeed when the hook input is a Bash tool call.
is_bash() {
  input_has '"tool_name"[[:space:]]*:[[:space:]]*"Bash"'
}

# unlock_script_call: succeed if set-git-mode.sh is run with anything but status (or no argument).
unlock_script_call() {
  local rest
  while IFS= read -r rest; do
    grep -qE '^(\\")?[[:space:]]*(status)?[[:space:]]*(\\n|"|[;&|]|$)' <<<"$rest" || return 0
  done < <(sed 's/set-git-mode\.sh/\n@@/g' <<<"$INPUT" | grep '^@@' | sed 's/^@@//')
  return 1
}

# mentions_mode_file: succeed if the command names git-mode (set-git-mode.sh itself does not count).
mentions_mode_file() {
  sed 's/set-git-mode\.sh//g' <<<"$INPUT" | grep -q 'git-mode'
}

# read_only_command: succeed if the command is a plain read (cat, head, tail, grep, ls, wc) with no shell tricks.
read_only_command() {
  input_has '"command"[[:space:]]*:[[:space:]]*"(cat|head|tail|grep|ls|wc)[[:space:]][^;&|<>$`()\\]*"'
}

# guard_state_file: refuse any attempt to change the mode file, by Bash or by Write/Edit.
guard_state_file() {
  if is_bash; then
    unlock_script_call && deny_unlock
    mentions_mode_file && ! read_only_command && deny_unlock
  elif input_has '"file_path"[[:space:]]*:[[:space:]]*"[^"]*git-mode"'; then
    deny_unlock
  fi
  return 0
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

# picker_verdict: print forged, options or nothing for an AskUserQuestion call about the git mode picker.
picker_verdict() {
  jq -r --arg m "$PICKER_MARKER" '
    def filled: . != null and . != {} and . != [] and . != "";
    [.tool_input.questions[]? | select(.question == $m)] as $p
    | if ($p | length) == 0 then empty
      elif (.tool_input.answers | filled) or (.tool_input.annotations | filled) then "forged"
      elif ($p | any(([.options[]? | if type == "object" then .label else . end]) != ["locked", "ask", "auto"])) then "options"
      else empty end' <<<"$INPUT" 2>/dev/null
}

# guard_picker: nobody but the user may answer the git mode picker, and its options are fixed.
guard_picker() {
  local verdict
  input_has '"tool_name"[[:space:]]*:[[:space:]]*"AskUserQuestion"' || return 0
  if command -v jq >/dev/null 2>&1; then
    verdict=$(picker_verdict)
  else
    verdict=""
    input_has "$PICKER_MARKER" && verdict=forged
  fi
  case "$verdict" in
    forged) decide deny "Noctia: the git mode picker must be answered by the user." ;;
    options) decide deny "Noctia: the git mode picker must offer exactly locked, ask and auto." ;;
  esac
  return 0
}

main() {
  guard_picker
  guard_state_file
  guard_git_command
}

main
