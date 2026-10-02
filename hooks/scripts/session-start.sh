#!/usr/bin/env bash
# Session start: inject the Noctia rules and a quick project scan into Claude's context.
# No dependency besides bash, sed, awk, grep and find.
set -u
shopt -s nullglob nocaseglob

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"

# has_any GLOB...: succeed if at least one glob matches an existing path.
has_any() {
  local pattern
  for pattern in "$@"; do
    compgen -G "$pattern" >/dev/null && return 0
  done
  return 1
}

# has_named EXPR...: succeed if find (depth <= 4, vendor dirs skipped) matches any -iname expression.
has_named() {
  local expr=() name
  for name in "$@"; do expr+=(-o -iname "$name"); done
  find . -maxdepth 4 \( -name node_modules -o -name .git -o -name venv -o -name .venv \) -prune \
    -o \( "${expr[@]:1}" \) -print -quit 2>/dev/null | grep -q .
}

# has_python_tool_config: succeed if pyproject.toml configures a linter or formatter.
has_python_tool_config() {
  [ -f pyproject.toml ] && grep -qE '^\[tool\.(ruff|black|flake8|pylint|isort|mypy)' pyproject.toml
}

# scan_project: print one "Found:" line, one "Missing:" line and the detected style configs.
scan_project() {
  local found=() missing=() style=()

  has_any "README*" && found+=(README) || missing+=(README)
  has_any "CONTRIBUTING*" ".github/CONTRIBUTING*" "docs/CONTRIBUTING*" && found+=(CONTRIBUTING) || missing+=(CONTRIBUTING)
  has_named "test" "tests" "__tests__" "*.test.*" "*.spec.*" "test_*.*" "*_test.*" && found+=(tests) || missing+=(tests)
  has_any ".github/workflows/*" ".gitlab-ci.yml" ".circleci/*" "Jenkinsfile" "azure-pipelines.yml" \
    ".drone.yml" "bitbucket-pipelines.yml" && found+=(CI) || missing+=(CI)
  has_any "docs" "doc" && found+=(docs) || missing+=(docs-folder)
  has_any "ARCHITECTURE*" "docs/architecture*" && found+=(architecture-doc) || missing+=(architecture-doc)
  has_any "CHANGELOG*" && found+=(CHANGELOG) || missing+=(CHANGELOG)
  has_any ".gitignore" && found+=(.gitignore) || missing+=(.gitignore)

  has_any ".eslintrc*" "eslint.config.*" ".prettierrc*" "biome.json" ".editorconfig" "ruff.toml" ".ruff.toml" \
    ".flake8" ".pylintrc" ".golangci*" ".rubocop.yml" "rustfmt.toml" ".clang-format" && style+=(config-files)
  has_python_tool_config && style+=(pyproject.toml)

  echo "Found: ${found[*]:-none}"
  echo "Missing: ${missing[*]:-none}"
  echo "Linter/style configs: ${style[*]:-none detected}"
}

# git_summary: print the latest version tag and the current Noctia git mode.
git_summary() {
  local tag mode=""
  tag=$(git describe --tags --abbrev=0 2>/dev/null || echo "none")
  [ -f .noctia/git-mode ] && mode=$(tr -d '[:space:]' < .noctia/git-mode)
  echo "Latest git tag: $tag"
  echo "Noctia git mode: ${mode:-locked}"
}

# project_is_empty: succeed when the directory holds nothing but hidden git/noctia state.
project_is_empty() {
  [ -z "$(ls -A | grep -vE '^(\.git|\.noctia)$')" ]
}

# build_context: assemble the full text injected into the session.
build_context() {
  cat "$PLUGIN_ROOT/rules/core.md"
  echo
  echo "## Noctia project scan (automatic)"
  if project_is_empty; then
    echo "The directory is empty: this is a new project. Propose a minimal structure (tests, CI, docs, README) before coding."
    return
  fi
  scan_project
  git_summary
  echo
  echo "In your first reply, tell the user in 2 to 4 lines what is missing and offer /noctia:audit."
  echo "If CONTRIBUTING was found, read it now and follow it. Do not repeat this report if you already gave it in this session."
}

# json_escape: read text on stdin, write it as the inside of a JSON string.
json_escape() {
  sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/\t/\\t/g' | awk '{printf "%s\\n", $0}'
}

main() {
  cd "$PROJECT_DIR" 2>/dev/null || exit 0
  printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' \
    "$(build_context | json_escape)"
}

main
