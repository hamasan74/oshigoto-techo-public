import { formatHoursDecimal, formatMinutesDetailed } from '../input-board';
import type {
  DailyListOutputViewModel,
  MonthlyOutputViewModel,
  ProjectMasterOutputViewModel,
} from './view-model';
import { getMonthlyDayStatusLabel } from './view-model';

export type ExcelCellValue = string | number | boolean | Date | null;
export type ExcelColumnFormat = 'text' | 'date' | 'datetime' | 'hours' | 'minutes' | 'integer' | 'boolean';

export interface ExcelBackupMeta {
  exportedAt: Date;
  userId: string;
  userName: string;
  targetMonth: string;
}

export interface ExcelBackupColumnDefinition {
  key: string;
  header: string;
  width: number;
  format?: ExcelColumnFormat;
  align?: 'left' | 'center' | 'right';
  wrapText?: boolean;
}

export interface ExcelBackupKeyValueRow {
  label: string;
  value: ExcelCellValue;
  format?: ExcelColumnFormat;
}

export interface ExcelBackupKeyValueSection {
  type: 'kv';
  title?: string;
  rows: ExcelBackupKeyValueRow[];
}

export interface ExcelBackupTableRowDefinition {
  values: Record<string, ExcelCellValue>;
  rowKind?: 'default' | 'work' | 'project' | 'aux' | 'kpi' | 'project-summary' | 'project-day' | 'empty';
  outlineLevel?: number;
  groupKey?: string;
}

export interface ExcelBackupTableSection {
  type: 'table';
  title?: string;
  enableAutoFilter?: boolean;
  columns: ExcelBackupColumnDefinition[];
  rows: ExcelBackupTableRowDefinition[];
}

export interface ExcelBackupSheetDefinition {
  name: string;
  title: string;
  description?: string;
  sections: Array<ExcelBackupKeyValueSection | ExcelBackupTableSection>;
}

export interface ExcelBackupWorkbookDefinition {
  fileName: string;
  meta: ExcelBackupMeta;
  sheets: ExcelBackupSheetDefinition[];
}

const excelIllegalTextPattern = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;
const excelIllegalSheetNamePattern = /[:\\/?*\[\]]/g;
const excelIllegalFileNamePattern = /[<>:"/\\|?*]/g;
const japanTimeZone = 'Asia/Tokyo';

function sanitizeExcelFileName(value: string) {
  return sanitizeExcelText(value).replace(excelIllegalFileNamePattern, '_');
}

function formatTargetMonthStamp(targetMonth: string) {
  const match = sanitizeExcelText(targetMonth).match(/(\d{4})\D+(\d{1,2})/);
  if (match) {
    return `${match[1]}${match[2].padStart(2, '0')}`;
  }

  const digits = sanitizeExcelText(targetMonth).replace(/\D/g, '');
  if (digits.length >= 6) {
    return digits.slice(0, 6);
  }

  return digits || '000000';
}

function formatDatePartsInJapan(date: Date) {
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: japanTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

function formatExportedAtStamp(date: Date) {
  const { year, month, day, hour, minute, second } = formatDatePartsInJapan(date);
  return `${year}${month}${day}${hour}${minute}${second}`;
}

function formatExportedAtLabel(date: Date) {
  const { year, month, day, hour, minute, second } = formatDatePartsInJapan(date);
  return `${year}/${month}/${day} ${hour}:${minute}:${second} JST`;
}

export function sanitizeExcelText(value: string) {
  return value.replace(excelIllegalTextPattern, '').trim();
}

export function sanitizeExcelSheetName(value: string, fallback: string) {
  const sanitized = sanitizeExcelText(value).replace(excelIllegalSheetNamePattern, '・').slice(0, 31).trim();
  return sanitized || fallback;
}

function sanitizeWorkbookDefinition(definition: ExcelBackupWorkbookDefinition): ExcelBackupWorkbookDefinition {
  return {
    ...definition,
    fileName: sanitizeExcelFileName(definition.fileName),
    meta: {
      ...definition.meta,
      userId: sanitizeExcelText(definition.meta.userId),
      userName: sanitizeExcelText(definition.meta.userName),
      targetMonth: sanitizeExcelText(definition.meta.targetMonth),
    },
    sheets: definition.sheets.map((sheet, index) => ({
      ...sheet,
      name: sanitizeExcelSheetName(sheet.name, `Sheet${index + 1}`),
      title: sanitizeExcelText(sheet.title),
      description: sheet.description ? sanitizeExcelText(sheet.description) : undefined,
      sections: sheet.sections.map((section) =>
        section.type === 'kv'
          ? {
              ...section,
              title: section.title ? sanitizeExcelText(section.title) : undefined,
              rows: section.rows.map((row) => ({
                ...row,
                label: sanitizeExcelText(row.label),
                value: typeof row.value === 'string' ? sanitizeExcelText(row.value) : row.value,
              })),
            }
          : {
              ...section,
              title: section.title ? sanitizeExcelText(section.title) : undefined,
              columns: section.columns.map((column) => ({
                ...column,
                header: sanitizeExcelText(column.header),
              })),
              rows: section.rows.map((row) => ({
                ...row,
                values: Object.fromEntries(
                  Object.entries(row.values).map(([key, value]) => [
                    key,
                    typeof value === 'string' ? sanitizeExcelText(value) : value,
                  ]),
                ),
              })),
            },
      ),
    })),
  };
}

function buildDailyListSheet(viewModel: DailyListOutputViewModel): ExcelBackupSheetDefinition {
  return {
    name: '日入力一覧',
    title: '日入力一覧',
    sections: [
      {
        type: 'table',
        enableAutoFilter: true,
        columns: [
          { key: 'date', header: '日付', width: 13, format: 'date' },
          { key: 'modeLabel', header: 'モード', width: 10, align: 'center' },
          { key: 'rowTypeLabel', header: '行種別', width: 12, align: 'center' },
          { key: 'startTime', header: '開始', width: 10, align: 'center' },
          { key: 'endTime', header: '終了', width: 10, align: 'center' },
          { key: 'workplaceLabel', header: '場所', width: 14 },
          { key: 'projectCode', header: 'PJコード', width: 16 },
          { key: 'projectName', header: 'PJ名', width: 26, wrapText: true },
          { key: 'taskLabel', header: 'タスク', width: 34, wrapText: true },
          { key: 'durationMinutes', header: '時間(h)', width: 11, format: 'hours', align: 'right' },
          { key: 'comment', header: 'コメント', width: 30, wrapText: true },
        ],
        rows:
          viewModel.rows.length > 0
            ? viewModel.rows.map((row) => ({
                rowKind: row.rowType,
                groupKey: row.date,
                values: {
                  date: new Date(`${row.date}T00:00:00`),
                  modeLabel: row.modeLabel,
                  rowTypeLabel: row.rowTypeLabel,
                  startTime: row.startTime === '00:00' ? '' : row.startTime,
                  endTime: row.endTime === '00:00' ? '' : row.endTime,
                  workplaceLabel: row.workplaceLabel,
                  projectCode: row.projectCode,
                  projectName: row.projectName,
                  taskLabel: row.taskLabel,
                  durationMinutes: row.durationMinutes,
                  comment: row.comment,
                },
              }))
            : [
              {
                rowKind: 'empty',
                values: {
                  date: null,
                  modeLabel: '',
                  rowTypeLabel: '',
                  startTime: '',
                  endTime: '',
                  workplaceLabel: '',
                  projectCode: '',
                  projectName: '対象月の入力はありません',
                  taskLabel: '',
                  durationMinutes: 0,
                  comment: '',
                },
              },
            ],
      },
    ],
  };
}

function buildMonthlySheet(viewModel: MonthlyOutputViewModel): ExcelBackupSheetDefinition {
  const projectRows: ExcelBackupTableRowDefinition[] =
    viewModel.projects.length > 0
      ? viewModel.projects.flatMap((project) => {
          const categoryLabel = project.category ? (project.category === 'direct' ? '直接' : '間接') : '';
          const rows: ExcelBackupTableRowDefinition[] = [
            {
              rowKind: 'project-summary',
              groupKey: project.projectCode,
              values: {
                projectCode: project.projectCode,
                projectNameOrDate: project.projectName,
                rowLabel: 'PJ集計',
                categoryLabel,
                budgetMinutes: project.budgetMinutes,
                actualMinutes: project.actualMinutes,
                landingMinutes: project.landingMinutes,
                differenceMinutes: project.differenceMinutes,
                activeDays: project.activeDays,
                taskSummary: '',
                commentSummary: '',
              },
            },
          ];

          project.actualDayRows.forEach((dayRow) => {
            rows.push({
              rowKind: 'project-day',
              outlineLevel: 1,
              groupKey: project.projectCode,
              values: {
                projectCode: '',
                projectNameOrDate: dayRow.dateLabel,
                rowLabel: '実績日',
                categoryLabel: '',
                budgetMinutes: null,
                actualMinutes: dayRow.actualMinutes,
                landingMinutes: null,
                differenceMinutes: null,
                activeDays: null,
                taskSummary: dayRow.taskSummary,
                commentSummary: dayRow.commentSummary,
              },
            });
          });

          return rows;
        })
      : [
          {
            rowKind: 'empty',
            values: {
              projectCode: '',
              projectNameOrDate: '対象月のPJ実績はありません',
              rowLabel: '',
              categoryLabel: '',
              budgetMinutes: null,
              actualMinutes: null,
              landingMinutes: null,
              differenceMinutes: null,
              activeDays: null,
              taskSummary: '',
              commentSummary: '',
            },
          },
        ];

  return {
    name: '月集計',
    title: '月集計',
    sections: [
      {
        type: 'table',
        title: '月次KPI',
        columns: [
          { key: 'budgetTotalMinutes', header: '計画合計(h)', width: 14, format: 'hours', align: 'right' },
          { key: 'actualTotalMinutes', header: '実績合計(h)', width: 14, format: 'hours', align: 'right' },
          { key: 'landingTotalMinutes', header: '着地見込み(h)', width: 14, format: 'hours', align: 'right' },
          { key: 'differenceMinutes', header: '差分(h)', width: 11, format: 'hours', align: 'right' },
          { key: 'overtimeMinutes', header: 'FT清算時間(h)', width: 15, format: 'hours', align: 'right' },
          { key: 'attentionDays', header: '要確認日数', width: 12, format: 'integer', align: 'right' },
        ],
        rows: [
          {
            rowKind: 'kpi',
            values: {
              budgetTotalMinutes: viewModel.totals.budgetTotalMinutes,
              actualTotalMinutes: viewModel.totals.actualTotalMinutes,
              landingTotalMinutes: viewModel.totals.landingTotalMinutes,
              differenceMinutes: viewModel.totals.landingTotalMinutes - viewModel.totals.budgetTotalMinutes,
              overtimeMinutes: viewModel.totals.overtimeMinutes,
              attentionDays: viewModel.totals.attentionDays,
            },
          },
        ],
      },
      {
        type: 'table',
        title: 'PJ別サマリ（実績日ドリルダウン）',
        enableAutoFilter: true,
        columns: [
          { key: 'projectCode', header: 'PJコード', width: 16 },
          { key: 'projectNameOrDate', header: 'PJ名 / 実績日', width: 28, wrapText: true },
          { key: 'rowLabel', header: '行種別', width: 10, align: 'center' },
          { key: 'categoryLabel', header: '区分', width: 10, align: 'center' },
          { key: 'budgetMinutes', header: '計画(h)', width: 11, format: 'hours', align: 'right' },
          { key: 'actualMinutes', header: '実績(h)', width: 11, format: 'hours', align: 'right' },
          { key: 'landingMinutes', header: '着地(h)', width: 11, format: 'hours', align: 'right' },
          { key: 'differenceMinutes', header: '差分(h)', width: 11, format: 'hours', align: 'right' },
          { key: 'activeDays', header: '稼働日数', width: 10, format: 'integer', align: 'right' },
          { key: 'taskSummary', header: 'タスク概要', width: 34, wrapText: true },
          { key: 'commentSummary', header: 'コメント', width: 24, wrapText: true },
        ],
        rows: projectRows,
      },
    ],
  };
}

function buildProjectMasterSheet(viewModel: ProjectMasterOutputViewModel): ExcelBackupSheetDefinition {
  return {
    name: 'PJマスタ一覧',
    title: 'PJマスタ一覧',
    sections: [
      {
        type: 'table',
        enableAutoFilter: true,
        columns: [
          { key: 'projectCode', header: 'PJコード', width: 16 },
          { key: 'projectName', header: 'PJ名', width: 28, wrapText: true },
          { key: 'categoryLabel', header: '区分', width: 10, align: 'center' },
          { key: 'isActiveLabel', header: '有効状態', width: 10, align: 'center' },
          { key: 'pinnedLabel', header: 'ピン留め', width: 10, align: 'center' },
          { key: 'defaultPlaceLabel', header: '標準場所', width: 12, align: 'center' },
          { key: 'defaultTaskName', header: '代表作業', width: 22, wrapText: true },
          { key: 'representativeTaskCandidatesLabel', header: '代表作業候補', width: 30, wrapText: true },
          { key: 'monthlyBudgetMinutes', header: '今月計画(h)', width: 12, format: 'hours', align: 'right' },
          { key: 'monthlyActualMinutes', header: '今月実績(h)', width: 12, format: 'hours', align: 'right' },
          { key: 'needsCommentLabel', header: 'コメント', width: 10, align: 'center' },
          { key: 'aliasesLabel', header: '別名', width: 24, wrapText: true },
        ],
        rows: viewModel.rows.map((row) => ({
          rowKind: 'default',
          values: {
            projectCode: row.projectCode,
            projectName: row.projectName,
            categoryLabel: row.categoryLabel,
            isActiveLabel: row.isActiveLabel,
            pinnedLabel: row.pinnedLabel,
            defaultPlaceLabel: row.defaultPlaceLabel,
            defaultTaskName: row.defaultTaskName,
            representativeTaskCandidatesLabel: row.representativeTaskCandidatesLabel,
            monthlyBudgetMinutes: row.monthlyBudgetMinutes,
            monthlyActualMinutes: row.monthlyActualMinutes,
            needsCommentLabel: row.needsCommentLabel,
            aliasesLabel: row.aliasesLabel,
          },
        })),
      },
    ],
  };
}

export function buildExcelBackupWorkbookDefinition(params: {
  meta: ExcelBackupMeta;
  dailyList: DailyListOutputViewModel;
  monthly: MonthlyOutputViewModel;
  projectMaster: ProjectMasterOutputViewModel;
}): ExcelBackupWorkbookDefinition {
  const { meta, dailyList, monthly, projectMaster } = params;
  const safeUserId = meta.userId.trim() || 'anonymous';
  const targetMonthStamp = formatTargetMonthStamp(meta.targetMonth);
  const exportedAtStamp = formatExportedAtStamp(meta.exportedAt);

  return sanitizeWorkbookDefinition({
    fileName: `【oshigoto-techo】勤怠情報_${safeUserId}_${targetMonthStamp}_${exportedAtStamp}.xlsx`,
    meta,
    sheets: [
      buildDailyListSheet(dailyList),
      buildMonthlySheet(monthly),
      buildProjectMasterSheet(projectMaster),
    ],
  });
}

export function buildExcelMetaRows(meta: ExcelBackupMeta): ExcelBackupKeyValueRow[] {
  return [
    { label: '出力日時', value: meta.exportedAt, format: 'datetime' },
    { label: 'userId', value: meta.userId || '未設定' },
    { label: 'userName', value: meta.userName || '未設定' },
    { label: '対象月', value: meta.targetMonth },
  ];
}

export function formatHoursForExcelSummary(minutes: number | null) {
  return minutes === null ? '--' : formatHoursDecimal(minutes);
}

export function formatMinutesForExcelSummary(minutes: number | null) {
  return formatMinutesDetailed(minutes);
}
