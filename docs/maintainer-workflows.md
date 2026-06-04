# Maintainer Workflows

Oshigoto Techo does not replace GitHub Issues, pull requests, or release tooling. It is a local-first companion for recording the daily maintenance work that happens around those systems.

## Useful Maintenance Scenarios

### Issue And Pull Request Triage

Use daily project rows to record time spent on issue triage, reproduction checks, pull request review, and follow-up notes. Planned and actual time can be compared at the end of the day so maintenance load is visible instead of disappearing into ad hoc work.

### Release Preparation

Use day and month summaries to collect the work that went into a release: dependency updates, regression checks, documentation passes, security review, and packaging. The changelog remains in Git, while Oshigoto Techo keeps a local record of the time and task context behind it.

### Local Backup And Export

The browser Excel export gives maintainers a portable backup of their local work log. This is useful for private notes, retrospective summaries, and separating public repository history from private operational records.

### Privacy-Preserving OSS Work

Many maintainers work across public repositories and private environments. Oshigoto Techo is intentionally local-first so private runtime data, operational notes, and helper binaries can stay outside the public source repository while the reusable application code remains reviewable.

## What This Public Edition Demonstrates

- A sanitized source release boundary for a real local-first app.
- A small release process with CI, CodeQL, changelog entries, and GitHub releases.
- Issue triage for dependency advisories and future regression coverage.
- A pattern for keeping private runtime data out of public source snapshots.
