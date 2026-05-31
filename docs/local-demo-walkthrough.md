# Local Demo Walkthrough

This walkthrough uses synthetic data only.

## 1. Start The App

```bash
npm install
npm run dev
```

Open the local URL printed by the server.

## 2. Register A Demo User

Use public-safe sample values:

```text
user id: demo-user
user name: Demo User
```

The app stores runtime data locally under `data/`.

## 3. Try Daily Planning

On the `日入力` screen:

1. Set planned start and end times.
2. Add or edit a project row.
3. Enter a task description using synthetic text.
4. Check project total, annual leave/split time, and difference summary.

## 4. Try Actual Entry

Switch from `Morning / 予定` to `Night / 実績` and enter actual work time. This lets the screen compare planned time and actual time.

## 5. Check Summaries

Use the tabs:

- `日一覧` for daily records.
- `月集計` for month-level project summaries.
- `PJマスタ` for project catalog maintenance.

## 6. Export

Use `Excelエクスポート` only with synthetic local data. The public repository does not include private work logs or runtime databases.
