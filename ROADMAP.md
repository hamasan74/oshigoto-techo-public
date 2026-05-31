# Roadmap

This roadmap tracks maintenance work for the public source edition. It is intentionally conservative and focused on repository health, local-first safety, and reproducible releases.

## 0.1.x Maintenance

- Expand the public screenshots into a short walkthrough.
- Expand setup documentation for first-time local runs.
- Keep CI passing for TypeScript and production builds.
- Triage dependency advisories and document upgrade decisions.
- Add regression coverage around import/export and local storage boundaries.

## Public Source Hygiene

- Keep private runtime data out of tracked files.
- Keep helper binaries and local operational scripts outside the public edition.
- Review release diffs before tagging.
- Maintain issue labels for bugs, documentation, maintenance, and good first issues.

## Future Ideas

- Improve keyboard navigation in daily entry flows.
- Add safer sample data for screenshots and onboarding.
- Document backup and restore workflows.
- Split large export-related bundles when it becomes worth the complexity.
