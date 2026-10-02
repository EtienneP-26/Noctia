---
name: release-and-deploy
description: Versioning (vX.Y.Z), branches and environments, CI/CD pipeline, changelog and versioned docs. Use when setting up or changing releases, deployment, pipelines, branching, or when the user asks to version or document a release.
---

# Release and deploy

## Find the project's rules first
1. CONTRIBUTING.md, if present, decides. Follow it.
2. Otherwise infer from the history: `git tag --list`, `git branch -a`, `git log --oneline -30` (delegate to `reader` if large).
3. If neither says, **ask the user** before choosing, and give the trade-off for each option.

## Versioning
- Format `vX.Y.Z` (Semantic Versioning): X for breaking changes, Y for new backward-compatible features, Z for fixes.
- Ask the user whether they want that scheme, and whether pre-releases (`v1.2.0-rc.1`) are needed.
- The version lives in one place (manifest such as package.json or pyproject.toml, or the git tag) and the rest derives from it.

## Branches and environments
Propose, then follow what the user picks. A common simple layout:
- `main`: production, always deployable.
- `dev` (or `develop`): integration, deploys to a dev or staging environment.
- Sub-branches from `dev`: `feat/...`, `fix/...`, `chore/...`, merged by pull request.
Trade-off to state: this is simple and safe for a small team; trunk-based development with short branches and feature flags is faster but needs strong CI and discipline.

## CI/CD pipeline
Minimum stages, in order: install, lint, test, build, then deploy (dev automatically, prod on a version tag or manual approval). Use the platform already in the project (GitHub Actions, GitLab CI...). Secrets go in the platform's secret store, never in the pipeline file.

## Changelog and docs
- Keep a `CHANGELOG.md` in the Keep a Changelog style: Added, Changed, Fixed, Removed, per version, newest first.
- Docs describe the current version; when a release changes behavior, update the docs in the same change and mention the version.

## Cutting a release
1. Tests, lint and `security-check` pass.
2. Bump the version, update CHANGELOG and docs.
3. Commit and tag `vX.Y.Z`. Both are git writes: follow the `git-workflow` skill and ask before pushing the tag.
