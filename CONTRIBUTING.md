# Contributing

Thanks for taking a look at Oshigoto Techo.

This repository is a sanitized public source edition of a local-first productivity app. Contributions should keep the public edition safe, reproducible, and free of private operational data.

## Local Setup

```bash
npm install
npm run dev
```

For release checks:

```bash
npm run build
npm audit --audit-level=high
```

## Contribution Scope

Good contributions include:

- documentation and onboarding improvements
- accessibility and keyboard-flow fixes
- local-first storage improvements
- import/export safety checks
- dependency maintenance
- small UI quality fixes that do not require private data

Please do not contribute:

- private runtime databases or generated local data
- company-specific setup scripts or notes
- helper binaries or packaged local automation tools
- credentials, tokens, logs, customer material, or personal data

## Issue Triage

Issues are triaged into:

- `bug`: user-visible defect or regression
- `documentation`: README, setup, or maintenance docs
- `maintenance`: dependency, CI, release, or repository hygiene work
- `enhancement`: scoped product improvement
- `good first issue`: small, low-risk entry point

The maintainer prioritizes issues that improve public-source safety, reproducibility, and release quality.

## Pull Requests

Before opening a pull request:

1. Keep the change small and focused.
2. Run `npm run build`.
3. Run `npm audit --audit-level=high`.
4. Explain what changed and how it was checked.

Security-sensitive fixes should follow `SECURITY.md` instead of public issue discussion.
