#!/usr/bin/env bash
# PreToolUse guard for Write/Edit: stop hard-coded secrets before they land in a file.
# Known key formats are denied; generic "password = 'literal'" patterns ask the user.
# Reads the hook JSON on stdin; needs only bash, sed and grep.
set -u

# Undo JSON quote escaping so the patterns can use plain quotes.
INPUT=$(cat | sed 's/\\"/"/g')

KNOWN_KEYS='AKIA[0-9A-Z]{16}|-----BEGIN ([A-Z]+ )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{20,}|(^|[^[:alnum:]])sk-[A-Za-z0-9_-]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}'
GENERIC_LITERAL='(password|passwd|secret|api[_-]?key|token|private[_-]?key)[A-Za-z0-9_]*["'"'"']?[[:space:]]*[:=][[:space:]]*["'"'"'][^"'"'"'$\{[:space:]]{8,}["'"'"']'
EXAMPLE_FILE='"file_path"[[:space:]]*:[[:space:]]*"[^"]*\.env\.(example|sample|template)"'

# decide DECISION REASON: print the PreToolUse permission decision as JSON. Reason must contain no quotes.
decide() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"%s","permissionDecisionReason":"%s"}}\n' "$1" "$2"
}

main() {
  grep -qE "$EXAMPLE_FILE" <<<"$INPUT" && exit 0

  if grep -qE "$KNOWN_KEYS" <<<"$INPUT"; then
    decide deny "Noctia: this looks like a real API key or private key. Never hard-code secrets: read it from an environment variable or a secrets manager."
  elif grep -qiE "$GENERIC_LITERAL" <<<"$INPUT"; then
    decide ask "Noctia: a secret-like value seems hard-coded. Approve only if it is a harmless test value; otherwise use an environment variable."
  fi
}

main
