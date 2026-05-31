# Changelog

All notable changes to this public edition are documented here.

## [0.1.9] - 2026-05-31

### Changed

- Merged the reviewed Dependabot patch update for `@duckdb/node-api`.

## [0.1.8] - 2026-05-31

### Changed

- Documented and configured the unresolved ExcelJS/uuid semver-major advisory path to avoid repeated non-actionable Dependabot update failures.

## [0.1.7] - 2026-05-31

### Documentation

- Documented Dependabot security update status and the remaining ExcelJS/uuid advisory triage.

## [0.1.6] - 2026-05-31

### Security

- Replaced non-cryptographic UI ID randomness with Web Crypto-backed IDs.
- Replaced regexp-based HTML tag filtering in the Wikipedia fact parser with a bounded tag scanner.

## [0.1.5] - 2026-05-31

### Changed

- Replaced floating `latest` dependency ranges with explicit semver ranges for reproducible public installs.

## [0.1.4] - 2026-05-31

### Changed

- Updated GitHub Actions checkout and setup-node actions to v6 to remove Node 20 runtime deprecation annotations.

## [0.1.3] - 2026-05-31

### Changed

- Added GitHub Actions Node 24 opt-in for CI and CodeQL workflows.

## [0.1.2] - 2026-05-31

### Added

- Pull request template, CODEOWNERS, and CodeQL workflow for visible review and security maintenance.
- Reviewer guide, local demo walkthrough, and support policy documentation.
- GitHub milestones for near-term maintenance and public usability planning.

### Changed

- Merged reviewed Dependabot patch updates for React DOM, Vite, and Vite React plugin.
- Expanded README trust signals with CodeQL, release, reviewer, and support links.

## [0.1.1] - 2026-05-31

### Added

- Public-safe demo screenshots using synthetic `demo-user` data.
- Architecture, maintenance, and privacy hygiene documentation.
- README links to public maintenance docs.

### Changed

- Replaced personal example placeholders in the user setup dialog with generic demo values.
- Merged reviewed Dependabot patch updates for React and TypeScript typings.

## [0.1.0] - 2026-05-31

### Added

- Initial sanitized public source release.
- React/Vite local-first work log interface.
- Daily planning, actual work entry, break tracking, and project totals.
- Month summary and project master maintenance flows.
- Browser-based Excel backup export.
- Public README, MIT license, and source-only release boundary.

### Security

- Excluded private databases, generated files, operational notes, local helper binaries, and company-specific scripts from the public repository.
- Started the public repository from a clean single-commit history.
