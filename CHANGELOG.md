# Changelog

All notable changes to this project are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.6.3] - 2026-11-05

### Fixed
- Git guard: `git add`, `git diff` or a commit naming the git mode scripts is no longer blocked. Writing the mode file or running the mode script with a mode is still denied.

## [0.6.2] - 2026-11-05

### Changed
- Git: each change to `ask` or `auto` resets the co-author answer, and Noctia asks again with its co-author lines. `locked` keeps it.

## [0.6.1] - 2026-11-05

### Fixed
- Noctia graph: wide and hidden characters, bad counts and cycles no longer break the pane.
- Task briefs: no test files in the template, no repo-wide commands in parallel waves.

## [0.6.0] - 2026-11-04

### Added
- Noctia graph: a side pane showing the live agents as a node graph. It opens on the first agent launch or with `/graph`.
- Build waves: `/noctia:build` runs up to 3 developers in parallel, each on separate files, with `W<wave>·T<task>` briefs.

### Changed
- Strict KISS rules in `rules/core.md`.

## [0.5.0]

Earlier releases: see git tags.
