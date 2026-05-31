import {
  calculateInputBoardMetrics,
  calculateMonthlySummary,
  calculateTimeRangeMinutes,
  calculateTimeRangeMinutesExcludingLunch,
  collectInputBoardWarnings,
  buildModeWorkplaceSummary,
  categoryLabels,
  formatHoursDecimal,
  getEntryPlaceDisplayLabel,
  getAuxTypeLabel,
  getModeInputStatus,
  getModeAnnualLeaveBaseType,
  hasProjectEntryContentForMode,
  isProjectCatalogItemActive,
  isAnnualLeaveBaseType,
  isAuxRangeType,
  normalizeProjectCode,
  placeLabels,
  toTimeMinutes,
  type MonthlySummary,
} from '../input-board';
import type {
  AuxTimeEntry,
  EntryMode,
  InputBoardDraft,
  ProjectCatalogItem,
  ProjectCategory,
  ProjectEntry,
} from '../../types/input-board';

export interface OutputWorkTimeRange {
  startTime: string;
  endTime: string;
  label: string;
}

export interface OutputWorkInfo {
  phaseLabel: string;
  workplaceLabel: string;
  plannedTime: OutputWorkTimeRange;
  actualTime: OutputWorkTimeRange;
}

export interface OutputTaskRow {
  date: string;
  dateLabel: string;
  projectCode: string;
  projectName: string;
  planTaskName: string;
  actualTaskName: string;
  taskLabel: string;
  planMinutes: number;
  actualMinutes: number;
  planHoursLabel: string;
  actualHoursLabel: string;
  planNote: string;
  actualNote: string;
  needsComment: boolean;
  workplaces: {
    plan: string;
    actual: string;
  };
}

export interface OutputCommentRow {
  projectCode: string;
  projectName: string;
  needsComment: boolean;
  planComment: string;
  actualComment: string;
  commentLabel: string;
}

export interface DailyOutputViewModel {
  scope: 'daily';
  date: string;
  dateLabel: string;
  userName: string;
  currentMode?: EntryMode;
  workInfo: OutputWorkInfo;
  taskRows: OutputTaskRow[];
  commentRows: OutputCommentRow[];
  totals: {
    planMinutes: number;
    actualMinutes: number;
  };
}

export interface DailyListOutputRow {
  date: string;
  dateLabel: string;
  mode: EntryMode;
  modeLabel: string;
  rowType: 'work' | 'project' | 'aux';
  rowTypeLabel: string;
  startTime: string;
  endTime: string;
  workplaceLabel: string;
  projectCode: string;
  projectName: string;
  taskLabel: string;
  durationMinutes: number;
  durationHours: number;
  durationHoursLabel: string;
  comment: string;
}

export interface DailyListOutputViewModel {
  scope: 'daily-list';
  monthKey: string;
  monthLabel: string;
  rows: DailyListOutputRow[];
  totals: {
    workingDayCount: number;
    rowCount: number;
    projectRowCount: number;
    auxRowCount: number;
    planMinutes: number;
    actualMinutes: number;
  };
}

export interface TimesheetTransferProjectRow {
  order: number;
  projectCode: string;
  projectName: string;
  timesheetProjectLabel: string;
  dropdownLabel: string;
  taskLabel: string;
  durationMinutes: number;
  durationHoursLabel: string;
  placeLabel: string;
  timeRangeLabel: string;
  comment: string;
  selectionStartPercent: number;
  selectionWidthPercent: number;
  selectionNotice: string | null;
}

export interface TimesheetTransferAuxRow {
  order: number;
  typeLabel: string;
  timeRangeLabel: string;
  durationHoursLabel: string;
  note: string;
}

export interface TimesheetTransferSelectableSegment {
  order: number;
  startTime: string;
  endTime: string;
  label: string;
  durationHoursLabel: string;
  leftPercent: number;
  widthPercent: number;
}

export interface TimesheetTransferExcludedBlock {
  order: number;
  typeLabel: string;
  startTime: string;
  endTime: string;
  label: string;
  durationHoursLabel: string;
}

export interface TimesheetTransferViewModel {
  scope: 'timesheet-transfer';
  date: string;
  dateLabel: string;
  monthLabel: string;
  mode: EntryMode;
  modeLabel: string;
  statusLabel: string;
  annualLeaveLabel: string | null;
  workplaceLabel: string;
  startTime: string;
  endTime: string;
  startTimeInputLabel: string;
  endTimeInputLabel: string;
  workTimeLabel: string;
  lunchHoursLabel: string;
  splitHoursLabel: string;
  breakHoursLabel: string;
  allocationHoursLabel: string;
  differenceHoursLabel: string;
  selectableHoursLabel: string;
  excludedHoursLabel: string;
  availableSegments: TimesheetTransferSelectableSegment[];
  excludedBlocks: TimesheetTransferExcludedBlock[];
  projectRows: TimesheetTransferProjectRow[];
  auxRows: TimesheetTransferAuxRow[];
  warnings: string[];
}

export interface MonthlyOutputDayRow {
  date: string;
  status: MonthlySummary['days'][number]['status'];
  isFuture: boolean;
  differenceMinutes: number | null;
  overtimeMinutes: number;
  warningCount: number;
  planAllocationMinutes: number;
  actualAllocationMinutes: number;
}

export interface MonthlyOutputProjectRow {
  projectCode: string;
  projectName: string;
  category: ProjectCategory | null;
  budgetMinutes: number;
  actualMinutes: number;
  landingMinutes: number;
  differenceMinutes: number;
  activeDays: number;
  actualDayRows: MonthlyOutputProjectActualDayRow[];
}

export interface MonthlyOutputProjectActualDayRow {
  date: string;
  dateLabel: string;
  actualMinutes: number;
  actualHoursLabel: string;
  taskSummary: string;
  commentSummary: string;
}

export interface MonthlyOutputViewModel {
  scope: 'monthly';
  monthLabel: string;
  totals: {
    budgetTotalMinutes: number;
    actualTotalMinutes: number;
    landingTotalMinutes: number;
    overtimeMinutes: number;
    attentionDays: number;
  };
  days: MonthlyOutputDayRow[];
  projects: MonthlyOutputProjectRow[];
}

export interface ProjectMasterOutputRow {
  projectCode: string;
  projectName: string;
  category: ProjectCategory;
  categoryLabel: string;
  isActive: boolean;
  isActiveLabel: string;
  pinned: boolean;
  pinnedLabel: string;
  defaultPlaceLabel: string;
  defaultTaskName: string;
  representativeTaskCandidates: string[];
  representativeTaskCandidatesLabel: string;
  aliasesLabel: string;
  needsComment: boolean;
  needsCommentLabel: string;
  monthlyBudgetMinutes: number;
  monthlyBudgetHoursLabel: string;
  monthlyActualMinutes: number;
  monthlyActualHoursLabel: string;
}

export interface ProjectMasterOutputViewModel {
  scope: 'project-master';
  monthLabel: string;
  rows: ProjectMasterOutputRow[];
  totals: {
    projectCount: number;
    activeCount: number;
    pinnedCount: number;
    commentRequiredCount: number;
  };
}

const modeLabels: Record<EntryMode, string> = {
  plan: '予定',
  actual: '実績',
};

const monthlyDayStatusLabels: Record<MonthlySummary['days'][number]['status'], string> = {
  empty: '未入力',
  partial: '入力途中',
  done: '入力済み',
};

function formatOutputDate(date: string) {
  const current = new Date(`${date}T00:00:00`);
  return `${current.getFullYear()}/${current.getMonth() + 1}/${current.getDate()}`;
}

function formatOutputTime(value: string) {
  return value.trim() || '00:00';
}

function formatOutputHours(minutes: number) {
  return (minutes / 60).toFixed(2).replace(/\.?0+$/, '') || '0';
}

function buildAuxSummaryParts(params: {
  annualLeaveBaseType: ReturnType<typeof getModeAnnualLeaveBaseType>;
  annualHourMinutes: number;
  splitMinutes: number;
  breakMinutes: number;
}) {
  const labels: string[] = [];

  if (params.annualLeaveBaseType) {
    labels.push(getAuxTypeLabel(params.annualLeaveBaseType));
  }

  if (params.annualHourMinutes > 0) {
    labels.push(`1H休${formatOutputHours(params.annualHourMinutes)}h`);
  }

  if (params.splitMinutes > 0) {
    labels.push(`分断${formatOutputHours(params.splitMinutes)}h`);
  }

  if (params.breakMinutes > 0) {
    labels.push(`休憩${formatOutputHours(params.breakMinutes)}h`);
  }

  return labels;
}

function formatAuxLabel(params: {
  annualLeaveBaseType: ReturnType<typeof getModeAnnualLeaveBaseType>;
  annualHourMinutes: number;
  splitMinutes: number;
  breakMinutes: number;
}) {
  const labels = buildAuxSummaryParts(params);

  return labels.length > 0 ? `（${labels.join(' / ')}）` : '';
}

function buildWorkTimeLabel(
  startTime: string,
  endTime: string,
  params: {
    annualLeaveBaseType: ReturnType<typeof getModeAnnualLeaveBaseType>;
    annualHourMinutes: number;
    splitMinutes: number;
    breakMinutes: number;
  },
) {
  if (params.annualLeaveBaseType === 'annual-day' && startTime.trim() === '' && endTime.trim() === '') {
    return getAuxTypeLabel('annual-day');
  }

  const normalizedStart = formatOutputTime(startTime);
  const normalizedEnd = formatOutputTime(endTime);
  return `${normalizedStart}〜${normalizedEnd}${formatAuxLabel(params)}`;
}

function hasEntryContent(entry: ProjectEntry) {
  return hasProjectEntryContentForMode(entry, 'plan') || hasProjectEntryContentForMode(entry, 'actual');
}

function buildPhaseLabel(currentMode?: EntryMode, now = new Date()) {
  if (currentMode === 'plan') {
    return '開始';
  }

  if (currentMode === 'actual') {
    return '終了';
  }

  return now.getHours() < 12 ? '開始' : '終了';
}

function buildProjectLabel(entry: ProjectEntry) {
  return entry.projectName.trim() || entry.projectCode.trim() || 'PJ未選択';
}

function buildTaskLabel(entry: ProjectEntry) {
  const actualTask = entry.taskName.actual.trim();
  const planTask = entry.taskName.plan.trim();

  if (actualTask && planTask && actualTask !== planTask) {
    return `${actualTask}\n（予定: ${planTask}）`;
  }

  return actualTask || planTask || 'タスク未入力';
}

function buildCommentLabel(planComment: string, actualComment: string) {
  const normalizedActualComment = actualComment.trim();
  const normalizedPlanComment = planComment.trim();

  if (normalizedActualComment && normalizedPlanComment && normalizedActualComment !== normalizedPlanComment) {
    return `${normalizedActualComment}\n（予定: ${normalizedPlanComment}）`;
  }

  return normalizedActualComment || normalizedPlanComment || '';
}

function buildWorkplaceSummary(board: InputBoardDraft, phaseLabel: string, currentMode?: EntryMode) {
  const phasePreferredModes = phaseLabel === '開始' ? (['plan', 'actual'] as const) : (['actual', 'plan'] as const);
  const preferredModes = currentMode
    ? ([currentMode, ...phasePreferredModes.filter((mode) => mode !== currentMode)] as const)
    : phasePreferredModes;

  for (const mode of preferredModes) {
    const summary = buildModeWorkplaceSummary(board, mode);
    if (summary !== '未設定') {
      return summary;
    }
  }

  return '未設定';
}

function hasAuxContent(entry: AuxTimeEntry) {
  return (
    isAnnualLeaveBaseType(entry.type) ||
    entry.startTime.trim() !== '' ||
    entry.endTime.trim() !== '' ||
    entry.note.trim() !== ''
  );
}

function calculateAuxDurationMinutes(entry: AuxTimeEntry) {
  if (!isAuxRangeType(entry.type) || !entry.startTime.trim() || !entry.endTime.trim()) {
    return 0;
  }

  return calculateTimeRangeMinutesExcludingLunch(entry.startTime, entry.endTime, 0);
}

export function buildDailyOutputViewModel(params: {
  date: string;
  board: InputBoardDraft;
  userName: string;
  currentMode?: EntryMode;
  now?: Date;
}): DailyOutputViewModel {
  const { date, board, userName, currentMode, now = new Date() } = params;
  const phaseLabel = buildPhaseLabel(currentMode, now);
  const metrics = calculateInputBoardMetrics(board);
  const taskRows = board.projectEntries.filter(hasEntryContent).map<OutputTaskRow>((entry) => ({
    date,
    dateLabel: formatOutputDate(date),
    projectCode: normalizeProjectCode(entry.projectCode) || 'UNASSIGNED',
    projectName: buildProjectLabel(entry),
    planTaskName: entry.taskName.plan.trim(),
    actualTaskName: entry.taskName.actual.trim(),
    taskLabel: buildTaskLabel(entry),
    planMinutes: entry.minutes.plan,
    actualMinutes: entry.minutes.actual,
    planHoursLabel: formatOutputHours(entry.minutes.plan),
    actualHoursLabel: formatOutputHours(entry.minutes.actual),
    planNote: entry.note.plan.trim(),
    actualNote: entry.note.actual.trim(),
    needsComment: entry.needsComment,
    workplaces: {
      plan: getEntryPlaceDisplayLabel(entry, 'plan'),
      actual: getEntryPlaceDisplayLabel(entry, 'actual'),
    },
  }));
  const commentRows = taskRows
    .filter((row) => row.needsComment || row.planNote !== '' || row.actualNote !== '')
    .map<OutputCommentRow>((row) => ({
      projectCode: row.projectCode,
      projectName: row.projectName,
      needsComment: row.needsComment,
      planComment: row.planNote,
      actualComment: row.actualNote,
      commentLabel: buildCommentLabel(row.planNote, row.actualNote),
    }));

  return {
    scope: 'daily',
    date,
    dateLabel: formatOutputDate(date),
    userName: userName.trim(),
    currentMode,
    workInfo: {
      phaseLabel,
      workplaceLabel: buildWorkplaceSummary(board, phaseLabel, currentMode),
      plannedTime: {
        startTime: formatOutputTime(board.startTime.plan),
        endTime: formatOutputTime(board.endTime.plan),
        label: buildWorkTimeLabel(
          board.startTime.plan,
          board.endTime.plan,
          {
            annualLeaveBaseType: metrics.plan.annualLeaveBaseType,
            annualHourMinutes: metrics.plan.annualHourMinutes,
            splitMinutes: metrics.plan.splitMinutes,
            breakMinutes: metrics.plan.breakMinutes,
          },
        ),
      },
      actualTime: {
        startTime: formatOutputTime(board.startTime.actual),
        endTime: formatOutputTime(board.endTime.actual),
        label: buildWorkTimeLabel(
          board.startTime.actual,
          board.endTime.actual,
          {
            annualLeaveBaseType: metrics.actual.annualLeaveBaseType,
            annualHourMinutes: metrics.actual.annualHourMinutes,
            splitMinutes: metrics.actual.splitMinutes,
            breakMinutes: metrics.actual.breakMinutes,
          },
        ),
      },
    },
    taskRows,
    commentRows,
    totals: {
      planMinutes: taskRows.reduce((total, row) => total + row.planMinutes, 0),
      actualMinutes: taskRows.reduce((total, row) => total + row.actualMinutes, 0),
    },
  };
}

export function buildDailyListOutputViewModel(params: {
  records: Record<string, InputBoardDraft>;
  anchorDate: string;
  referenceDate: string;
}): DailyListOutputViewModel {
  const { records, anchorDate, referenceDate } = params;
  const monthlyViewModel = buildMonthlyOutputViewModel({
    records,
    anchorDate,
    referenceDate,
  });
  const monthKey = anchorDate.slice(0, 7);
  const dates = Object.keys(records)
    .filter((date) => date.startsWith(monthKey))
    .sort();
  const rows: DailyListOutputRow[] = [];
  let workingDayCount = 0;
  let planMinutes = 0;
  let actualMinutes = 0;

  for (const date of dates) {
    const board = records[date];
    if (!board) {
      continue;
    }

    const metrics = calculateInputBoardMetrics(board);
    const rowsBeforeDate = rows.length;

    (['plan', 'actual'] as EntryMode[]).forEach((mode) => {
      const modeMetrics = metrics[mode];
      const hasModeRows =
        board.startTime[mode].trim() !== '' ||
        board.endTime[mode].trim() !== '' ||
        (modeMetrics.workTargetMinutes ?? 0) > 0 ||
        board.projectEntries.some((entry) => hasProjectEntryContentForMode(entry, mode)) ||
        board.auxEntries.some((entry) => entry.mode === mode && hasAuxContent(entry));

      if (!hasModeRows) {
        return;
      }

      rows.push({
        date,
        dateLabel: formatOutputDate(date),
        mode,
        modeLabel: modeLabels[mode],
        rowType: 'work',
        rowTypeLabel: '勤務',
        startTime: formatOutputTime(board.startTime[mode]),
        endTime: formatOutputTime(board.endTime[mode]),
        workplaceLabel: buildModeWorkplaceSummary(board, mode),
        projectCode: '',
        projectName: '',
        taskLabel: mode === 'plan' ? '勤務予定' : '勤務実績',
        durationMinutes: modeMetrics.workTargetMinutes ?? 0,
        durationHours: (modeMetrics.workTargetMinutes ?? 0) / 60,
        durationHoursLabel: formatOutputHours(modeMetrics.workTargetMinutes ?? 0),
        comment: [
          board.lunchMinutes > 0 ? `昼休憩 ${formatOutputHours(board.lunchMinutes)}h` : '',
          ...buildAuxSummaryParts({
            annualLeaveBaseType: modeMetrics.annualLeaveBaseType,
            annualHourMinutes: modeMetrics.annualHourMinutes,
            splitMinutes: modeMetrics.splitMinutes,
            breakMinutes: modeMetrics.breakMinutes,
          }),
        ]
          .filter(Boolean)
          .join(' / '),
      });

      board.projectEntries.forEach((entry) => {
        if (!hasProjectEntryContentForMode(entry, mode)) {
          return;
        }

        const projectCode = normalizeProjectCode(entry.projectCode);
        const durationMinutes = entry.minutes[mode];
        rows.push({
          date,
          dateLabel: formatOutputDate(date),
          mode,
          modeLabel: modeLabels[mode],
          rowType: 'project',
          rowTypeLabel: 'PJ明細',
          startTime: formatOutputTime(entry.rangeStart[mode]),
          endTime: formatOutputTime(entry.rangeEnd[mode]),
          workplaceLabel: getEntryPlaceDisplayLabel(entry, mode),
          projectCode,
          projectName: buildProjectLabel(entry),
          taskLabel: entry.taskName[mode].trim() || 'タスク未入力',
          durationMinutes,
          durationHours: durationMinutes / 60,
          durationHoursLabel: formatOutputHours(durationMinutes),
          comment: entry.note[mode].trim(),
        });
      });

      board.auxEntries
        .filter((entry) => entry.mode === mode && hasAuxContent(entry))
        .forEach((entry) => {
          const durationMinutes = calculateAuxDurationMinutes(entry) ?? 0;
          const isRangeType = isAuxRangeType(entry.type);
          rows.push({
            date,
            dateLabel: formatOutputDate(date),
            mode,
            modeLabel: modeLabels[mode],
            rowType: 'aux',
            rowTypeLabel: getAuxTypeLabel(entry.type),
            startTime: isRangeType ? formatOutputTime(entry.startTime) : '',
            endTime: isRangeType ? formatOutputTime(entry.endTime) : '',
            workplaceLabel: '',
            projectCode: '',
            projectName: '',
            taskLabel: getAuxTypeLabel(entry.type),
            durationMinutes,
            durationHours: durationMinutes / 60,
            durationHoursLabel: formatOutputHours(durationMinutes),
            comment: entry.note.trim(),
          });
        });

      if (mode === 'plan') {
        planMinutes += modeMetrics.workTargetMinutes ?? 0;
      } else {
        actualMinutes += modeMetrics.workTargetMinutes ?? 0;
      }
    });

    if (rows.length > rowsBeforeDate) {
      workingDayCount += 1;
    }
  }

  return {
    scope: 'daily-list',
    monthKey,
    monthLabel: monthlyViewModel.monthLabel,
    rows,
    totals: {
      workingDayCount,
      rowCount: rows.length,
      projectRowCount: rows.filter((row) => row.rowType === 'project').length,
      auxRowCount: rows.filter((row) => row.rowType === 'aux').length,
      planMinutes,
      actualMinutes,
    },
  };
}

function formatOutputMonth(date: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'long',
  }).format(new Date(`${date}T00:00:00`));
}

function formatSignedOutputHours(value: number | null) {
  if (value === null) {
    return '--';
  }

  if (value === 0) {
    return '±0h';
  }

  const sign = value > 0 ? '+' : '-';
  return `${sign}${formatOutputHours(Math.abs(value))}h`;
}

function hasModeTransferData(board: InputBoardDraft, mode: EntryMode) {
  return (
    board.startTime[mode].trim() !== '' ||
    board.endTime[mode].trim() !== '' ||
    board.projectEntries.some((entry) => hasProjectEntryContentForMode(entry, mode)) ||
    board.auxEntries.some((entry) => entry.mode === mode && hasAuxContent(entry))
  );
}

function resolveTimesheetTransferMode(board: InputBoardDraft, referenceDate: string): EntryMode {
  if (board.date > referenceDate) {
    return 'plan';
  }

  if (hasModeTransferData(board, 'actual')) {
    return 'actual';
  }

  if (hasModeTransferData(board, 'plan')) {
    return 'plan';
  }

  return board.currentMode;
}

function buildTransferStatusLabel(board: InputBoardDraft, mode: EntryMode, referenceDate: string) {
  const metrics = calculateInputBoardMetrics(board)[mode];
  if (metrics.annualLeaveBaseType === 'annual-day') {
    return '年休';
  }

  if (metrics.annualLeaveBaseType === 'annual-am' || metrics.annualLeaveBaseType === 'annual-pm') {
    return getAuxTypeLabel(metrics.annualLeaveBaseType);
  }

  if (board.date > referenceDate) {
    return '未来日';
  }

  return monthlyDayStatusLabels[getModeInputStatus(board, mode)];
}

function buildProjectRangeLabel(entry: ProjectEntry, mode: EntryMode) {
  const startTime = entry.rangeStart[mode].trim();
  const endTime = entry.rangeEnd[mode].trim();
  if (!startTime && !endTime) {
    return '時間数入力';
  }

  return `${formatOutputTime(startTime)}〜${formatOutputTime(endTime)}`;
}

interface TransferClockRange {
  start: number;
  end: number;
}

interface TransferSelectionRange {
  startMinutes: number;
  durationMinutes: number;
  touchedSegmentCount: number;
  startTime: string;
  endTime: string;
}

function buildTransferClockRange(start: number, end: number) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return null;
  }

  return { start, end } satisfies TransferClockRange;
}

function clipTransferClockRange(range: TransferClockRange, bounds: TransferClockRange) {
  return buildTransferClockRange(Math.max(range.start, bounds.start), Math.min(range.end, bounds.end));
}

function excludeTransferClockRange(range: TransferClockRange, exclusion: TransferClockRange | null) {
  if (!exclusion) {
    return [range];
  }

  const overlap = clipTransferClockRange(range, exclusion);
  if (!overlap) {
    return [range];
  }

  const left = buildTransferClockRange(range.start, overlap.start);
  const right = buildTransferClockRange(overlap.end, range.end);
  return [left, right].filter((item): item is TransferClockRange => item !== null);
}

function mergeTransferClockRanges(ranges: TransferClockRange[]) {
  if (ranges.length === 0) {
    return [];
  }

  const sorted = [...ranges].sort((left, right) => left.start - right.start);
  const merged: TransferClockRange[] = [{ ...sorted[0] }];

  for (const range of sorted.slice(1)) {
    const previous = merged[merged.length - 1];
    if (range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end);
      continue;
    }

    merged.push({ ...range });
  }

  return merged;
}

function sumTransferClockRangeMinutes(ranges: TransferClockRange[]) {
  return ranges.reduce((total, range) => total + (range.end - range.start), 0);
}

function formatOutputTimeFromMinutes(value: number) {
  const hours = String(Math.floor(value / 60)).padStart(2, '0');
  const minutes = String(value % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function formatOutputDigits(value: string) {
  const normalized = value.trim();
  return normalized ? normalized.replace(':', '') : '----';
}

function buildWorkRange(startTime: string, endTime: string) {
  const startMinutes = toTimeMinutes(startTime);
  const endMinutes = toTimeMinutes(endTime);
  if (startMinutes === null || endMinutes === null) {
    return null;
  }

  return buildTransferClockRange(startMinutes, endMinutes);
}

function buildLunchRange(workRange: TransferClockRange | null, lunchMinutes: number) {
  if (!workRange || lunchMinutes <= 0) {
    return null;
  }

  const lunchRange = buildTransferClockRange(12 * 60, 12 * 60 + lunchMinutes);
  if (!lunchRange) {
    return null;
  }

  return clipTransferClockRange(lunchRange, workRange);
}

function buildExcludedTransferBlocks(
  board: InputBoardDraft,
  mode: EntryMode,
  workRange: TransferClockRange | null,
) {
  if (!workRange) {
    return [] as Array<TransferClockRange & { typeLabel: string }>;
  }

  const blocks: Array<TransferClockRange & { typeLabel: string }> = [];
  const lunchRange = buildLunchRange(workRange, board.lunchMinutes);
  if (lunchRange) {
    blocks.push({
      ...lunchRange,
      typeLabel: '昼休み',
    });
  }

  for (const entry of board.auxEntries) {
    if (entry.mode !== mode || !isAuxRangeType(entry.type)) {
      continue;
    }

    const entryStart = toTimeMinutes(entry.startTime);
    const entryEnd = toTimeMinutes(entry.endTime);
    if (entryStart === null || entryEnd === null) {
      continue;
    }

    const clipped = clipTransferClockRange({ start: entryStart, end: entryEnd }, workRange);
    if (!clipped) {
      continue;
    }

    const normalizedBlocks = lunchRange ? excludeTransferClockRange(clipped, lunchRange) : [clipped];
    for (const block of normalizedBlocks) {
      blocks.push({
        ...block,
        typeLabel: getAuxTypeLabel(entry.type),
      });
    }
  }

  return blocks.sort((left, right) => left.start - right.start);
}

function buildAvailableTransferRanges(workRange: TransferClockRange | null, excludedRanges: TransferClockRange[]) {
  if (!workRange) {
    return [];
  }

  const mergedExclusions = mergeTransferClockRanges(excludedRanges);
  let availableRanges: TransferClockRange[] = [{ ...workRange }];

  for (const exclusion of mergedExclusions) {
    availableRanges = availableRanges.flatMap((range) => excludeTransferClockRange(range, exclusion));
  }

  return availableRanges;
}

function getAvailableMinutesBefore(availableRanges: TransferClockRange[], timeMinutes: number) {
  return availableRanges.reduce((total, range) => {
    if (timeMinutes <= range.start) {
      return total;
    }

    return total + Math.max(0, Math.min(timeMinutes, range.end) - range.start);
  }, 0);
}

function getAvailableMinutesBetween(availableRanges: TransferClockRange[], startMinutes: number, endMinutes: number) {
  return availableRanges.reduce((total, range) => {
    const overlapStart = Math.max(startMinutes, range.start);
    const overlapEnd = Math.min(endMinutes, range.end);
    return total + Math.max(0, overlapEnd - overlapStart);
  }, 0);
}

function countTouchedAvailableSegmentsBetween(
  availableRanges: TransferClockRange[],
  startMinutes: number,
  endMinutes: number,
) {
  return availableRanges.reduce((count, range) => {
    const overlapStart = Math.max(startMinutes, range.start);
    const overlapEnd = Math.min(endMinutes, range.end);
    return count + (overlapEnd > overlapStart ? 1 : 0);
  }, 0);
}

function mapAvailableOffsetToClockTime(availableRanges: TransferClockRange[], offsetMinutes: number) {
  if (availableRanges.length === 0) {
    return null;
  }

  const totalMinutes = sumTransferClockRangeMinutes(availableRanges);
  const clampedOffset = Math.max(0, Math.min(offsetMinutes, totalMinutes));
  let remaining = clampedOffset;

  for (const range of availableRanges) {
    const rangeMinutes = range.end - range.start;
    if (remaining <= rangeMinutes) {
      return range.start + remaining;
    }
    remaining -= rangeMinutes;
  }

  return availableRanges[availableRanges.length - 1]?.end ?? null;
}

function buildDurationBasedSelectionRange(
  availableRanges: TransferClockRange[],
  offsetMinutes: number,
  durationMinutes: number,
): TransferSelectionRange | null {
  const totalMinutes = sumTransferClockRangeMinutes(availableRanges);
  if (availableRanges.length === 0 || totalMinutes <= 0 || durationMinutes <= 0 || offsetMinutes >= totalMinutes) {
    return null;
  }

  const clampedDuration = Math.min(durationMinutes, totalMinutes - offsetMinutes);
  const startClock = mapAvailableOffsetToClockTime(availableRanges, offsetMinutes);
  const endClock = mapAvailableOffsetToClockTime(availableRanges, offsetMinutes + clampedDuration);
  if (startClock === null || endClock === null) {
    return null;
  }

  let cursor = 0;
  let touchedSegmentCount = 0;
  for (const range of availableRanges) {
    const nextCursor = cursor + (range.end - range.start);
    if (offsetMinutes < nextCursor && offsetMinutes + clampedDuration > cursor) {
      touchedSegmentCount += 1;
    }
    cursor = nextCursor;
  }

  return {
    startMinutes: offsetMinutes,
    durationMinutes: clampedDuration,
    touchedSegmentCount,
    startTime: formatOutputTimeFromMinutes(startClock),
    endTime: formatOutputTimeFromMinutes(endClock),
  } satisfies TransferSelectionRange;
}

function buildRangeBasedSelectionRange(
  availableRanges: TransferClockRange[],
  startTime: string,
  endTime: string,
): TransferSelectionRange | null {
  const startMinutes = toTimeMinutes(startTime);
  const endMinutes = toTimeMinutes(endTime);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    return null;
  }

  const durationMinutes = getAvailableMinutesBetween(availableRanges, startMinutes, endMinutes);
  if (durationMinutes <= 0) {
    return null;
  }

  return {
    startMinutes: getAvailableMinutesBefore(availableRanges, startMinutes),
    durationMinutes,
    touchedSegmentCount: countTouchedAvailableSegmentsBetween(availableRanges, startMinutes, endMinutes),
    startTime: formatOutputTime(startTime),
    endTime: formatOutputTime(endTime),
  } satisfies TransferSelectionRange;
}

function buildProjectSelectionNotice(selectionRange: TransferSelectionRange | null) {
  if (!selectionRange || selectionRange.touchedSegmentCount <= 1) {
    return null;
  }

  return '昼休みや補助時間を飛ばして 1 本選択';
}

export function buildTimesheetTransferViewModel(params: {
  date: string;
  board: InputBoardDraft;
  referenceDate: string;
}): TimesheetTransferViewModel {
  const { date, board, referenceDate } = params;
  const metrics = calculateInputBoardMetrics(board);
  const mode = resolveTimesheetTransferMode(board, referenceDate);
  const modeMetrics = metrics[mode];
  const warnings = collectInputBoardWarnings(board, mode);
  const annualLeaveLabel =
    modeMetrics.annualLeaveBaseType === 'annual-day'
      ? '年休'
      : modeMetrics.annualLeaveBaseType
        ? getAuxTypeLabel(modeMetrics.annualLeaveBaseType)
        : null;
  const workRange = buildWorkRange(board.startTime[mode], board.endTime[mode]);
  const rawExcludedBlocks = buildExcludedTransferBlocks(board, mode, workRange);
  const mergedExcludedRanges = mergeTransferClockRanges(
    rawExcludedBlocks.map((block) => ({
      start: block.start,
      end: block.end,
    })),
  );
  const availableRanges = buildAvailableTransferRanges(workRange, mergedExcludedRanges);
  const totalSelectableMinutes = sumTransferClockRangeMinutes(availableRanges);
  const totalExcludedMinutes = sumTransferClockRangeMinutes(mergedExcludedRanges);
  const projectCatalogMap = new Map(
    board.projectCatalog.map((project) => [normalizeProjectCode(project.projectCode), project] satisfies [string, ProjectCatalogItem]),
  );
  const availableSegments = availableRanges.map((range, index) => ({
    order: index + 1,
    startTime: formatOutputTimeFromMinutes(range.start),
    endTime: formatOutputTimeFromMinutes(range.end),
    label: `${formatOutputTimeFromMinutes(range.start)}〜${formatOutputTimeFromMinutes(range.end)}`,
    durationHoursLabel: `${formatOutputHours(range.end - range.start)}h`,
    leftPercent: totalSelectableMinutes > 0 ? (getAvailableMinutesBefore(availableRanges, range.start) / totalSelectableMinutes) * 100 : 0,
    widthPercent: totalSelectableMinutes > 0 ? ((range.end - range.start) / totalSelectableMinutes) * 100 : 0,
  }));
  const excludedBlocks = rawExcludedBlocks.map((block, index) => ({
    order: index + 1,
    typeLabel: block.typeLabel,
    startTime: formatOutputTimeFromMinutes(block.start),
    endTime: formatOutputTimeFromMinutes(block.end),
    label: `${block.typeLabel} ${formatOutputTimeFromMinutes(block.start)}〜${formatOutputTimeFromMinutes(block.end)}`,
    durationHoursLabel: `${formatOutputHours(block.end - block.start)}h`,
  }));

  let sequentialSelectionOffsetMinutes = 0;
  const projectRows = board.projectEntries
    .filter((entry) => hasProjectEntryContentForMode(entry, mode))
    .map((entry, index) => {
      const normalizedProjectCode = normalizeProjectCode(entry.projectCode);
      const projectCode = normalizedProjectCode || 'UNASSIGNED';
      const projectName = buildProjectLabel(entry);
      const timesheetProjectLabel =
        projectCatalogMap.get(normalizedProjectCode)?.timesheetProjectLabel?.trim() || projectName;
      const durationMinutes = entry.minutes[mode];
      const rangeSelection =
        entry.timeInputMode[mode] === 'range'
          ? buildRangeBasedSelectionRange(availableRanges, entry.rangeStart[mode], entry.rangeEnd[mode])
          : null;
      const sequentialSelection =
        rangeSelection ?? buildDurationBasedSelectionRange(availableRanges, sequentialSelectionOffsetMinutes, durationMinutes);
      const selectionRange = sequentialSelection;
      if (selectionRange) {
        sequentialSelectionOffsetMinutes = Math.max(
          sequentialSelectionOffsetMinutes + (rangeSelection ? 0 : selectionRange.durationMinutes),
          selectionRange.startMinutes + selectionRange.durationMinutes,
        );
      } else if (entry.timeInputMode[mode] !== 'range') {
        sequentialSelectionOffsetMinutes += durationMinutes;
      }

      const selectionStartPercent =
        selectionRange && totalSelectableMinutes > 0
          ? Math.min(100, (selectionRange.startMinutes / totalSelectableMinutes) * 100)
          : 0;
      const selectionWidthPercent =
        selectionRange && totalSelectableMinutes > 0
          ? Math.max(0, Math.min(100 - selectionStartPercent, (selectionRange.durationMinutes / totalSelectableMinutes) * 100))
          : 0;
      const timeRangeLabel = selectionRange
        ? `${selectionRange.startTime}〜${selectionRange.endTime}`
        : entry.timeInputMode[mode] === 'range'
          ? buildProjectRangeLabel(entry, mode)
          : 'バー未割当';
      return {
        order: index + 1,
        projectCode,
        projectName,
        timesheetProjectLabel,
        dropdownLabel: timesheetProjectLabel,
        taskLabel: entry.taskName[mode].trim() || 'タスク未入力',
        durationMinutes,
        durationHoursLabel: `${formatOutputHours(durationMinutes)}h`,
        placeLabel: getEntryPlaceDisplayLabel(entry, mode),
        timeRangeLabel,
        comment: entry.note[mode].trim(),
        selectionStartPercent,
        selectionWidthPercent,
        selectionNotice: buildProjectSelectionNotice(selectionRange),
      } satisfies TimesheetTransferProjectRow;
    });

  const auxRows = board.auxEntries
    .filter((entry) => entry.mode === mode && hasAuxContent(entry) && !isAnnualLeaveBaseType(entry.type))
    .map((entry, index) => {
      const durationMinutes = calculateAuxDurationMinutes(entry) ?? 0;
      return {
        order: index + 1,
        typeLabel: getAuxTypeLabel(entry.type),
        timeRangeLabel: `${formatOutputTime(entry.startTime)}〜${formatOutputTime(entry.endTime)}`,
        durationHoursLabel: `${formatOutputHours(durationMinutes)}h`,
        note: entry.note.trim(),
      };
    });

  return {
    scope: 'timesheet-transfer',
    date,
    dateLabel: formatOutputDate(date),
    monthLabel: formatOutputMonth(date),
    mode,
    modeLabel: modeLabels[mode],
    statusLabel: buildTransferStatusLabel(board, mode, referenceDate),
    annualLeaveLabel,
    workplaceLabel: buildModeWorkplaceSummary(board, mode),
    startTime: formatOutputTime(board.startTime[mode]),
    endTime: formatOutputTime(board.endTime[mode]),
    startTimeInputLabel: formatOutputDigits(board.startTime[mode]),
    endTimeInputLabel: formatOutputDigits(board.endTime[mode]),
    workTimeLabel: buildWorkTimeLabel(board.startTime[mode], board.endTime[mode], {
      annualLeaveBaseType: modeMetrics.annualLeaveBaseType,
      annualHourMinutes: modeMetrics.annualHourMinutes ?? 0,
      splitMinutes: modeMetrics.splitMinutes,
      breakMinutes: modeMetrics.breakMinutes,
    }),
    lunchHoursLabel: `${formatOutputHours(board.lunchMinutes)}h`,
    splitHoursLabel: modeMetrics.splitMinutes > 0 ? `${formatOutputHours(modeMetrics.splitMinutes)}h` : '--',
    breakHoursLabel: modeMetrics.breakMinutes > 0 ? `${formatOutputHours(modeMetrics.breakMinutes)}h` : '--',
    allocationHoursLabel: `${formatOutputHours(modeMetrics.allocationTotalMinutes)}h`,
    differenceHoursLabel: formatSignedOutputHours(modeMetrics.differenceMinutes),
    selectableHoursLabel: `${formatOutputHours(totalSelectableMinutes)}h`,
    excludedHoursLabel: `${formatOutputHours(totalExcludedMinutes)}h`,
    availableSegments,
    excludedBlocks,
    projectRows,
    auxRows,
    warnings: warnings.map((warning) => `${warning.title}${warning.detail ? `: ${warning.detail}` : ''}`),
  };
}

export function buildMonthlyOutputViewModel(params: {
  records: Record<string, InputBoardDraft>;
  anchorDate: string;
  referenceDate: string;
}): MonthlyOutputViewModel {
  const { records, anchorDate, referenceDate } = params;
  const summary = calculateMonthlySummary(records, anchorDate, referenceDate);
  const monthKey = anchorDate.slice(0, 7);
  const actualDayMap = new Map<
    string,
    Map<
      string,
      {
        actualMinutes: number;
        taskNames: Set<string>;
        comments: Set<string>;
      }
    >
  >();

  Object.entries(records)
    .filter(([date]) => date.startsWith(monthKey))
    .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
    .forEach(([date, board]) => {
      board.projectEntries.forEach((entry) => {
        if (entry.minutes.actual <= 0) {
          return;
        }

        const projectCode = normalizeProjectCode(entry.projectCode) || 'UNASSIGNED';
        const projectDays = actualDayMap.get(projectCode) ?? new Map<string, { actualMinutes: number; taskNames: Set<string>; comments: Set<string> }>();
        const currentDay = projectDays.get(date) ?? {
          actualMinutes: 0,
          taskNames: new Set<string>(),
          comments: new Set<string>(),
        };

        currentDay.actualMinutes += entry.minutes.actual;

        const taskName = entry.taskName.actual.trim() || entry.taskName.plan.trim();
        if (taskName) {
          currentDay.taskNames.add(taskName);
        }

        const comment = entry.note.actual.trim() || entry.note.plan.trim();
        if (comment) {
          currentDay.comments.add(comment);
        }

        projectDays.set(date, currentDay);
        actualDayMap.set(projectCode, projectDays);
      });
    });

  return {
    scope: 'monthly',
    monthLabel: summary.monthLabel,
    totals: {
      budgetTotalMinutes: summary.budgetTotalMinutes,
      actualTotalMinutes: summary.actualTotalMinutes,
      landingTotalMinutes: summary.landingTotalMinutes,
      overtimeMinutes: summary.overtimeMinutes,
      attentionDays: summary.attentionDays,
    },
    days: summary.days.map((day) => ({
      date: day.date,
      status: day.status,
      isFuture: day.isFuture,
      differenceMinutes: day.differenceMinutes,
      overtimeMinutes: day.overtimeMinutes,
      warningCount: day.warningCount,
      planAllocationMinutes: day.planAllocationMinutes,
      actualAllocationMinutes: day.actualAllocationMinutes,
    })),
    projects: summary.projects.map((project) => ({
      projectCode: project.projectCode,
      projectName: project.projectName,
      category: project.category,
      budgetMinutes: project.budgetMinutes,
      actualMinutes: project.actualMinutes,
      landingMinutes: project.landingMinutes,
      differenceMinutes: project.differenceMinutes,
      activeDays: actualDayMap.get(project.projectCode)?.size ?? 0,
      actualDayRows: Array.from(actualDayMap.get(project.projectCode)?.entries() ?? [])
        .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
        .map(([date, day]) => ({
          date,
          dateLabel: formatOutputDate(date),
          actualMinutes: day.actualMinutes,
          actualHoursLabel: formatOutputHours(day.actualMinutes),
          taskSummary: Array.from(day.taskNames).join(' / ') || 'タスク未入力',
          commentSummary:
            day.comments.size > 0 ? Array.from(day.comments).join(' / ') : '',
        })),
    })),
  };
}

export function buildProjectMasterOutputViewModel(params: {
  catalog: ProjectCatalogItem[];
  monthlyProjects?: MonthlySummary['projects'];
  monthLabel?: string;
}): ProjectMasterOutputViewModel {
  const { catalog, monthlyProjects = [], monthLabel = '' } = params;
  const monthlyProjectMap = new Map(
    monthlyProjects.map((project) => [normalizeProjectCode(project.projectCode), project.actualMinutes]),
  );
  const rows = catalog.map<ProjectMasterOutputRow>((project) => {
    const representativeTaskCandidates = Array.from(
      new Set([project.defaultTaskName ?? '', ...(project.recentTaskNames ?? [])].map((value) => value.trim()).filter(Boolean)),
    );
    const monthlyActualMinutes = monthlyProjectMap.get(normalizeProjectCode(project.projectCode)) ?? 0;

    return {
      projectCode: normalizeProjectCode(project.projectCode),
      projectName: project.projectName.trim(),
      category: project.category,
      categoryLabel: categoryLabels[project.category],
      isActive: isProjectCatalogItemActive(project),
      isActiveLabel: isProjectCatalogItemActive(project) ? '有効' : '無効',
      pinned: Boolean(project.pinned),
      pinnedLabel: project.pinned ? 'あり' : 'なし',
      defaultPlaceLabel: placeLabels[project.defaultPlace ?? 'office'],
      defaultTaskName: (project.defaultTaskName ?? '').trim(),
      representativeTaskCandidates,
      representativeTaskCandidatesLabel:
        representativeTaskCandidates.length > 0 ? representativeTaskCandidates.join('\n') : '候補なし',
      aliasesLabel: (project.aliases ?? []).filter(Boolean).join('\n'),
      needsComment: Boolean(project.needsComment),
      needsCommentLabel: project.needsComment ? '必要' : '不要',
      monthlyBudgetMinutes: project.monthlyBudgetMinutes ?? 0,
      monthlyBudgetHoursLabel: formatHoursDecimal(project.monthlyBudgetMinutes ?? 0),
      monthlyActualMinutes,
      monthlyActualHoursLabel: formatHoursDecimal(monthlyActualMinutes),
    };
  });

  return {
    scope: 'project-master',
    monthLabel,
    rows,
    totals: {
      projectCount: rows.length,
      activeCount: rows.filter((row) => row.isActive).length,
      pinnedCount: rows.filter((row) => row.pinned).length,
      commentRequiredCount: rows.filter((row) => row.needsComment).length,
    },
  };
}

export function getMonthlyDayStatusLabel(status: MonthlySummary['days'][number]['status']) {
  return monthlyDayStatusLabels[status];
}
