#!/usr/bin/env bash
# Shared helpers for the scripts that edit the project's .claude/settings.local.json (personal, not committed).
# Source it after setting PROJECT_DIR and SETTINGS_FILE.
# Reading needs only grep and sed. Writing needs jq only to merge into a file that already exists.

# read_setting KEY: print the string value of KEY (top level or inside "env"), or nothing when absent.
read_setting() {
  [ -f "$SETTINGS_FILE" ] || return 0
  grep -o "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" "$SETTINGS_FILE" | head -1 | sed 's/.*:[[:space:]]*"\(.*\)"$/\1/' || true
}

# exclude_from_git: keep the settings file out of git through .git/info/exclude. Safe to repeat; does nothing outside a git repo.
exclude_from_git() {
  local exclude line=".claude/settings.local.json"
  exclude=$(git -C "$PROJECT_DIR" rev-parse --git-path info/exclude 2>/dev/null) || return 0
  case "$exclude" in /*) ;; *) exclude="$PROJECT_DIR/$exclude" ;; esac

  mkdir -p "$(dirname "$exclude")"
  grep -qxF "$line" "$exclude" 2>/dev/null || echo "$line" >> "$exclude"
}

# merge_settings FILTER FRESH HINT: create the file from FRESH, or apply the jq FILTER to it.
# Without jq, an existing file is left alone and HINT says what to change by hand.
merge_settings() {
  local filter="$1" fresh="$2" hint="$3" tmp

  mkdir -p "$(dirname "$SETTINGS_FILE")"
  if [ ! -f "$SETTINGS_FILE" ]; then
    printf '%s\n' "$fresh" > "$SETTINGS_FILE"
    exclude_from_git
    return 0
  fi

  if ! command -v jq >/dev/null 2>&1; then
    echo "jq is not installed, so $SETTINGS_FILE was left untouched. $hint" >&2
    return 1
  fi

  tmp=$(mktemp "$SETTINGS_FILE.XXXXXX")
  if jq "$filter" "$SETTINGS_FILE" > "$tmp"; then
    mv "$tmp" "$SETTINGS_FILE"
  else
    rm -f "$tmp"
    echo "$SETTINGS_FILE is not valid JSON, so it was left untouched." >&2
    return 1
  fi
}

# set_env_setting NAME VALUE: set an environment variable in the "env" block of the settings file.
set_env_setting() {
  merge_settings \
    ".env = ((.env // {}) + {\"$1\": \"$2\"})" \
    "{\"env\":{\"$1\":\"$2\"}}" \
    "Add \"$1\": \"$2\" to its \"env\" block by hand."
}

# set_top_setting KEY VALUE: set a top-level string setting.
set_top_setting() {
  merge_settings ".\"$1\" = \"$2\"" "{\"$1\":\"$2\"}" "Add \"$1\": \"$2\" to it by hand."
}

# unset_top_setting KEY: remove a top-level setting. Nothing to do when there is no settings file.
unset_top_setting() {
  [ -f "$SETTINGS_FILE" ] || return 0
  merge_settings "del(.\"$1\")" "{}" "Remove the \"$1\" line from it by hand."
}
