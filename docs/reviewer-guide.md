# Reviewer Guide

This guide is for maintainers, reviewers, and program reviewers who want to understand the public source edition quickly.

## What This Project Is

Oshigoto Techo is a local-first work log and planning app. It helps users capture daily plans, actual work, split time, project totals, and month summaries in one interface.

The public repository is a sanitized source release. It is intended to show the application code, maintenance workflow, and public-source hygiene boundary without exposing private runtime data.

## Why It Exists

Daily work logging often becomes slow because planning, actual time entry, project totals, handoff notes, and exports live in different tools. Oshigoto Techo keeps those workflows close together and stores work data locally by default.

## What To Review First

1. [README.md](../README.md) for the feature summary and screenshot.
2. [docs/architecture.md](architecture.md) for the app shape and data boundary.
3. [docs/privacy.md](privacy.md) for the public/private source split.
4. [docs/maintenance.md](maintenance.md) for issue, PR, dependency, and release handling.
5. [SECURITY.md](../SECURITY.md) for vulnerability and public-source hygiene policy.

## Quick Local Run

```bash
npm install
npm run dev
```

Open the local URL printed by the server. Register a synthetic user such as:

```text
user id: demo-user
user name: Demo User
```

This creates local runtime data under `data/`, which is ignored by Git.

## Useful Review Paths

- Create a synthetic user and open the daily input board.
- Set planned start/end times and add a project row.
- Switch between Morning and Night modes.
- Open month summary and project master screens.
- Run an Excel export using synthetic data only.

## Maintenance Signals

The repository intentionally exposes the maintenance workflow:

- CI runs production build and high-severity dependency audit.
- CodeQL runs JavaScript/TypeScript code scanning.
- Dependabot opens dependency update pull requests.
- Releases document public source snapshots.
- Issues track release, dependency, documentation, and regression work.
- PR template and CODEOWNERS document review expectations.

## Current Known Limitations

- Public usage metrics are new because the repository was recently opened.
- The app is local-first and not hosted as a public SaaS service.
- One moderate transitive dependency advisory remains tracked because the forced fix is a breaking dependency change.
