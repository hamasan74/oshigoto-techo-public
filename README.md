# Oshigoto Techo

Oshigoto Techo is a local-first work log and planning app built with React and Vite.

It focuses on making daily time entry faster: planned work, actual work, breaks, split time, project totals, and month-level summaries are kept in one small PWA-style interface.

This public edition is a sanitized source release. It does not include private databases, worktree operations notes, company-specific setup scripts, generated files, or local helper binaries.

## Features

- Daily plan and actual entry views
- Project-based time details with 15-minute increments
- Break and split-time tracking
- Month summary by project
- Project master maintenance
- Local-first storage through the bundled server
- Excel backup export from the browser
- PWA manifest and service worker assets

## Tech Stack

- React
- Vite
- TypeScript
- DuckDB server-side persistence
- ExcelJS for workbook export

## Getting Started

```bash
npm install
npm run dev
```

Then open the local URL printed by the server.

For a production build:

```bash
npm run build
npm run preview
```

## Data And Privacy

Runtime data is stored locally under `data/` by default. The `data/` directory is ignored by Git and is intentionally not included in this repository.

If you need a different storage location, set `OSHIGOTO_TECHO_DB_PATH` before starting the server.

## Public Edition Notes

The private working repository contains additional operational notes, local machine scripts, generated artifacts, and private runtime data. Those files were intentionally excluded from this public edition.

The HTML mail helper binary package is also excluded. The app can still fall back to browser-based mail composition.

## License

MIT
