#!/usr/bin/env bash
# Choose the model each Noctia agent runs on, or show the choices.
# Usage: set-models.sh show | reset | ROLE=MODEL ...   (run from the project root)
# ROLE: reader, architect, security-reviewer, developer, tester, or lead (the main session).
# MODEL: opus, sonnet, haiku, fable, or default (drop the choice).
# Agent choices go to .noctia/models. The lead's choice goes to the "model" setting of .claude/settings.local.json.
set -eu

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
STATE_DIR="$PROJECT_DIR/.noctia"
STATE_FILE="$STATE_DIR/models"
SETTINGS_FILE="$PROJECT_DIR/.claude/settings.local.json"

AGENTS="reader architect security-reviewer developer tester"
MODELS="opus sonnet haiku fable default"

# shellcheck source=lib-settings.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib-settings.sh"

# in_list WORD LIST: succeed if WORD is one of the space-separated words of LIST.
in_list() {
  case " $2 " in *" $1 "*) return 0 ;; *) return 1 ;; esac
}

# default_model AGENT: print the model written in the agent's own file.
default_model() {
  sed -n 's/^model:[[:space:]]*//p' "$PLUGIN_ROOT/agents/$1.md" | head -1
}

# stored_model AGENT: print the model chosen for the agent, or nothing.
stored_model() {
  [ -f "$STATE_FILE" ] || return 0
  grep "^$1=" "$STATE_FILE" | tail -1 | cut -d= -f2 || true
}

# store_model AGENT MODEL: remember the choice, or drop it when MODEL is default.
store_model() {
  local others
  mkdir -p "$STATE_DIR"
  echo '*' > "$STATE_DIR/.gitignore"
  others=$( { grep -v "^$1=" "$STATE_FILE" 2>/dev/null || true; } )
  { [ -z "$others" ] || echo "$others"; [ "$2" = default ] || echo "$1=$2"; } > "$STATE_FILE"
}

# store_lead MODEL: set the main session's model for next sessions, or drop it when MODEL is default.
store_lead() {
  if [ "$1" = default ]; then unset_top_setting model; else set_top_setting model "$1"; fi
}

# check_choice CHOICE: succeed if CHOICE reads ROLE=MODEL with a known role and model.
check_choice() {
  local role="${1%%=*}" model="${1#*=}"
  if [ "$role" = "$1" ] || { [ "$role" != lead ] && ! in_list "$role" "$AGENTS"; }; then
    echo "Unknown role in '$1'. Roles: lead $AGENTS" >&2; return 1
  fi
  in_list "$model" "$MODELS" || { echo "Unknown model in '$1'. Models: $MODELS" >&2; return 1; }
}

# apply_choice CHOICE: store one ROLE=MODEL choice.
apply_choice() {
  local role="${1%%=*}" model="${1#*=}"
  if [ "$role" = lead ]; then store_lead "$model"; else store_model "$role" "$model"; fi
}

# show_row ROLE CHOSEN DEFAULT: print one line of the table.
show_row() {
  if [ -n "$2" ]; then printf '%-18s %-8s (your choice)\n' "$1" "$2"; else printf '%-18s %-8s (default)\n' "$1" "$3"; fi
}

# show_models: print the model of every role.
show_models() {
  local agent
  show_row lead "$(read_setting model)" "your /model"
  for agent in $AGENTS; do
    show_row "$agent" "$(stored_model "$agent")" "$(default_model "$agent")"
  done
}

# reset_models: drop every choice.
reset_models() {
  rm -f "$STATE_FILE"
  store_lead default
}

main() {
  local choice
  case "${1:-show}" in
    show) ;;
    reset) reset_models ;;
    *)
      for choice in "$@"; do check_choice "$choice" || exit 1; done
      for choice in "$@"; do apply_choice "$choice"; done ;;
  esac
  show_models
}

main "$@"
