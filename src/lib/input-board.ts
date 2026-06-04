import type {
  AnnualLeaveBaseType,
  AuxEntryType,
  AuxTimeEntry,
  EntryMode,
  InputBoardDraft,
  ModeValue,
  ProjectCatalogItem,
  ProjectEntry,
  ProjectCategory,
  WorkPlace,
} from '../types/input-board';
import { getDayOffLabel, getJapaneseHolidayName, isJapaneseHoliday } from './japanese-holidays';

const FIXED_LUNCH_START_MINUTES = 12 * 60;

interface TimeRange {
  start: number;
  end: number;
}

export const STANDARD_WORK_MINUTES = 450;
const AM_HALF_LEAVE_TARGET_MINUTES = 240;
const PM_HALF_LEAVE_TARGET_MINUTES = 210;

const annualLeaveBaseTypes: AnnualLeaveBaseType[] = ['annual-day', 'annual-am', 'annual-pm'];
const auxRangeTypes: AuxEntryType[] = ['split', 'break', 'annual-hour'];

const auxTypeLabels: Record<AuxEntryType, string> = {
  split: '分断',
  break: '休憩',
  'annual-day': '1日休',
  'annual-am': 'AM休',
  'annual-pm': 'PM休',
  'annual-hour': '1H休',
};

export interface ModeMetrics {
  splitMinutes: number;
  breakMinutes: number;
  annualHourMinutes: number;
  annualLeaveBaseType: AnnualLeaveBaseType | null;
  annualLeaveConflict: boolean;
  workSpanMinutes: number | null;
  lunchDeductionMinutes: number | null;
  workTargetMinutes: number | null;
  allocationTotalMinutes: number;
  differenceMinutes: number | null;
  ftSettlementTargetMinutes: number | null;
  ftSettlementMinutes: number | null;
}

export interface InputBoardMetrics extends ModeValue<ModeMetrics> {}

export interface InputBoardWarning {
  id: string;
  tone: 'danger' | 'caution' | 'info';
  title: string;
  detail: string;
}

export interface DifferenceState {
  label: string;
  detail: string;
  tone: 'danger' | 'caution' | 'neutral' | 'info';
}

export type DayInputStatus = 'empty' | 'partial' | 'done';

export interface TimeOption {
  value: string;
  label: string;
}

export interface MonthlyDaySummary {
  date: string;
  status: DayInputStatus;
  isFuture: boolean;
  displayMode: EntryMode;
  isHoliday: boolean;
  holidayName: string | null;
  dayOffLabel: string | null;
  annualLeaveType: AnnualLeaveBaseType | null;
  needsAttention: boolean;
  warningCount: number;
  workStartTime: string;
  workEndTime: string;
  splitMinutes: number;
  workplaceLabel: string;
  planAllocationMinutes: number;
  actualAllocationMinutes: number;
  planWorkTargetMinutes: number | null;
  actualWorkTargetMinutes: number | null;
  differenceMinutes: number | null;
  overtimeMinutes: number;
  projectMinutesByCode: Record<
    string,
    {
      actualMinutes: number;
      planMinutes: number;
      landingMinutes: number;
    }
  >;
}

export interface MonthlyProjectSummary {
  projectCode: string;
  projectName: string;
  category: ProjectCategory | null;
  budgetMinutes: number;
  actualMinutes: number;
  landingMinutes: number;
  differenceMinutes: number;
  progressRate: number | null;
  activeDays: number;
}

export interface MonthlySummary {
  monthLabel: string;
  enteredDays: number;
  completedDays: number;
  overtimeMinutes: number;
  budgetTotalMinutes: number;
  actualTotalMinutes: number;
  landingTotalMinutes: number;
  attentionDays: number;
  emptyDays: number;
  futureEstimateMinutes: number;
  allocationTotalMinutes: number;
  workTargetTotalMinutes: number;
  days: MonthlyDaySummary[];
  projects: MonthlyProjectSummary[];
}

export const placeLabels: Record<WorkPlace, string> = {
  home: 'テレ',
  office: '池袋',
  client: '客先',
  other: 'その他',
};

export function hasProjectEntryContentForMode(entry: ProjectEntry, mode: EntryMode) {
  return (
    entry.projectCode.trim() !== '' ||
    entry.projectName.trim() !== '' ||
    entry.taskName[mode].trim() !== '' ||
    entry.note[mode].trim() !== '' ||
    entry.minutes[mode] > 0 ||
    entry.rangeStart[mode].trim() !== '' ||
    entry.rangeEnd[mode].trim() !== ''
  );
}

export function getAuxTypeLabel(type: AuxEntryType) {
  return auxTypeLabels[type];
}

export function isAnnualLeaveBaseType(type: AuxEntryType): type is AnnualLeaveBaseType {
  return annualLeaveBaseTypes.includes(type as AnnualLeaveBaseType);
}

export function isAuxRangeType(type: AuxEntryType) {
  return auxRangeTypes.includes(type);
}

export function getAnnualLeaveBaseTargetMinutes(type: AnnualLeaveBaseType | null) {
  if (type === 'annual-day') {
    return 0;
  }

  if (type === 'annual-am') {
    return AM_HALF_LEAVE_TARGET_MINUTES;
  }

  if (type === 'annual-pm') {
    return PM_HALF_LEAVE_TARGET_MINUTES;
  }

  return STANDARD_WORK_MINUTES;
}

export function getModeAnnualLeaveBaseType(
  auxEntries: AuxTimeEntry[],
  mode: EntryMode,
): AnnualLeaveBaseType | null {
  const matchedEntry = auxEntries.find(
    (entry): entry is AuxTimeEntry & { type: AnnualLeaveBaseType } =>
      entry.mode === mode && isAnnualLeaveBaseType(entry.type),
  );

  return matchedEntry?.type ?? null;
}

function getModeAnnualLeaveBaseEntries(
  auxEntries: AuxTimeEntry[],
  mode: EntryMode,
): Array<AuxTimeEntry & { type: AnnualLeaveBaseType }> {
  return auxEntries.filter(
    (entry): entry is AuxTimeEntry & { type: AnnualLeaveBaseType } =>
      entry.mode === mode && isAnnualLeaveBaseType(entry.type),
  );
}

function buildFtSettlementTargetMinutes(
  annualLeaveBaseType: AnnualLeaveBaseType | null,
  annualHourMinutes: number,
) {
  if (annualLeaveBaseType === 'annual-day') {
    return 0;
  }

  return Math.max(0, getAnnualLeaveBaseTargetMinutes(annualLeaveBaseType) - annualHourMinutes);
}

export function normalizePlaceDetail(value: string | null | undefined) {
  return value?.trim() ?? '';
}

export function getPlaceDisplayLabel(place: WorkPlace, placeDetail?: string | null) {
  const normalizedPlaceDetail = normalizePlaceDetail(placeDetail);
  if (place === 'other' && normalizedPlaceDetail) {
    return normalizedPlaceDetail;
  }

  return placeLabels[place];
}

export function getEntryPlaceDisplayLabel(
  entry: Pick<ProjectEntry, 'place' | 'placeDetail'>,
  mode: EntryMode,
) {
  return getPlaceDisplayLabel(entry.place[mode], entry.placeDetail?.[mode]);
}

export function buildModeWorkplaceSummary(board: InputBoardDraft, mode: EntryMode) {
  const uniquePlaces: string[] = [];
  const seen = new Set<string>();

  for (const entry of board.projectEntries) {
    if (!hasProjectEntryContentForMode(entry, mode)) {
      continue;
    }

    const placeLabel = getEntryPlaceDisplayLabel(entry, mode);
    if (seen.has(placeLabel)) {
      continue;
    }

    seen.add(placeLabel);
    uniquePlaces.push(placeLabel);
  }

  return uniquePlaces.length > 0 ? uniquePlaces.join('→') : '未設定';
}

export const categoryLabels: Record<ProjectCategory, string> = {
  direct: '直接',
  indirect: '間接',
};

export const MAX_TIME_INPUT_MINUTES = 30 * 60;

export const quarterHourOptions: TimeOption[] = Array.from({ length: MAX_TIME_INPUT_MINUTES / 15 + 1 }, (_, index) => {
  const hours = String(Math.floor(index / 4)).padStart(2, '0');
  const minutes = String((index % 4) * 15).padStart(2, '0');
  const value = `${hours}:${minutes}`;

  return {
    value,
    label: value,
  };
});

let fallbackIdCounter = 0;

function createId(prefix: string) {
  const cryptoApi = globalThis.crypto;

  if (typeof cryptoApi?.randomUUID === 'function') {
    return `${prefix}-${cryptoApi.randomUUID()}`;
  }

  if (typeof cryptoApi?.getRandomValues === 'function') {
    const bytes = new Uint8Array(12);
    cryptoApi.getRandomValues(bytes);
    const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${prefix}-${token}`;
  }

  fallbackIdCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${fallbackIdCounter.toString(36)}`;
}

function cloneProjectCatalog(catalog: ProjectCatalogItem[]) {
  return catalog.map((item) => ({
    ...item,
    aliases: item.aliases ? [...item.aliases] : undefined,
    recentTaskNames: [...item.recentTaskNames],
  }));
}

function buildRange(start: number, end: number): TimeRange | null {
  if (end <= start) {
    return null;
  }

  return { start, end };
}

function clipRange(range: TimeRange, bounds: TimeRange) {
  return buildRange(Math.max(range.start, bounds.start), Math.min(range.end, bounds.end));
}

function excludeRange(range: TimeRange, exclusion: TimeRange | null) {
  if (!exclusion) {
    return [range];
  }

  const overlap = clipRange(range, exclusion);
  if (!overlap) {
    return [range];
  }

  const ranges: TimeRange[] = [];
  const left = buildRange(range.start, overlap.start);
  const right = buildRange(overlap.end, range.end);

  if (left) {
    ranges.push(left);
  }

  if (right) {
    ranges.push(right);
  }

  return ranges;
}

function mergeRanges(ranges: TimeRange[]) {
  if (ranges.length === 0) {
    return [];
  }

  const sorted = [...ranges].sort((left, right) => left.start - right.start);
  const merged: TimeRange[] = [sorted[0]];

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

function sumRangeMinutes(ranges: TimeRange[]) {
  return ranges.reduce((total, range) => total + (range.end - range.start), 0);
}

function getLunchRange(lunchMinutes: number) {
  return buildRange(FIXED_LUNCH_START_MINUTES, FIXED_LUNCH_START_MINUTES + lunchMinutes);
}

function toValidRange(startTime: string, endTime: string) {
  const start = toTimeMinutes(startTime);
  const end = toTimeMinutes(endTime);

  if (start === null || end === null) {
    return null;
  }

  return buildRange(start, end);
}

function getEffectiveAuxRanges(
  auxEntries: AuxTimeEntry[],
  mode: EntryMode,
  workRange: TimeRange,
  lunchRange: TimeRange | null,
) {
  const effectiveRanges = auxEntries
    .filter((entry) => entry.mode === mode && isAuxRangeType(entry.type))
    .flatMap((entry) => {
      const entryRange = toValidRange(entry.startTime, entry.endTime);
      if (!entryRange) {
        return [];
      }

      const clippedRange = clipRange(entryRange, workRange);
      if (!clippedRange) {
        return [];
      }

      return excludeRange(clippedRange, lunchRange);
    });

  return mergeRanges(effectiveRanges);
}

function calculateAuxMinutes(
  auxEntries: AuxTimeEntry[],
  mode: EntryMode,
  type: AuxEntryType,
  lunchMinutes = 60,
) {
  return auxEntries
    .filter((entry) => entry.mode === mode && entry.type === type)
    .reduce(
      (total, entry) =>
        total + (calculateTimeRangeMinutesExcludingLunch(entry.startTime, entry.endTime, lunchMinutes) ?? 0),
      0,
    );
}

export function cloneInputBoardDraft(source: InputBoardDraft): InputBoardDraft {
  return {
    ...source,
    startTime: { ...source.startTime },
    endTime: { ...source.endTime },
    projectCatalog: cloneProjectCatalog(source.projectCatalog),
    projectEntries: source.projectEntries.map((entry) => ({
      ...entry,
      timeInputMode: { ...entry.timeInputMode },
      rangeStart: { ...entry.rangeStart },
      rangeEnd: { ...entry.rangeEnd },
      minutes: { ...entry.minutes },
      taskName: { ...entry.taskName },
      place: { ...entry.place },
      placeDetail: {
        plan: entry.placeDetail?.plan ?? '',
        actual: entry.placeDetail?.actual ?? '',
      },
      note: { ...entry.note },
      recentTaskNames: [...entry.recentTaskNames],
    })),
    auxEntries: source.auxEntries.map((entry) => ({ ...entry })),
  };
}

export function createEmptyInputBoardDraft(
  date: string,
  projectCatalog: ProjectCatalogItem[],
): InputBoardDraft {
  return {
    date,
    currentMode: 'plan',
    lunchMinutes: 60,
    startTime: {
      plan: '',
      actual: '',
    },
    endTime: {
      plan: '',
      actual: '',
    },
    projectCatalog: cloneProjectCatalog(projectCatalog),
    projectEntries: [createProjectEntry()],
    auxEntries: [],
  };
}

export function shiftIsoDate(date: string, deltaDays: number) {
  const current = new Date(`${date}T00:00:00`);
  const shifted = new Date(current.getFullYear(), current.getMonth(), current.getDate() + deltaDays);
  const year = shifted.getFullYear();
  const month = String(shifted.getMonth() + 1).padStart(2, '0');
  const day = String(shifted.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function shiftIsoMonth(anchorDate: string, deltaMonths: number) {
  const current = new Date(`${anchorDate}T00:00:00`);
  const shifted = new Date(current.getFullYear(), current.getMonth() + deltaMonths, 1);
  const year = shifted.getFullYear();
  const month = String(shifted.getMonth() + 1).padStart(2, '0');

  return `${year}-${month}-01`;
}

function buildMonthDates(anchorDate: string) {
  const monthStart = new Date(`${anchorDate.slice(0, 7)}-01T00:00:00`);
  const current = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
  const monthDates: string[] = [];

  while (current.getMonth() === monthStart.getMonth()) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    monthDates.push(`${year}-${month}-${day}`);
    current.setDate(current.getDate() + 1);
  }

  return monthDates;
}

export function formatDateLabel(date: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(`${date}T00:00:00`));
}

export function formatMonthLabel(date: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'long',
  }).format(new Date(`${date}T00:00:00`));
}

export function formatMinutes(value: number | null) {
  if (value === null) {
    return '--';
  }

  const sign = value < 0 ? '-' : '';
  const absolute = Math.abs(value);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;

  if (hours === 0) {
    return `${sign}${minutes}分`;
  }

  return `${sign}${hours}時間${String(minutes).padStart(2, '0')}分`;
}

export function formatMinutesShort(value: number | null) {
  return formatHoursDecimal(value);
}

export function formatMinutesDetailed(value: number | null) {
  if (value === null) {
    return '--';
  }

  const sign = value < 0 ? '-' : '';
  const absolute = Math.abs(value);
  return `${sign}${formatMinutesShort(absolute)} (${sign}${absolute}分)`;
}

export function formatHoursDecimal(value: number | null) {
  if (value === null) {
    return '--';
  }

  const sign = value < 0 ? '-' : '';
  const hours = (Math.abs(value) / 60).toFixed(2).replace(/\.?0+$/, '');
  return `${sign}${hours}h`;
}

export function formatHoursDetailed(value: number | null) {
  if (value === null) {
    return '--';
  }

  return `${formatHoursDecimal(value)}（${value}分）`;
}

export function formatHoursMinutesLabel(value: number | null) {
  if (value === null) {
    return '--';
  }

  const sign = value < 0 ? '-' : '';
  const absolute = Math.abs(value);
  const hours = (absolute / 60).toFixed(2).replace(/\.?0+$/, '');
  return `${sign}${hours}H（${sign}${absolute}分）`;
}

export function formatSignedHoursDecimal(value: number | null) {
  if (value === null) {
    return '--';
  }

  if (value === 0) {
    return '±0h';
  }

  return `${value > 0 ? '+' : '-'}${formatHoursDecimal(Math.abs(value))}`;
}

export function formatSignedMinutes(value: number | null) {
  if (value === null) {
    return '--';
  }

  if (value === 0) {
    return '±0分';
  }

  return `${value > 0 ? '+' : '-'}${formatMinutes(Math.abs(value))}`;
}

export function formatSignedMinutesDetailed(value: number | null) {
  if (value === null) {
    return '--';
  }

  if (value === 0) {
    return '±0h (0分)';
  }

  const sign = value > 0 ? '+' : '-';
  const absolute = Math.abs(value);
  return `${sign}${formatMinutesShort(absolute)} (${sign}${absolute}分)`;
}

export function buildDifferenceState(differenceMinutes: number | null): DifferenceState {
  if (differenceMinutes === null) {
    return {
      label: '未計算',
      detail: '勤務開始と勤務終了がそろうと、差分を計算できます。',
      tone: 'info',
    };
  }

  if (differenceMinutes === 0) {
    return {
      label: 'ぴったり',
      detail: '勤務対象時間とPJ配賦が一致しています',
      tone: 'neutral',
    };
  }

  if (differenceMinutes > 0) {
    return {
      label: `入力過少 ${formatHoursDecimal(differenceMinutes)}`,
      detail: '勤務対象時間に対してPJ時間が足りません',
      tone: 'caution',
    };
  }

  return {
    label: `入力超過 ${formatHoursDecimal(Math.abs(differenceMinutes))}`,
    detail: '勤務対象時間を超えてPJ時間が入っています',
    tone: 'danger',
  };
}

export function roundToQuarter(minutes: number) {
  if (!Number.isFinite(minutes)) {
    return 0;
  }

  return Math.max(0, Math.round(minutes / 15) * 15);
}

export function normalizeProjectCode(projectCode: string) {
  return projectCode.trim().toUpperCase();
}

function uniqueTextList(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function isProjectCatalogItemActive(project: ProjectCatalogItem) {
  return project.isActive !== false;
}

export function sanitizeProjectCatalogItem(project: ProjectCatalogItem): ProjectCatalogItem {
  const aliases = uniqueTextList(project.aliases ?? []);
  const recentTaskNames = uniqueTextList(project.recentTaskNames ?? []);
  return {
    ...project,
    projectCode: project.projectCode.trim(),
    projectName: project.projectName.trim(),
    timesheetProjectLabel: project.timesheetProjectLabel?.trim() || undefined,
    monthlyBudgetMinutes:
      project.monthlyBudgetMinutes === undefined ? undefined : roundToQuarter(project.monthlyBudgetMinutes),
    defaultTaskName: project.defaultTaskName?.trim() || undefined,
    isActive: project.isActive !== false,
    pinned: Boolean(project.pinned),
    recent: Boolean(project.recent),
    needsComment: Boolean(project.needsComment),
    aliases: aliases.length > 0 ? aliases : undefined,
    recentTaskNames,
  };
}

function buildRecentProjectRank(recentProjectCodes: string[]) {
  const rank = new Map<string, number>();
  recentProjectCodes.forEach((projectCode, index) => {
    const normalizedProjectCode = normalizeProjectCode(projectCode);
    if (!normalizedProjectCode || rank.has(normalizedProjectCode)) {
      return;
    }

    rank.set(normalizedProjectCode, index);
  });
  return rank;
}

function compareRecentProjectRank(
  left: ProjectCatalogItem,
  right: ProjectCatalogItem,
  recentProjectRank: Map<string, number>,
) {
  const leftRank = recentProjectRank.get(normalizeProjectCode(left.projectCode));
  const rightRank = recentProjectRank.get(normalizeProjectCode(right.projectCode));

  if (leftRank === undefined && rightRank === undefined) {
    return 0;
  }

  if (leftRank === undefined) {
    return 1;
  }

  if (rightRank === undefined) {
    return -1;
  }

  return leftRank - rightRank;
}

function compareProjectCatalogPriority(
  left: ProjectCatalogItem,
  right: ProjectCatalogItem,
  recentProjectRank: Map<string, number>,
) {
  if (isProjectCatalogItemActive(left) !== isProjectCatalogItemActive(right)) {
    return isProjectCatalogItemActive(left) ? -1 : 1;
  }

  if (left.pinned !== right.pinned) {
    return left.pinned ? -1 : 1;
  }

  const recentRankComparison = compareRecentProjectRank(left, right, recentProjectRank);
  if (recentRankComparison !== 0) {
    return recentRankComparison;
  }

  return left.projectCode.localeCompare(right.projectCode, 'ja');
}

export function sortProjectCatalog(
  catalog: ProjectCatalogItem[],
  options: { recentProjectCodes?: string[] } = {},
) {
  const recentProjectRank = buildRecentProjectRank(options.recentProjectCodes ?? []);
  return [...catalog]
    .map((project) => sanitizeProjectCatalogItem(project))
    .sort((left, right) => compareProjectCatalogPriority(left, right, recentProjectRank));
}

export function collectRecentProjectCodes(records: Record<string, InputBoardDraft>) {
  const recentProjectCodes: string[] = [];
  const seenProjectCodes = new Set<string>();
  const dates = Object.keys(records).sort((left, right) => right.localeCompare(left));

  dates.forEach((date) => {
    const board = records[date];
    [...board.projectEntries].reverse().forEach((entry) => {
      const normalizedProjectCode = normalizeProjectCode(entry.projectCode);
      if (!normalizedProjectCode || seenProjectCodes.has(normalizedProjectCode)) {
        return;
      }

      seenProjectCodes.add(normalizedProjectCode);
      recentProjectCodes.push(normalizedProjectCode);
    });
  });

  return recentProjectCodes;
}

function collectProjectEntryTaskNames(entry: ProjectEntry, preferredMode: EntryMode) {
  const counterpartMode: EntryMode = preferredMode === 'plan' ? 'actual' : 'plan';
  return uniqueTextList([entry.taskName[preferredMode], entry.taskName[counterpartMode]]);
}

export function collectRecentTaskNamesByProject(
  records: Record<string, InputBoardDraft>,
  preferredMode: EntryMode,
) {
  const recentTaskNamesByProject = new Map<string, string[]>();
  const seenTaskNamesByProject = new Map<string, Set<string>>();
  const dates = Object.keys(records).sort((left, right) => right.localeCompare(left));

  dates.forEach((date) => {
    const board = records[date];
    [...board.projectEntries].reverse().forEach((entry) => {
      const normalizedProjectCode = normalizeProjectCode(entry.projectCode);
      if (!normalizedProjectCode) {
        return;
      }

      const entryTaskNames = collectProjectEntryTaskNames(entry, preferredMode);
      if (entryTaskNames.length === 0) {
        return;
      }

      const projectTaskNames = recentTaskNamesByProject.get(normalizedProjectCode) ?? [];
      const seenTaskNames = seenTaskNamesByProject.get(normalizedProjectCode) ?? new Set<string>();

      entryTaskNames.forEach((taskName) => {
        if (seenTaskNames.has(taskName)) {
          return;
        }

        seenTaskNames.add(taskName);
        projectTaskNames.push(taskName);
      });

      if (projectTaskNames.length > 0) {
        recentTaskNamesByProject.set(normalizedProjectCode, projectTaskNames);
        seenTaskNamesByProject.set(normalizedProjectCode, seenTaskNames);
      }
    });
  });

  return recentTaskNamesByProject;
}

export function resolveRecentProjects(
  catalog: ProjectCatalogItem[],
  recentProjectCodes: string[],
  options: { includeInactive?: boolean; excludePinned?: boolean } = {},
) {
  const catalogMap = new Map(
    catalog.map((project) => [normalizeProjectCode(project.projectCode), sanitizeProjectCatalogItem(project)]),
  );

  return recentProjectCodes.flatMap((projectCode) => {
    const project = catalogMap.get(normalizeProjectCode(projectCode));
    if (!project) {
      return [];
    }

    if (!options.includeInactive && !isProjectCatalogItemActive(project)) {
      return [];
    }

    if (options.excludePinned && project.pinned) {
      return [];
    }

    return [project];
  });
}

export function upsertProjectCatalogItem(
  catalog: ProjectCatalogItem[],
  nextProject: ProjectCatalogItem,
  previousProjectCode?: string,
) {
  const sanitizedProject = sanitizeProjectCatalogItem(nextProject);
  const normalizedNextCode = normalizeProjectCode(sanitizedProject.projectCode);
  const normalizedPreviousCode = normalizeProjectCode(previousProjectCode ?? sanitizedProject.projectCode);
  let replaced = false;

  const nextCatalog = catalog.map((project) => {
    const normalizedProjectCode = normalizeProjectCode(project.projectCode);
    if (normalizedProjectCode !== normalizedPreviousCode && normalizedProjectCode !== normalizedNextCode) {
      return sanitizeProjectCatalogItem(project);
    }

    replaced = true;
    return {
      ...sanitizeProjectCatalogItem(project),
      ...sanitizedProject,
    };
  });

  if (!replaced) {
    nextCatalog.push(sanitizedProject);
  }

  return sortProjectCatalog(nextCatalog);
}

export function formatProjectSearchLabel(projectCode: string, projectName: string) {
  if (!projectCode && !projectName) {
    return '';
  }

  if (projectName) {
    return projectName;
  }

  return projectCode;
}

export function toTimeMinutes(value: string) {
  const matched = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!matched) {
    return null;
  }

  const hours = Number(matched[1]);
  const minutes = Number(matched[2]);
  const totalMinutes = hours * 60 + minutes;
  if (Number.isNaN(hours) || Number.isNaN(minutes) || minutes > 59 || totalMinutes > MAX_TIME_INPUT_MINUTES) {
    return null;
  }

  return totalMinutes;
}

export function isQuarterHourTime(value: string) {
  const minutes = toTimeMinutes(value);
  return minutes !== null && minutes % 15 === 0;
}

export function calculateTimeRangeMinutes(startTime: string, endTime: string) {
  const range = toValidRange(startTime, endTime);
  if (!range) {
    return null;
  }

  return range.end - range.start;
}

export function calculateTimeRangeMinutesExcludingLunch(
  startTime: string,
  endTime: string,
  lunchMinutes: number,
) {
  const range = toValidRange(startTime, endTime);
  if (!range) {
    return null;
  }

  const lunchRange = getLunchRange(lunchMinutes);
  const clippedLunchRange = lunchRange ? clipRange(lunchRange, range) : null;
  const lunchDeductionMinutes = clippedLunchRange ? clippedLunchRange.end - clippedLunchRange.start : 0;

  return Math.max(0, range.end - range.start - lunchDeductionMinutes);
}

export function searchProjectCatalog(
  catalog: ProjectCatalogItem[],
  query: string,
  options: { includeInactive?: boolean; recentProjectCodes?: string[] } = {},
) {
  const keyword = query.trim().toLowerCase();
  if (!keyword) {
    return [];
  }

  const recentProjectRank = buildRecentProjectRank(options.recentProjectCodes ?? []);

  return catalog
    .filter((project) => options.includeInactive || isProjectCatalogItemActive(project))
    .map((project) => {
      const aliases = project.aliases ?? [];
      const haystacks = [project.projectCode, project.projectName, ...aliases, ...project.recentTaskNames].map(
        (value) => value.toLowerCase(),
      );

      const code = project.projectCode.toLowerCase();
      const name = project.projectName.toLowerCase();
      const aliasValues = aliases.map((alias) => alias.toLowerCase());

      let score = Number.POSITIVE_INFINITY;
      if (code.startsWith(keyword)) {
        score = 0;
      } else if (code.includes(keyword)) {
        score = 1;
      } else if (name.startsWith(keyword)) {
        score = 2;
      } else if (name.includes(keyword)) {
        score = 3;
      } else if (aliasValues.some((value) => value.startsWith(keyword))) {
        score = 4;
      } else if (aliasValues.some((value) => value.includes(keyword))) {
        score = 5;
      } else if (haystacks.some((value) => value.includes(keyword))) {
        score = 6;
      }

      return {
        project,
        score,
      };
    })
    .filter((item) => item.score !== Number.POSITIVE_INFINITY)
    .sort((left, right) => {
      if (left.score !== right.score) {
        return left.score - right.score;
      }

      if (isProjectCatalogItemActive(left.project) !== isProjectCatalogItemActive(right.project)) {
        return isProjectCatalogItemActive(left.project) ? -1 : 1;
      }

      if (left.project.pinned !== right.project.pinned) {
        return left.project.pinned ? -1 : 1;
      }

      const recentRankComparison = compareRecentProjectRank(left.project, right.project, recentProjectRank);
      if (recentRankComparison !== 0) {
        return recentRankComparison;
      }

      return left.project.projectCode.localeCompare(right.project.projectCode, 'ja');
    })
    .map((item) => item.project);
}

export function buildTaskSuggestions(
  entry: ProjectEntry,
  catalog: ProjectCatalogItem[],
  recentTaskNames: string[] = [],
) {
  const resolved = catalog.find((project) => project.projectCode === entry.projectCode) ?? null;
  return uniqueTextList([...recentTaskNames, ...entry.recentTaskNames, ...(resolved?.recentTaskNames ?? [])]);
}

export function applyProjectSelection(entry: ProjectEntry, project: ProjectCatalogItem): ProjectEntry {
  return {
    ...entry,
    projectSearch: formatProjectSearchLabel(project.projectCode, project.projectName),
    projectCode: project.projectCode,
    projectName: project.projectName,
    category: project.category,
    needsComment: Boolean(project.needsComment),
    recentTaskNames: Array.from(new Set([...project.recentTaskNames, ...entry.recentTaskNames].filter(Boolean))),
  };
}

export function updateProjectSearch(entry: ProjectEntry, projectSearch: string): ProjectEntry {
  const trimmed = projectSearch.trimStart();

  if (!trimmed) {
    return {
      ...entry,
      projectSearch: '',
      projectCode: '',
      projectName: '',
      category: null,
      needsComment: false,
    };
  }

  return {
    ...entry,
    projectSearch,
    projectCode: '',
    projectName: '',
    category: null,
    needsComment: false,
  };
}

export function updateProjectCatalogBudget(
  catalog: ProjectCatalogItem[],
  projectCode: string,
  nextBudgetMinutes: number,
) {
  const normalizedProjectCode = normalizeProjectCode(projectCode);
  const roundedBudget = roundToQuarter(nextBudgetMinutes);

  return catalog.map((project) =>
    normalizeProjectCode(project.projectCode) === normalizedProjectCode
      ? {
          ...project,
          monthlyBudgetMinutes: roundedBudget,
        }
      : project,
  );
}

export function createProjectEntry(project?: ProjectCatalogItem): ProjectEntry {
  return {
    id: createId('project'),
    projectSearch: project ? formatProjectSearchLabel(project.projectCode, project.projectName) : '',
    projectCode: project?.projectCode ?? '',
    projectName: project?.projectName ?? '',
    category: project?.category ?? null,
    needsComment: Boolean(project?.needsComment),
    timeInputMode: {
      plan: 'duration',
      actual: 'duration',
    },
    rangeStart: {
      plan: '',
      actual: '',
    },
    rangeEnd: {
      plan: '',
      actual: '',
    },
    minutes: {
      plan: 0,
      actual: 0,
    },
    taskName: {
      plan: '',
      actual: '',
    },
    place: {
      plan: project?.defaultPlace ?? 'office',
      actual: project?.defaultPlace ?? 'office',
    },
    placeDetail: {
      plan: '',
      actual: '',
    },
    note: {
      plan: '',
      actual: '',
    },
    recentTaskNames: project?.recentTaskNames ?? [],
  };
}

export function createAuxTimeEntry(mode: EntryMode, type: AuxEntryType): AuxTimeEntry {
  const defaultTimeRanges: Partial<Record<AuxEntryType, { startTime: string; endTime: string }>> = {
    split: {
      startTime: '15:00',
      endTime: '15:15',
    },
    break: {
      startTime: '12:30',
      endTime: '12:45',
    },
    'annual-hour': {
      startTime: '15:00',
      endTime: '16:00',
    },
  };
  const defaultRange = defaultTimeRanges[type];

  return {
    id: createId(type),
    mode,
    type,
    startTime: defaultRange?.startTime ?? '',
    endTime: defaultRange?.endTime ?? '',
    note: '',
  };
}

export function stepTimeValue(value: string, deltaMinutes: number, fallbackValue: string) {
  const baseMinutes = toTimeMinutes(value || fallbackValue);
  if (baseMinutes === null) {
    return fallbackValue;
  }

  const nextMinutes = Math.max(0, Math.min(MAX_TIME_INPUT_MINUTES, baseMinutes + deltaMinutes));
  const roundedMinutes = roundToQuarter(nextMinutes);
  const hours = String(Math.floor(roundedMinutes / 60)).padStart(2, '0');
  const minutes = String(roundedMinutes % 60).padStart(2, '0');

  return `${hours}:${minutes}`;
}

export function stepTimeValueExcludingLunch(
  value: string,
  deltaMinutes: number,
  fallbackValue: string,
  lunchMinutes: number,
) {
  const baseMinutes = toTimeMinutes(value || fallbackValue);
  if (baseMinutes === null) {
    return fallbackValue;
  }

  const roundedBaseMinutes = roundToQuarter(baseMinutes);
  const direction = deltaMinutes >= 0 ? 1 : -1;
  let cursor = roundedBaseMinutes;
  let remaining = Math.min(MAX_TIME_INPUT_MINUTES, Math.abs(deltaMinutes));
  const lunchRange = getLunchRange(lunchMinutes);

  while (remaining > 0 && cursor >= 0 && cursor <= MAX_TIME_INPUT_MINUTES) {
    if (lunchRange) {
      if (direction > 0 && cursor >= lunchRange.start && cursor < lunchRange.end) {
        cursor = lunchRange.end;
        continue;
      }

      if (direction < 0 && cursor > lunchRange.start && cursor <= lunchRange.end) {
        cursor = lunchRange.start;
        continue;
      }
    }

    const nextCursor = Math.max(0, Math.min(MAX_TIME_INPUT_MINUTES, cursor + direction * 15));
    if (nextCursor === cursor) {
      break;
    }

    const stepRange = buildRange(Math.min(cursor, nextCursor), Math.max(cursor, nextCursor));
    const overlapsLunch = lunchRange && stepRange ? clipRange(stepRange, lunchRange) : null;
    cursor = nextCursor;

    if (!overlapsLunch) {
      remaining = Math.max(0, remaining - 15);
    }
  }

  const roundedMinutes = roundToQuarter(cursor);
  const hours = String(Math.floor(roundedMinutes / 60)).padStart(2, '0');
  const minutes = String(roundedMinutes % 60).padStart(2, '0');

  return `${hours}:${minutes}`;
}

function hasLunchBreakBetween(startMinutes: number, endMinutes: number, lunchMinutes: number) {
  const lunchRange = getLunchRange(lunchMinutes);
  if (!lunchRange) {
    return false;
  }

  const workRange = buildRange(startMinutes, endMinutes);
  if (!workRange) {
    return false;
  }

  return clipRange(workRange, lunchRange) !== null;
}

function calculateSummaryTargetMinutes(
  startTime: string,
  allocationMinutes: number,
  auxMinutes: number,
  lunchMinutes: number,
) {
  const startMinutes = toTimeMinutes(startTime);
  if (startMinutes === null) {
    return allocationMinutes + auxMinutes + lunchMinutes;
  }

  const projectedEnd = stepTimeValueExcludingLunch(
    startTime,
    allocationMinutes + auxMinutes,
    startTime,
    lunchMinutes,
  );
  const projectedEndMinutes = toTimeMinutes(projectedEnd);
  if (projectedEndMinutes === null) {
    return allocationMinutes + auxMinutes + lunchMinutes;
  }

  const lunchDeductionMinutes = hasLunchBreakBetween(startMinutes, projectedEndMinutes, lunchMinutes)
    ? lunchMinutes
    : 0;

  return allocationMinutes + auxMinutes + lunchDeductionMinutes;
}

export function inferSummaryTimeRange(
  startTime: string,
  allocationMinutes: number,
  auxMinutes: number,
  lunchMinutes: number,
) {
  const targetMinutes = calculateSummaryTargetMinutes(startTime, allocationMinutes, auxMinutes, lunchMinutes);
  if (targetMinutes <= 0) {
    return {
      startTime: '',
      endTime: '',
    };
  }

  const startMinutes = toTimeMinutes(startTime);
  if (startMinutes === null) {
    return {
      startTime: '',
      endTime: '',
    };
  }

  const endMinutes = startMinutes + targetMinutes;
  if (endMinutes > MAX_TIME_INPUT_MINUTES) {
    return {
      startTime: '',
      endTime: '',
    };
  }

  const hours = String(Math.floor(endMinutes / 60)).padStart(2, '0');
  const minutes = String(endMinutes % 60).padStart(2, '0');

  return {
    startTime,
    endTime: `${hours}:${minutes}`,
  };
}

function calculateModeMetrics(board: InputBoardDraft, mode: EntryMode): ModeMetrics {
  const splitMinutes = calculateAuxMinutes(board.auxEntries, mode, 'split', board.lunchMinutes);
  const breakMinutes = calculateAuxMinutes(board.auxEntries, mode, 'break', board.lunchMinutes);
  const annualHourMinutes = calculateAuxMinutes(board.auxEntries, mode, 'annual-hour', board.lunchMinutes);
  const allocationTotalMinutes = board.projectEntries.reduce((total, entry) => total + entry.minutes[mode], 0);
  const annualLeaveBaseEntries = getModeAnnualLeaveBaseEntries(board.auxEntries, mode);
  const annualLeaveBaseType = annualLeaveBaseEntries[0]?.type ?? null;
  const annualLeaveConflict = annualLeaveBaseEntries.length > 1;
  const ftSettlementTargetMinutes = buildFtSettlementTargetMinutes(annualLeaveBaseType, annualHourMinutes);

  if (annualLeaveBaseType === 'annual-day') {
    return {
      splitMinutes,
      breakMinutes,
      annualHourMinutes,
      annualLeaveBaseType,
      annualLeaveConflict,
      workSpanMinutes: 0,
      lunchDeductionMinutes: 0,
      workTargetMinutes: 0,
      allocationTotalMinutes,
      differenceMinutes: 0,
      ftSettlementTargetMinutes,
      ftSettlementMinutes: 0,
    };
  }

  const workRange = toValidRange(board.startTime[mode], board.endTime[mode]);

  if (!workRange) {
    return {
      splitMinutes,
      breakMinutes,
      annualHourMinutes,
      annualLeaveBaseType,
      annualLeaveConflict,
      workSpanMinutes: null,
      lunchDeductionMinutes: null,
      workTargetMinutes: null,
      allocationTotalMinutes,
      differenceMinutes: null,
      ftSettlementTargetMinutes,
      ftSettlementMinutes: null,
    };
  }

  const lunchRange = getLunchRange(board.lunchMinutes);
  const clippedLunchRange = lunchRange ? clipRange(lunchRange, workRange) : null;
  const lunchDeductionMinutes = clippedLunchRange ? clippedLunchRange.end - clippedLunchRange.start : 0;
  const effectiveAuxMinutes = sumRangeMinutes(
    getEffectiveAuxRanges(board.auxEntries, mode, workRange, clippedLunchRange),
  );
  const workSpanMinutes = workRange.end - workRange.start;
  const workTargetMinutes = Math.max(0, workSpanMinutes - lunchDeductionMinutes - effectiveAuxMinutes);

  return {
    splitMinutes,
    breakMinutes,
    annualHourMinutes,
    annualLeaveBaseType,
    annualLeaveConflict,
    workSpanMinutes,
    lunchDeductionMinutes,
    workTargetMinutes,
    allocationTotalMinutes,
    differenceMinutes: workTargetMinutes - allocationTotalMinutes,
    ftSettlementTargetMinutes,
    ftSettlementMinutes: workTargetMinutes - ftSettlementTargetMinutes,
  };
}

export function calculateInputBoardMetrics(board: InputBoardDraft): InputBoardMetrics {
  return {
    plan: calculateModeMetrics(board, 'plan'),
    actual: calculateModeMetrics(board, 'actual'),
  };
}

export function isModeTouched(board: InputBoardDraft, mode: EntryMode) {
  if (board.startTime[mode] || board.endTime[mode]) {
    return true;
  }

  if (
    board.projectEntries.some(
      (entry) =>
        entry.minutes[mode] > 0 ||
        entry.taskName[mode].trim() !== '' ||
        entry.note[mode].trim() !== '' ||
        entry.rangeStart[mode].trim() !== '' ||
        entry.rangeEnd[mode].trim() !== '',
    )
  ) {
    return true;
  }

  return board.auxEntries.some(
    (entry) =>
      entry.mode === mode &&
      (isAnnualLeaveBaseType(entry.type) ||
        entry.startTime.trim() !== '' ||
        entry.endTime.trim() !== '' ||
        entry.note.trim() !== ''),
  );
}

export function getModeInputStatus(board: InputBoardDraft, mode: EntryMode): DayInputStatus {
  if (!isModeTouched(board, mode)) {
    return 'empty';
  }

  const warnings = collectInputBoardWarnings(board, mode);
  const metrics = calculateInputBoardMetrics(board)[mode];

  if (warnings.length === 0 && metrics.workTargetMinutes !== null && metrics.differenceMinutes === 0) {
    return 'done';
  }

  return 'partial';
}

export function collectInputBoardWarnings(board: InputBoardDraft, mode: EntryMode): InputBoardWarning[] {
  if (!isModeTouched(board, mode)) {
    return [];
  }

  const metrics = calculateModeMetrics(board, mode);
  const warnings: InputBoardWarning[] = [];

  if (metrics.annualLeaveConflict) {
    warnings.push({
      id: 'annual-leave-conflict',
      tone: 'caution',
      title: '年休設定を見直してください',
      detail: '1日休 / AM休 / PM休 は同じモードで1つだけ選んでください。',
    });
  }

  if (metrics.annualLeaveBaseType === 'annual-day') {
    return warnings;
  }

  const differenceState = buildDifferenceState(metrics.differenceMinutes);

  if (metrics.workTargetMinutes === null) {
    warnings.push({
      id: 'time-range',
      tone: 'caution',
      title: '勤務開始と勤務終了を入力してください',
      detail: '開始と終了がそろうと、勤務対象時間と差分を計算できます。',
    });
  } else if (differenceState.tone === 'caution' || differenceState.tone === 'danger') {
    warnings.push({
      id: 'difference',
      tone: differenceState.tone,
      title: differenceState.label,
      detail: differenceState.detail,
    });
  }

  const unresolvedProjects = board.projectEntries.filter((entry) => {
    const hasMinutes = entry.minutes[mode] > 0;
    return hasMinutes && entry.projectCode.trim() === '';
  });

  if (unresolvedProjects.length > 0) {
    warnings.push({
      id: 'project-code',
      tone: 'caution',
      title: 'PJが未選択の行があります',
      detail: `${unresolvedProjects.length}件の行でPJマスタ選択がまだです。`,
    });
  }

  const missingTaskRows = board.projectEntries.filter(
    (entry) => entry.minutes[mode] > 0 && entry.taskName[mode].trim() === '',
  );

  if (missingTaskRows.length > 0) {
    warnings.push({
      id: 'task-name',
      tone: 'info',
      title: 'タスク未入力の行があります',
      detail: `${missingTaskRows.length}件の行でタスク名が空欄です。`,
    });
  }

  const invalidSummaryQuarter =
    (board.startTime[mode].trim() !== '' && !isQuarterHourTime(board.startTime[mode])) ||
    (board.endTime[mode].trim() !== '' && !isQuarterHourTime(board.endTime[mode]));

  if (invalidSummaryQuarter) {
    warnings.push({
      id: 'summary-quarter',
      tone: 'caution',
      title: '勤務開始 / 勤務終了は15分単位で入力してください',
      detail: '開始と終了は 00 / 15 / 30 / 45 分でそろえる想定です。',
    });
  }

  const invalidProjectRangeRows = board.projectEntries.filter((entry) => {
    if (entry.timeInputMode[mode] !== 'range') {
      return false;
    }

    const hasRowContent =
      entry.projectCode.trim() !== '' ||
      entry.projectSearch.trim() !== '' ||
      entry.taskName[mode].trim() !== '' ||
      entry.rangeStart[mode].trim() !== '' ||
      entry.rangeEnd[mode].trim() !== '';

    if (!hasRowContent) {
      return false;
    }

    return calculateTimeRangeMinutes(entry.rangeStart[mode], entry.rangeEnd[mode]) === null;
  });

  if (invalidProjectRangeRows.length > 0) {
    warnings.push({
      id: 'project-range',
      tone: 'caution',
      title: 'PJ行の時間帯を確認してください',
      detail: `${invalidProjectRangeRows.length}件の行で開始と終了が未入力、または逆転しています。`,
    });
  }

  const nonQuarterProjectRangeRows = board.projectEntries.filter((entry) => {
    if (entry.timeInputMode[mode] !== 'range') {
      return false;
    }

    return (
      (entry.rangeStart[mode].trim() !== '' && !isQuarterHourTime(entry.rangeStart[mode])) ||
      (entry.rangeEnd[mode].trim() !== '' && !isQuarterHourTime(entry.rangeEnd[mode]))
    );
  });

  if (nonQuarterProjectRangeRows.length > 0) {
    warnings.push({
      id: 'project-range-quarter',
      tone: 'caution',
      title: 'PJ行の時間帯は15分単位でそろえてください',
      detail: `${nonQuarterProjectRangeRows.length}件の行で 00 / 15 / 30 / 45 分以外の時刻が入っています。`,
    });
  }

  const invalidAuxRows = board.auxEntries.filter((entry) => {
    if (entry.mode !== mode || !isAuxRangeType(entry.type)) {
      return false;
    }

    return calculateTimeRangeMinutes(entry.startTime, entry.endTime) === null;
  });

  if (invalidAuxRows.length > 0) {
    warnings.push({
      id: 'aux-time',
      tone: 'caution',
      title: '年休 / 分断の時間帯を確認してください',
      detail: `${invalidAuxRows.length}件で開始と終了が未入力、または逆転しています。`,
    });
  }

  const nonQuarterAuxRows = board.auxEntries.filter((entry) => {
    if (entry.mode !== mode || !isAuxRangeType(entry.type)) {
      return false;
    }

    return (
      (entry.startTime.trim() !== '' && !isQuarterHourTime(entry.startTime)) ||
      (entry.endTime.trim() !== '' && !isQuarterHourTime(entry.endTime))
    );
  });

  if (nonQuarterAuxRows.length > 0) {
    warnings.push({
      id: 'aux-quarter',
      tone: 'caution',
      title: '年休 / 分断は15分単位で入力してください',
      detail: `${nonQuarterAuxRows.length}件で 00 / 15 / 30 / 45 分以外の時刻が入っています。`,
    });
  }

  const missingCommentRows = board.projectEntries.filter(
    (entry) => entry.needsComment && entry.minutes[mode] > 0 && entry.note[mode].trim() === '',
  );

  if (missingCommentRows.length > 0) {
    warnings.push({
      id: 'ses-comment',
      tone: 'info',
      title: 'SESコメントが不足しています',
      detail: `${missingCommentRows.length}件の行でコメントが未入力です。`,
    });
  }

  return warnings;
}

export function getBoardInputStatus(board: InputBoardDraft): DayInputStatus {
  const actualTouched = isModeTouched(board, 'actual');
  const planTouched = isModeTouched(board, 'plan');

  if (!actualTouched && !planTouched) {
    return 'empty';
  }

  return getModeInputStatus(board, actualTouched ? 'actual' : 'plan');
}

export function calculateMonthlySummary(
  records: Record<string, InputBoardDraft>,
  anchorDate: string,
  referenceDate: string,
): MonthlySummary {
  const monthKey = anchorDate.slice(0, 7);
  const boardsInMonth = Object.values(records)
    .filter((board) => board.date.startsWith(monthKey))
    .sort((left, right) => left.date.localeCompare(right.date));
  const fallbackCatalog =
    [...Object.values(records)].sort((left, right) => right.date.localeCompare(left.date))[0]?.projectCatalog ?? [];
  const projectCatalog = boardsInMonth[0]?.projectCatalog ?? fallbackCatalog;
  const budgetMap = new Map(
    projectCatalog.map((project) => [normalizeProjectCode(project.projectCode), project.monthlyBudgetMinutes ?? 0]),
  );
  const boardMap = new Map(boardsInMonth.map((board) => [board.date, board]));
  const days = buildMonthDates(anchorDate).map((date) => {
    const board = boardMap.get(date);
    const isFuture = date > referenceDate;

    if (!board) {
      return {
        date,
        status: 'empty' as DayInputStatus,
        isFuture,
        displayMode: isFuture ? ('plan' as EntryMode) : ('actual' as EntryMode),
        isHoliday: isJapaneseHoliday(date),
        holidayName: getJapaneseHolidayName(date),
        dayOffLabel: getDayOffLabel(date),
        annualLeaveType: null,
        needsAttention: false,
        warningCount: 0,
        workStartTime: '',
        workEndTime: '',
        splitMinutes: 0,
        workplaceLabel: '未設定',
        planAllocationMinutes: 0,
        actualAllocationMinutes: 0,
        planWorkTargetMinutes: null,
        actualWorkTargetMinutes: null,
        differenceMinutes: null,
        overtimeMinutes: 0,
        projectMinutesByCode: {},
      };
    }

    const modeMetrics = calculateInputBoardMetrics(board);
    const actualMetrics = modeMetrics.actual;
    const planMetrics = modeMetrics.plan;
    const displayMode: EntryMode = isFuture ? 'plan' : 'actual';
    const displayMetrics = modeMetrics[displayMode];
    const displayWarnings = collectInputBoardWarnings(board, displayMode);
    const status = getModeInputStatus(board, displayMode);
    const projectMinutesByCode = board.projectEntries.reduce<
      Record<
        string,
        {
          actualMinutes: number;
          planMinutes: number;
          landingMinutes: number;
        }
      >
    >((projectMap, entry) => {
      if (entry.minutes.plan <= 0 && entry.minutes.actual <= 0) {
        return projectMap;
      }

      const projectCode = normalizeProjectCode(entry.projectCode) || 'UNASSIGNED';
      const current = projectMap[projectCode] ?? {
        actualMinutes: 0,
        planMinutes: 0,
        landingMinutes: 0,
      };

      current.actualMinutes += entry.minutes.actual;
      current.planMinutes += entry.minutes.plan;
      current.landingMinutes += entry.minutes.actual + (isFuture ? entry.minutes.plan : 0);
      projectMap[projectCode] = current;
      return projectMap;
    }, {});
    const overtimeMinutes = actualMetrics.ftSettlementMinutes ?? 0;

    return {
      date,
      status,
      isFuture,
      displayMode,
      isHoliday: isJapaneseHoliday(date),
      holidayName: getJapaneseHolidayName(date),
      dayOffLabel: getDayOffLabel(date),
      annualLeaveType: displayMetrics.annualLeaveBaseType,
      needsAttention:
        status === 'partial' &&
        (displayMetrics.workTargetMinutes === null ||
          displayMetrics.differenceMinutes !== 0 ||
          displayWarnings.length > 0),
      warningCount: displayWarnings.length,
      workStartTime: board.startTime[displayMode].trim(),
      workEndTime: board.endTime[displayMode].trim(),
      splitMinutes: displayMetrics.splitMinutes,
      workplaceLabel: buildModeWorkplaceSummary(board, displayMode),
      planAllocationMinutes: planMetrics.allocationTotalMinutes,
      actualAllocationMinutes: actualMetrics.allocationTotalMinutes,
      planWorkTargetMinutes: planMetrics.workTargetMinutes,
      actualWorkTargetMinutes: actualMetrics.workTargetMinutes,
      differenceMinutes: displayMetrics.differenceMinutes,
      overtimeMinutes,
      projectMinutesByCode,
    };
  });

  const monthlyProjectMap = boardsInMonth
      .flatMap((board) =>
        board.projectEntries
          .filter((entry) => entry.minutes.plan > 0 || entry.minutes.actual > 0)
          .map((entry) => {
            const resolvedProjectCode = normalizeProjectCode(entry.projectCode);
            const isFuture = board.date > referenceDate;

            return {
              date: board.date,
              projectCode: resolvedProjectCode || 'UNASSIGNED',
              projectName: entry.projectName || resolvedProjectCode || 'PJ未選択',
              category: entry.category,
              landingMinutes: entry.minutes.actual + (isFuture ? entry.minutes.plan : 0),
              actualMinutes: entry.minutes.actual,
            };
          }),
      )
      .reduce((projectMap, entry) => {
        const current = projectMap.get(entry.projectCode);

        if (current) {
          current.landingMinutes += entry.landingMinutes;
          current.actualMinutes += entry.actualMinutes;
          current.daySet.add(entry.date);
          if ((current.projectName === '' || current.projectName === current.projectCode) && entry.projectName) {
            current.projectName = entry.projectName;
          }
          if (!current.category && entry.category) {
            current.category = entry.category;
          }
          return projectMap;
        }

        projectMap.set(entry.projectCode, {
          projectCode: entry.projectCode,
          projectName: entry.projectName,
          category: entry.category,
          landingMinutes: entry.landingMinutes,
          actualMinutes: entry.actualMinutes,
          daySet: new Set([entry.date]),
        });
        return projectMap;
      }, new Map<
        string,
        {
          projectCode: string;
          projectName: string;
          category: ProjectCategory | null;
          landingMinutes: number;
          actualMinutes: number;
          daySet: Set<string>;
        }
      >());

  for (const project of projectCatalog) {
    const projectCode = normalizeProjectCode(project.projectCode);
    if (monthlyProjectMap.has(projectCode)) {
      continue;
    }

    monthlyProjectMap.set(projectCode, {
      projectCode,
      projectName: project.projectName,
      category: project.category,
      landingMinutes: 0,
      actualMinutes: 0,
      daySet: new Set(),
    });
  }

  const projects = Array.from(monthlyProjectMap.values())
    .map((project) => {
      const budgetMinutes = budgetMap.get(project.projectCode) ?? 0;

      return {
        projectCode: project.projectCode,
      projectName: project.projectName,
      category: project.category,
      budgetMinutes,
      actualMinutes: project.actualMinutes,
      landingMinutes: project.landingMinutes,
      differenceMinutes: project.landingMinutes - budgetMinutes,
      progressRate: budgetMinutes > 0 ? project.actualMinutes / budgetMinutes : null,
      activeDays: project.daySet.size,
    };
  })
    .sort((left, right) => {
      const leftTotal = Math.max(left.actualMinutes, left.budgetMinutes, left.landingMinutes);
      const rightTotal = Math.max(right.actualMinutes, right.budgetMinutes, right.landingMinutes);

      if (leftTotal !== rightTotal) {
        return rightTotal - leftTotal;
      }

      return left.projectCode.localeCompare(right.projectCode, 'ja');
    });

  const budgetTotalMinutes = projectCatalog.reduce((total, project) => total + (project.monthlyBudgetMinutes ?? 0), 0);
  const actualTotalMinutes = days.reduce((total, day) => total + day.actualAllocationMinutes, 0);
  const futureEstimateMinutes = days
    .filter((day) => day.isFuture)
    .reduce((total, day) => total + day.planAllocationMinutes, 0);

  return {
    monthLabel: formatMonthLabel(anchorDate),
    enteredDays: days.filter((day) => day.status !== 'empty').length,
    completedDays: days.filter((day) => !day.isFuture && day.status === 'done').length,
    overtimeMinutes: days.filter((day) => !day.isFuture).reduce((total, day) => total + day.overtimeMinutes, 0),
    budgetTotalMinutes,
    actualTotalMinutes,
    landingTotalMinutes: actualTotalMinutes + futureEstimateMinutes,
    attentionDays: days.filter((day) => !day.isFuture && day.needsAttention).length,
    emptyDays: days.filter((day) => !day.isFuture && day.status === 'empty').length,
    futureEstimateMinutes,
    allocationTotalMinutes: actualTotalMinutes,
    workTargetTotalMinutes: days.reduce((total, day) => total + (day.actualWorkTargetMinutes ?? 0), 0),
    days,
    projects,
  };
}
