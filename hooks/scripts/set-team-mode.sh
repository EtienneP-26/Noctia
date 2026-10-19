#!/usr/bin/env bash
# Turn Claude Code agent teams on or off for the current project, or show their state.
# Usage: set-team-mode.sh on|off|status   (run from the project root)
# The switch is the CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS variable, written to .claude/settings.local.json.
set -eu

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
SETTINGS_FILE="$PROJECT_DIR/.claude/settings.local.json"
VARIABLE=CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS

# shellcheck source=lib-settings.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib-settings.sh"

# current_mode: print on when this project's setting is 1, otherwise off (the default).
current_mode() {
  if [ "$(read_setting "$VARIABLE")" = 1 ]; then echo on; else echo off; fi
}

# show_status: print the state and what it covers.
show_status() {
  echo "Agent teams: $(current_mode) (this project's setting in .claude/settings.local.json; a user or managed setting can differ)"
}

# turn_on: enable agent teams and warn about what changes.
turn_on() {
  set_env_setting "$VARIABLE" 1
  show_status
  echo "Experimental. While on, every subagent Claude names starts as a teammate (its own session, more tokens), which changes how /noctia:build delegates."
  echo "Teammates need an interactive session. If none appear, restart the session: the team is set up at session start."
}

# turn_off: disable agent teams; named subagents become ordinary subagents again.
turn_off() {
  set_env_setting "$VARIABLE" 0
  show_status
  echo "Named subagents start as ordinary subagents again. No restart needed."
}

main() {
  case "${1:-status}" in
    on) turn_on ;;
    off) turn_off ;;
    status) show_status ;;
    *) echo "Usage: set-team-mode.sh on|off|status" >&2; exit 1 ;;
  esac
}

main "$@"
