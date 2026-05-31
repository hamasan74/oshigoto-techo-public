# Maintenance Notes

This document describes how the public edition is maintained.

## Triage Flow

Issues are triaged by impact:

1. Security, privacy, or public-source hygiene problems.
2. Build, install, or release blockers.
3. Data integrity issues in local storage, import, export, or summaries.
4. Documentation, onboarding, and accessibility improvements.
5. Small product enhancements.

Labels used for triage:

- `bug`
- `documentation`
- `maintenance`
- `dependencies`
- `release`
- `enhancement`
- `good first issue`

## Pull Request Review

Pull requests should be small enough to review quickly and should include:

- what changed
- why it changed
- how it was checked
- whether it touches local data, import/export, or private-source boundaries

The repository includes a pull request template and CODEOWNERS file so review expectations are visible before a change is merged.

Dependency pull requests are reviewed with the same release gate:

```bash
npm run build
npm audit --audit-level=high
```

CodeQL also runs on pushes, pull requests, and a weekly schedule for JavaScript and TypeScript code scanning.

## Dependency Advisory Triage

The public repository has Dependabot alerts, weekly Dependabot version updates, secret scanning, push protection, CI, and CodeQL enabled.

As of the 0.1.7 release, the only open Dependabot alert is the medium `uuid` advisory inherited through `exceljs@4.4.0`. Dependabot reports the security update as not currently resolvable because `exceljs@4.4.0` requires `uuid@^8.3.0`, while the non-vulnerable `uuid` line starts at 14.0.0. The automated npm fix path would downgrade ExcelJS, so the issue remains tracked for an export-stack review rather than a forced breaking change.

The `uuid` semver-major Dependabot update is ignored in `.github/dependabot.yml` until the export stack can move to a compatible Excel workbook library or an ExcelJS release supports a patched `uuid` line. The alert remains visible through GitHub Dependabot alerts and issue triage.

## Release Flow

For each public release:

1. Review tracked files for private data, generated artifacts, helper binaries, and operational notes.
2. Run the release checks locally.
3. Confirm CI is green on `main`.
4. Update `CHANGELOG.md`.
5. Tag the release and publish GitHub release notes.
6. Keep a release checklist issue open for the next release.

## Known Maintenance Items

- Add public-safe screenshots and onboarding docs.
- Add regression coverage for local storage and export boundaries.
- Keep dependency advisories triaged without forcing breaking updates.
- Document accepted limitations in release notes.
- Keep reviewer-facing docs current as public workflows evolve.
