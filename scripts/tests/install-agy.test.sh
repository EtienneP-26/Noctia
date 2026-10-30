#!/usr/bin/env bash
# Tests for scripts/install-agy.sh. Run: bash scripts/tests/install-agy.test.sh
set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
INSTALL="$ROOT/scripts/install-agy.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
FAILED=0
S=".gemini/antigravity-cli/settings.json"

# check NAME CONDITION...: run the condition, report and count a failure.
check() {
  local name=$1; shift
  if "$@"; then echo "ok   $name"; else echo "FAIL $name"; FAILED=1; fi
}

# fresh NAME CONTENT: make a fake home with CONTENT as settings (none when empty arg is -).
fresh() {
  H="$TMP/$1"; mkdir -p "$H/.gemini/antigravity-cli"
  [ "$2" = - ] || printf '%s' "$2" > "$H/$S"
}

# fake_agy: make a bin dir with an agy that creates the plugin dir under $HOME.
fake_agy() {
  mkdir -p "$TMP/bin"
  cat > "$TMP/bin/agy" <<'EOS'
#!/usr/bin/env bash
d="$HOME/.gemini/config/plugins/noctia/statusline"
mkdir -p "$d" && : > "$d/noctia-status.sh"
EOS
  chmod +x "$TMP/bin/agy"
}
fake_agy

# run HOME ARGS...: run the installer with a fake HOME and the fake agy first on PATH.
run() { local h=$1; shift; HOME="$h" PATH="$TMP/bin:$PATH" bash "$INSTALL" "$@" 2>&1 < /dev/null; }

# run_noagy HOME ARGS...: run the installer with a PATH that has no agy.
run_noagy() { local h=$1; shift; HOME="$h" PATH="$(dirname "$(command -v jq)"):/usr/bin:/bin" bash "$INSTALL" "$@" 2>&1 < /dev/null; }

test_yes_merges_and_backs_up() {
  fresh a '{"theme":"dark","statusLine":{"type":"old"}}'
  run "$H" --yes >/dev/null
  jq -e '.theme == "dark" and .statusLine.type == "command" and .statusLine.stack_with_default == false
    and (.statusLine.command | contains("noctia-status.sh"))' "$H/$S" >/dev/null \
    && [ "$(ls "$H"/.gemini/antigravity-cli/settings.json.bak-* | wc -l)" = 1 ] \
    && jq -e '.statusLine.type == "old"' "$H"/.gemini/antigravity-cli/settings.json.bak-* >/dev/null
}

test_creates_missing_file() { fresh b -; rm -rf "$H/.gemini"; run "$H" --yes >/dev/null; jq -e '.statusLine.type == "command"' "$H/$S" >/dev/null; }

test_invalid_json_refused() {
  fresh c 'not json'
  run "$H" --yes | grep -q 'not a valid JSON'
  [ "$(cat "$H/$S")" = 'not json' ] && ! ls "$H"/.gemini/antigravity-cli/settings.json.bak-* >/dev/null 2>&1
}

test_no_statusline_untouched() {
  fresh d '{"a":1}'
  run "$H" --yes --no-statusline >/dev/null
  [ "$(cat "$H/$S")" = '{"a":1}' ] && ! ls "$H"/.gemini/antigravity-cli/settings.json.bak-* >/dev/null 2>&1
}

test_no_answer_untouched() { fresh e '{"a":1}'; run "$H" >/dev/null; [ "$(cat "$H/$S")" = '{"a":1}' ]; }

test_agy_absent_prints_command() {
  fresh f -
  run_noagy "$H" --no-statusline | grep -q "agy plugin install $ROOT/agy"
}

test_agy_missing_settings_untouched() {
  fresh g '{"a":1}'
  run_noagy "$H" --yes | grep -q 'Status line not changed'
  [ "$(cat "$H/$S")" = '{"a":1}' ]
}

for t in $(declare -F | awk '$3 ~ /^test_/ {print $3}'); do check "$t" "$t"; done
exit $FAILED
