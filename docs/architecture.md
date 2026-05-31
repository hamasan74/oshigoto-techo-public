# Architecture

Oshigoto Techo is a small local-first work log application. The public edition keeps the architecture intentionally simple so the app can be run and reviewed without private infrastructure.

## Runtime Shape

```text
Browser UI
  React + TypeScript + Vite
  IndexedDB/browser cache helpers
  Excel workbook export

Local Node server
  static app hosting
  DuckDB persistence
  optional local mail-draft integration

Local data directory
  ignored by Git
  created at runtime
```

## Main Areas

- `src/screens/` contains the primary app screens.
- `src/components/` contains reusable UI sections such as daily input, project master, and user panels.
- `src/storage/` contains local-first persistence adapters.
- `src/lib/output/` contains mail, view-model, and Excel export helpers.
- `server/` contains the local Node server and DuckDB repository layer.

## Data Boundary

The application is designed to keep work-log data local by default.

- Runtime data is written under `data/` unless `OSHIGOTO_TECHO_DB_PATH` is set.
- `data/` is ignored by Git and is not part of the public source release.
- Screenshots and examples in the public repository use synthetic data only.
- Private operational notes and helper binaries are intentionally excluded.

## Public Edition Boundary

The public repository is source-only. It includes the code needed to build and run the app, but excludes:

- runtime databases
- generated artifacts
- customer or company-specific material
- local machine scripts
- packaged helper binaries

This boundary is documented in `SECURITY.md` and checked before public releases.
