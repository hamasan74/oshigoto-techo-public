# Privacy And Public Source Hygiene

Oshigoto Techo was originally developed as a private local-first workflow tool. The public repository is a sanitized source release.

## What Is Public

- Source code needed to build and run the app.
- Public assets such as icons and screenshots.
- Documentation for setup, maintenance, security, and releases.
- GitHub issues, pull requests, and release notes for public maintenance.

## What Is Not Public

- Runtime databases.
- Generated local files.
- Company-specific setup scripts.
- Private operational notes.
- Customer or workplace material.
- Local helper binaries.
- Credentials, tokens, logs, or personal data.

## Runtime Data

Runtime data is created locally and ignored by Git:

```text
data/
.generated/
```

To use a different database path:

```bash
OSHIGOTO_TECHO_DB_PATH=/path/to/local/oshigoto_techo.duckdb npm run dev
```

## Screenshot Policy

Screenshots committed to this repository must use synthetic data only. The demo screenshots use the synthetic `demo-user` account.

## Release Hygiene Checklist

Before tagging a public release:

- inspect tracked files with `git status` and `git ls-files`
- run the build and high-severity audit checks
- confirm public screenshots contain no private names, tasks, projects, or dates beyond synthetic examples
- document known dependency advisories and release limitations
