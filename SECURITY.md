# Security Policy

Oshigoto Techo is a local-first app. The public repository is intentionally scoped to source code, documentation, and public assets. Private runtime data, operational notes, helper binaries, and local databases are not part of this repository.

## Supported Versions

| Version | Supported |
| --- | --- |
| 0.1.x | Yes |

## Reporting A Vulnerability

Please do not open a public issue for a vulnerability that could expose private data or exploit details.

Use GitHub Security Advisories when available, or contact the maintainer through the GitHub profile. Include:

- affected area or file
- reproduction steps
- expected impact
- suggested fix, if known

The maintainer will triage reports for:

- local storage and IndexedDB data handling
- import/export and Excel workbook generation
- server-side persistence boundaries
- dependency vulnerabilities
- accidental inclusion of private files or helper binaries

## Public Source Hygiene

Before each public release, the maintainer checks that the repository does not include:

- runtime databases or generated local data
- company-specific setup scripts or operational notes
- private documents, screenshots, logs, or credentials
- packaged helper binaries
- secrets in tracked files or commit history

## Dependency Policy

High-severity dependency findings should be fixed before release. Moderate findings are triaged by exploitability and upgrade risk, especially when a fix requires a breaking dependency change.

The current public release gate is `npm run build`, `npm audit --audit-level=high`, and successful CodeQL analysis. Medium advisories that cannot be patched without a breaking or regressive dependency change are kept open with issue triage notes until a compatible upgrade path is available.
