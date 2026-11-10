#!/usr/bin/env bash
# PreToolUse guard: git add/commit/push/tag are locked unless the user unlocked them with /noctia:git.
# Modes (stored in .noctia/git-mode): locked (default) | ask (user approves each command) | auto (no prompt).
# Reads the hook JSON on stdin; needs only bash, grep and tr.
set -u

INPUT=$(cat)
STATE_FILE="${CLAUDE_PROJECT_DIR:-$PWD}/.noctia/git-mode"

# CMD is the decoded Bash command; NORM is CMD without quotes or backslashes, so "git" and g"it" read as git.
# Limit: variable indirection (g=git; $g commit) and encoded payloads cannot be seen by a text guard.
CMD=$INPUT
command -v jq >/dev/null 2>&1 && CMD=$(jq -r '.tool_input.command // empty' <<<"$INPUT" 2>/dev/null)
NORM=$(tr -d "\"'\\\\" <<<"$CMD")

# Matches "git [-C dir | -c x=y | --flag]... SUB" in NORM; also /usr/bin/git and env prefixes (GIT_DIR=x git ...).
GIT_OPTS='(^|[^[:alnum:]_.-])git([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:];&|][^[:space:];&|]*)*)*[[:space:]]+'
GIT_WRITE="${GIT_OPTS}(add|commit|push|tag)([[:space:];&|]|\$)"
GIT_COMMIT="${GIT_OPTS}commit([[:space:];&|]|\$)"

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

# deny_unlock: refuse a change of the state files; the user must run the command in their own terminal.
deny_unlock() {
  decide deny "Noctia: the git mode and co-author files are user-controlled. Do not edit them or run the mode script with a mode. Ask the user to type /noctia:git <locked|ask|auto> in the chat. In agy the user runs this in their terminal: bash $(dirname "$0")/set-git-mode.sh <locked|ask|auto>"
  exit 0
}

# is_bash: succeed when the hook input is a Bash tool call.
is_bash() {
  input_has '"tool_name"[[:space:]]*:[[:space:]]*"Bash"'
}

# unlock_script_call: succeed if set-git-mode.sh is run with an argument other than status (or none, or a redirection).
unlock_script_call() {
  local rest
  while IFS= read -r rest; do
    grep -qE '^[[:space:]]*(status)?[[:space:]]*([0-9]*[<>;&|)]|$)' <<<"$rest" || return 0
  done < <(sed 's/set-git-mode\.sh/\n@@/g' <<<"$NORM" | grep '^@@' | sed 's/^@@//')
  return 1
}

# mentions_state_file: succeed if the command names the .noctia folder, the git-mode or the coauthor file (also globbed or quote-split).
mentions_state_file() {
  grep -qE '\.noctia|(^|[^[:alnum:]_-])(git-mode?|coauthor)([^[:alnum:]_.-]|$)' <<<"$NORM"
}

# read_only_command: succeed if the command is a plain read (cat, head, tail, grep, ls, wc, sed -n Np) with no shell tricks.
read_only_command() {
  grep -qE '^[[:space:]]*(cat|head|tail|grep|ls|wc|sed[[:space:]]+-n[[:space:]]+["'"'"']?[0-9]+(,[0-9]+)?p["'"'"']?)[[:space:]][^;&|<>$`()\\]*$' <<<"$CMD"
}

# guard_state_file: refuse any attempt to change the mode or co-author file, by Bash or by Write/Edit.
guard_state_file() {
  if is_bash; then
    read_only_command && return 0
    unlock_script_call && deny_unlock
    mentions_state_file && deny_unlock
  elif input_has '"file_path"[[:space:]]*:[[:space:]]*"[^"]*(\.noctia/|git-mode"|coauthor")'; then
    deny_unlock
  fi
  return 0
}

# guard_coauthor: on git commit, the Co-Authored-By trailer must match the saved co-author answer.
guard_coauthor() {
  local file="${CLAUDE_PROJECT_DIR:-$PWD}/.noctia/coauthor" answer="" has=1
  grep -qE "$GIT_COMMIT" <<<"$NORM" || return 0
  [ -f "$file" ] && answer=$(tr -d '[:space:]' < "$file")
  grep -qi 'Co-Authored-By:' <<<"$CMD" && has=0
  case "$answer:$has" in
    yes:0|no:1) return 0 ;;
    yes:1) decide deny "Noctia: co-author answer is yes. Add the two Co-Authored-By lines from the git-workflow skill to the commit message with -m, then retry." ;;
    no:0) decide deny "Noctia: co-author answer is no. Remove every Co-Authored-By line from the commit message, then retry." ;;
    *) decide deny "Noctia: no co-author answer saved. Ask the user whether to credit you as co-author, save it with set-coauthor.sh yes or no (git-workflow step 3), then retry the commit." ;;
  esac
  exit 0
}

# guard_git_command: apply the current mode to a Bash git write command.
guard_git_command() {
  is_bash || return 0
  grep -qE "$GIT_WRITE" <<<"$NORM" || return 0

  case "$(read_mode)" in
    auto)
      guard_coauthor ;;
    ask)
      guard_coauthor
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
