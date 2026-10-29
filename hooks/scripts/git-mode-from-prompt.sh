#!/usr/bin/env bash
# UserPromptSubmit hook: when the USER types exactly "/noctia:git MODE", set the git mode.
# Only the user can type a prompt, so the model cannot trigger this. Needs bash and jq.
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLAIN='^/noctia:git (locked|ask|auto)$'
EXPANDED='^(<command-message>[^<]*</command-message>[[:space:]]*)?<command-name>/noctia:git</command-name>[[:space:]]*(<command-message>[^<]*</command-message>[[:space:]]*)?<command-args>(locked|ask|auto)</command-args>$'

# trim: read text on stdin, print it without leading or trailing whitespace.
trim() {
  sed -e ':a' -e '$!{N;ba' -e '}' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
}

# extract_mode PROMPT: print the mode when the prompt is exactly the command, else nothing.
extract_mode() {
  if [[ "$1" =~ $PLAIN ]]; then
    echo "${BASH_REMATCH[1]}"
  elif [[ "$1" =~ $EXPANDED ]]; then
    echo "${BASH_REMATCH[3]}"
  fi
}

main() {
  local prompt mode
  command -v jq >/dev/null 2>&1 || exit 0
  prompt=$(jq -r '.prompt // empty' 2>/dev/null | trim) || exit 0
  mode=$(extract_mode "$prompt")
  [ -n "$mode" ] || exit 0
  bash "$SCRIPT_DIR/set-git-mode.sh" "$mode" >/dev/null 2>&1 || exit 0
  jq -nc --arg m "Git mode set to $mode by the user." \
    '{hookSpecificOutput: {hookEventName: "UserPromptSubmit", additionalContext: $m}}'
}

main
