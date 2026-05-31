import { useEffect, useRef, useState } from 'react';
import {
  AppWindowHeader,
  type AppTheme,
  type CalendarDayCell,
  DailyWorkspace,
  getDailyNextAction,
  type DensityMode,
  MailHelperSetupDialog,
  MonthlyDayListView,
  MonthlySummaryView,
  UserBootstrapDialog,
} from '../components/daily-input-parts';
import { PageHelpDialog } from '../components/page-help-dialog';
import { ProjectMasterAdmin } from '../components/project-master-admin';
import { ReleaseNotesDialog } from '../components/release-notes-dialog';
import { TimesheetTransferSimulationView } from '../components/timesheet-transfer-sim';
import { UserAdminPanel } from '../components/user-admin-panel';
import { UserReferencePanel } from '../components/user-reference-panel';
import { UserReferenceSnapshotView } from '../components/user-reference-snapshot-view';
import {
  applyProjectSelection,
  calculateTimeRangeMinutesExcludingLunch,
  calculateInputBoardMetrics,
  calculateMonthlySummary,
  cloneInputBoardDraft,
  collectRecentProjectCodes,
  collectRecentTaskNamesByProject,
  collectInputBoardWarnings,
  createAuxTimeEntry,
  createEmptyInputBoardDraft,
  createProjectEntry,
  formatMonthLabel,
  getModeInputStatus,
  isAuxRangeType,
  normalizeProjectCode,
  roundToQuarter,
  stepTimeValue,
  stepTimeValueExcludingLunch,
  sortProjectCatalog,
  shiftIsoDate,
  shiftIsoMonth,
  updateProjectSearch,
} from '../lib/input-board';
import { openPreferredMailCompose } from '../lib/local-mail';
import { buildBoardMailDraft } from '../lib/mail-draft';
import { getDefaultMailRecipientSettings, normalizeMailRecipientSettings } from '../lib/mail-settings';
import { getDayOffLabel, getJapaneseHolidayName, isJapaneseHoliday } from '../lib/japanese-holidays';
import { buildExcelBackupWorkbookDefinition } from '../lib/output/excel-adapter';
import { downloadZipArchive } from '../lib/output/download-zip';
import { downloadExcelBackup, generateExcelBackupBuffer } from '../lib/output/excel-workbook';
import {
  buildDailyListOutputViewModel,
  buildMonthlyOutputViewModel,
  buildProjectMasterOutputViewModel,
  buildTimesheetTransferViewModel,
} from '../lib/output/view-model';
import type { HelpView } from '../lib/page-help';
import { mockInputBoardDraft, mockInputBoardRecords } from '../mock/mock-input-board';
import type { BoardSessionSnapshot } from '../storage/board-storage';
import { loadBoardSession } from '../storage/board-storage';
import { readJsonStorage, writeJsonStorage } from '../storage/browser-storage';
import {
  readCachedBoardSession,
  readCachedBoardViewport,
  readCachedUserProfile,
  saveCachedBoardSession,
  saveCachedBoardViewport,
  saveCachedUserProfile,
} from '../storage/browser-cache';
import {
  buildUserScopedStorageKey,
  defaultCurrentUserId,
  normalizeCurrentUserId,
  normalizeCurrentUserName,
} from '../storage/current-user-storage';
import { setMonthlyBudgetForRecords } from '../storage/monthly-planning-storage';
import { getLatestProjectCatalog, saveProjectMasterToRecords } from '../storage/project-master-storage';
import {
  loadServerBoardSession,
  ServerBoardSessionConflictError,
  saveServerBoardSession,
  saveServerBoardSessionKeepalive,
  sendServerUserHeartbeat,
  serverSourceEnvs,
  type StoredBoardSession,
} from '../storage/server-storage';
import {
  deleteServerAdminUser,
  loadServerAdminStatus,
  loadServerAdminUsers,
  saveServerAdminUser,
  type ServerAdminDashboardAnalysis,
  type ServerAdminMonitoring,
  type ServerAdminRankings,
  type ServerAdminStatus,
  type ServerAdminUserListSummary,
  type ServerAdminUserRecord,
} from '../storage/server-user-admin';
import {
  loadServerReferenceSession,
  loadServerReferenceExportSessions,
  saveServerReferenceFavorites,
  loadServerReferenceUsers,
  type ServerReferenceSession,
  type ServerReferenceUserRecord,
} from '../storage/server-user-reference';
import { defaultUiSettings, readUiSettings, saveUiSettings } from '../storage/settings-storage';
import type {
  MailSendPreview,
  MailRecipientSettings,
} from '../types/mail';
import type {
  AuxEntryType,
  AuxTimeEntry,
  EntryMode,
  InputBoardDraft,
  ProjectTimeInputMode,
  ProjectCatalogItem,
  ProjectEntry,
  WorkPlace,
} from '../types/input-board';

type SelectedItemKey = `project:${string}` | `aux:${string}` | null;
type ActiveView =
  | Exclude<HelpView, 'shared'>
  | 'timesheet-transfer'
  | 'user-admin'
  | 'user-reference'
  | 'user-reference-preview';

interface UserProfile {
  userId: string;
  userName: string;
}

const referenceSelectionStorageKey = 'user-reference-selection-cache';
function getReferenceSelectionStorageKey(userId: string) {
  return buildUserScopedStorageKey(referenceSelectionStorageKey, userId);
}

function normalizeReferenceSelectionIds(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === 'string' ? normalizeCurrentUserId(entry) : ''))
        .filter(Boolean),
    ),
  );

  return normalized;
}

function readCachedReferenceSelection(userId: string) {
  return readJsonStorage(getReferenceSelectionStorageKey(userId), normalizeReferenceSelectionIds) ?? [];
}

function saveCachedReferenceSelection(userIds: string[], userId: string) {
  writeJsonStorage(getReferenceSelectionStorageKey(userId), normalizeReferenceSelectionIds(userIds) ?? []);
}

type IdleCapableWindow = Window & {
  requestIdleCallback?: (callback: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function projectKey(entryId: string): `project:${string}` {
  return `project:${entryId}`;
}

function auxKey(entryId: string): `aux:${string}` {
  return `aux:${entryId}`;
}

function replaceProjectEntry(
  projectEntries: ProjectEntry[],
  entryId: string,
  updater: (entry: ProjectEntry) => ProjectEntry,
) {
  return projectEntries.map((entry) => (entry.id === entryId ? updater(entry) : entry));
}

function replaceAuxEntry(
  auxEntries: AuxTimeEntry[],
  entryId: string,
  updater: (entry: AuxTimeEntry) => AuxTimeEntry,
) {
  return auxEntries.map((entry) => (entry.id === entryId ? updater(entry) : entry));
}

function reorderProjectEntries(projectEntries: ProjectEntry[], sourceId: string, targetId: string) {
  const sourceIndex = projectEntries.findIndex((entry) => entry.id === sourceId);
  const targetIndex = projectEntries.findIndex((entry) => entry.id === targetId);

  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
    return projectEntries;
  }

  const nextEntries = [...projectEntries];
  const [movedEntry] = nextEntries.splice(sourceIndex, 1);
  nextEntries.splice(targetIndex, 0, movedEntry);
  return nextEntries;
}

function getTodayIsoDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getDefaultModeForDate(_date: string): EntryMode {
  return 'plan';
}

function buildExportWorkbookDefinition(
  snapshot: BoardSessionSnapshot,
  profile: UserProfile,
  exportedAt: Date,
  referenceDate: string,
) {
  const latestProjectCatalog = getLatestProjectCatalog(snapshot.recordsByDate, mockInputBoardDraft.projectCatalog);
  const monthlySummary = calculateMonthlySummary(snapshot.recordsByDate, snapshot.monthAnchorDate, referenceDate);
  const dailyListViewModel = buildDailyListOutputViewModel({
    records: snapshot.recordsByDate,
    anchorDate: snapshot.monthAnchorDate,
    referenceDate,
  });
  const monthlyOutputViewModel = buildMonthlyOutputViewModel({
    records: snapshot.recordsByDate,
    anchorDate: snapshot.monthAnchorDate,
    referenceDate,
  });
  const projectMasterOutputViewModel = buildProjectMasterOutputViewModel({
    catalog: sortProjectCatalog(latestProjectCatalog),
    monthlyProjects: monthlySummary.projects,
    monthLabel: monthlyOutputViewModel.monthLabel,
  });

  return buildExcelBackupWorkbookDefinition({
    meta: {
      exportedAt,
      userId: profile.userId,
      userName: profile.userName,
      targetMonth: monthlyOutputViewModel.monthLabel,
    },
    dailyList: dailyListViewModel,
    monthly: monthlyOutputViewModel,
    projectMaster: projectMasterOutputViewModel,
  });
}

function formatZipTimestamp(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  const seconds = String(value.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

function buildReferenceZipFileName(exportedAt: Date, targetMonthKey: string | null) {
  const monthDigits = (targetMonthKey ?? '').replace(/[^\d]/g, '').slice(0, 6) || 'latest';
  return `【oshigoto-techo】管理者参照_対象者一括_${monthDigits}_${formatZipTimestamp(exportedAt)}.zip`;
}

function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  return target.closest('input, textarea, select, [contenteditable="true"]') !== null;
}

function hasPlanData(board: InputBoardDraft) {
  if (board.startTime.plan || board.endTime.plan) {
    return true;
  }

  if (board.auxEntries.some((entry) => entry.mode === 'plan')) {
    return true;
  }

  return board.projectEntries.some(
    (entry) =>
      entry.projectCode.trim() !== '' ||
      entry.taskName.plan.trim() !== '' ||
      entry.note.plan.trim() !== '' ||
      entry.minutes.plan > 0 ||
      entry.rangeStart.plan !== '' ||
      entry.rangeEnd.plan !== '' ||
      entry.timeInputMode.plan === 'range',
  );
}

function hasActualData(board: InputBoardDraft) {
  if (board.startTime.actual || board.endTime.actual) {
    return true;
  }

  if (board.auxEntries.some((entry) => entry.mode === 'actual')) {
    return true;
  }

  return board.projectEntries.some(
    (entry) =>
      entry.projectCode.trim() !== '' ||
      entry.taskName.actual.trim() !== '' ||
      entry.note.actual.trim() !== '' ||
      entry.minutes.actual > 0 ||
      entry.rangeStart.actual !== '' ||
      entry.rangeEnd.actual !== '' ||
      entry.timeInputMode.actual === 'range',
  );
}

function hasProjectEntryModeSpecificData(entry: ProjectEntry, mode: EntryMode) {
  return (
    entry.taskName[mode].trim() !== '' ||
    entry.note[mode].trim() !== '' ||
    entry.minutes[mode] > 0 ||
    entry.rangeStart[mode].trim() !== '' ||
    entry.rangeEnd[mode].trim() !== '' ||
    entry.timeInputMode[mode] === 'range' ||
    (entry.placeDetail?.[mode] ?? '').trim() !== ''
  );
}

function hasCopyablePlanData(board: InputBoardDraft | null | undefined) {
  if (!board) {
    return false;
  }

  if (board.startTime.plan.trim() || board.endTime.plan.trim()) {
    return true;
  }

  if (board.auxEntries.some((entry) => entry.mode === 'plan')) {
    return true;
  }

  return board.projectEntries.some((entry) => hasProjectEntryModeSpecificData(entry, 'plan'));
}

function isBoardEmpty(board: InputBoardDraft) {
  return !hasPlanData(board) && !hasActualData(board) && board.projectEntries.every((entry) => entry.projectCode.trim() === '');
}

function applyDefaultModeIfBoardEmpty(board: InputBoardDraft) {
  const defaultMode = getDefaultModeForDate(board.date);
  if (!isBoardEmpty(board) || board.currentMode === defaultMode) {
    return board;
  }

  return {
    ...board,
    currentMode: defaultMode,
  };
}

function buildClearedProjectEntryForMode(
  entry: ProjectEntry,
  mode: EntryMode,
  projectCatalog: ProjectCatalogItem[],
): ProjectEntry {
  const selectedProject =
    projectCatalog.find(
      (project) => normalizeProjectCode(project.projectCode) === normalizeProjectCode(entry.projectCode),
    ) ?? null;

  return {
    ...entry,
    timeInputMode: {
      ...entry.timeInputMode,
      [mode]: 'duration',
    },
    rangeStart: {
      ...entry.rangeStart,
      [mode]: '',
    },
    rangeEnd: {
      ...entry.rangeEnd,
      [mode]: '',
    },
    minutes: {
      ...entry.minutes,
      [mode]: 0,
    },
    taskName: {
      ...entry.taskName,
      [mode]: '',
    },
    place: {
      ...entry.place,
      [mode]: selectedProject?.defaultPlace ?? 'office',
    },
    placeDetail: {
      plan: entry.placeDetail?.plan ?? '',
      actual: entry.placeDetail?.actual ?? '',
      [mode]: '',
    },
    note: {
      ...entry.note,
      [mode]: '',
    },
  };
}

function cloneProjectEntryWithFreshId(entry: ProjectEntry) {
  return {
    ...entry,
    id: createProjectEntry().id,
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
  };
}

function cloneAuxEntryWithFreshId(entry: AuxTimeEntry) {
  return {
    ...createAuxTimeEntry(entry.mode, entry.type),
    startTime: entry.startTime,
    endTime: entry.endTime,
    note: entry.note,
  };
}

function copyPlanIntoBoard(sourceBoard: InputBoardDraft, targetBoard: InputBoardDraft, targetDate: string) {
  const projectCatalog = targetBoard.projectCatalog.length > 0 ? targetBoard.projectCatalog : sourceBoard.projectCatalog;
  const planEntries = sourceBoard.projectEntries
    .filter((entry) => hasProjectEntryModeSpecificData(entry, 'plan'))
    .map((entry) =>
      cloneProjectEntryWithFreshId(
        buildClearedProjectEntryForMode(entry, 'actual', projectCatalog),
      ),
    );
  const actualEntries = targetBoard.projectEntries
    .filter((entry) => hasProjectEntryModeSpecificData(entry, 'actual'))
    .map((entry) =>
      cloneProjectEntryWithFreshId(
        buildClearedProjectEntryForMode(entry, 'plan', projectCatalog),
      ),
    );
  const projectEntries = [...planEntries, ...actualEntries];

  return applyDefaultModeIfBoardEmpty({
    ...targetBoard,
    date: targetDate,
    currentMode: 'plan',
    startTime: {
      ...targetBoard.startTime,
      plan: sourceBoard.startTime.plan,
    },
    endTime: {
      ...targetBoard.endTime,
      plan: sourceBoard.endTime.plan,
    },
    projectCatalog,
    projectEntries: projectEntries.length > 0 ? projectEntries : [createProjectEntry()],
    auxEntries: [
      ...sourceBoard.auxEntries.filter((entry) => entry.mode === 'plan').map((entry) => cloneAuxEntryWithFreshId(entry)),
      ...targetBoard.auxEntries.filter((entry) => entry.mode === 'actual').map((entry) => cloneAuxEntryWithFreshId(entry)),
    ],
  });
}

function createDefaultBoardForDate(date: string, projectCatalog: ProjectCatalogItem[]) {
  return applyDefaultModeIfBoardEmpty({
    ...createEmptyInputBoardDraft(date, projectCatalog),
    currentMode: getDefaultModeForDate(date),
  });
}

function buildInitialRecords() {
  const today = getTodayIsoDate();

  return {
    ...Object.fromEntries(
      Object.entries(mockInputBoardRecords).map(([date, board]) => {
        const clonedBoard = cloneInputBoardDraft(board);
        return [date, applyDefaultModeIfBoardEmpty(date === today ? { ...clonedBoard, currentMode: getDefaultModeForDate(date) } : clonedBoard)];
      }),
    ),
    [mockInputBoardDraft.date]:
      applyDefaultModeIfBoardEmpty(
        mockInputBoardDraft.date === today
          ? {
              ...cloneInputBoardDraft(mockInputBoardDraft),
              currentMode: getDefaultModeForDate(mockInputBoardDraft.date),
            }
          : cloneInputBoardDraft(mockInputBoardDraft),
      ),
  };
}

function buildBlankRecords(projectCatalog: ProjectCatalogItem[]) {
  const today = getTodayIsoDate();

  return {
    [today]: createDefaultBoardForDate(today, projectCatalog),
  } satisfies Record<string, InputBoardDraft>;
}

function getInitialCurrentDate() {
  return getTodayIsoDate();
}

const initialCachedUserProfile = readCachedUserProfile();
const initialUiSettings = readUiSettings(initialCachedUserProfile?.userId, defaultUiSettings);
const initialBoardSession = createInitialBoardSession(initialCachedUserProfile?.userId);
const initialMailRecipientSettings = getDefaultMailRecipientSettings(initialCachedUserProfile?.userId);

function createInitialBoardSession(userId?: string | null) {
  const normalizedUserId = normalizeCurrentUserId(userId);
  const initialRecords =
    normalizedUserId === defaultCurrentUserId
      ? buildInitialRecords()
      : buildBlankRecords(mockInputBoardDraft.projectCatalog);
  const initialCurrentDate = getInitialCurrentDate();
  const recordsByDate = initialRecords[initialCurrentDate]
    ? initialRecords
    : {
        ...initialRecords,
        [initialCurrentDate]: createDefaultBoardForDate(
          initialCurrentDate,
          getLatestProjectCatalog(initialRecords, mockInputBoardDraft.projectCatalog),
        ),
      };

  return {
    recordsByDate,
    currentDate: initialCurrentDate,
    monthAnchorDate: `${initialCurrentDate.slice(0, 7)}-01`,
  } satisfies BoardSessionSnapshot;
}

function normalizeBoardSessionSnapshot(snapshot: BoardSessionSnapshot) {
  const currentBoard = snapshot.recordsByDate[snapshot.currentDate];

  if (!currentBoard) {
    return {
      ...snapshot,
      recordsByDate: {
        ...snapshot.recordsByDate,
        [snapshot.currentDate]: createDefaultBoardForDate(
          snapshot.currentDate,
          getLatestProjectCatalog(snapshot.recordsByDate, mockInputBoardDraft.projectCatalog),
        ),
      },
    };
  }

  const normalizedBoard = applyDefaultModeIfBoardEmpty(currentBoard);
  if (normalizedBoard === currentBoard) {
    return snapshot;
  }

  return {
    ...snapshot,
    recordsByDate: {
      ...snapshot.recordsByDate,
      [snapshot.currentDate]: normalizedBoard,
    },
  };
}

function normalizeUserProfile(userId: string, userName: string) {
  if (!userId.trim() || !userName.trim()) {
    return null;
  }

  const normalizedUserId = normalizeCurrentUserId(userId);
  const normalizedUserName = normalizeCurrentUserName(userName);

  if (!normalizedUserName) {
    return null;
  }

  return {
    userId: normalizedUserId,
    userName: normalizedUserName,
  } satisfies UserProfile;
}

function applyCachedViewport(snapshot: BoardSessionSnapshot, userId: string) {
  const cachedViewport = readCachedBoardViewport(userId);
  const today = getTodayIsoDate();
  if (!cachedViewport) {
    return ensureSnapshotCurrentDate(snapshot, today);
  }

  return ensureSnapshotCurrentDate({
    ...snapshot,
    currentDate: cachedViewport.currentDate,
    monthAnchorDate: cachedViewport.monthAnchorDate,
  }, today);
}

function ensureSnapshotCurrentDate(snapshot: BoardSessionSnapshot, date: string) {
  const nextRecords = snapshot.recordsByDate[date]
    ? snapshot.recordsByDate
    : {
        ...snapshot.recordsByDate,
        [date]: createDefaultBoardForDate(
          date,
          getLatestProjectCatalog(snapshot.recordsByDate, mockInputBoardDraft.projectCatalog),
        ),
      };

  return {
    ...snapshot,
    recordsByDate: nextRecords,
    currentDate: date,
    monthAnchorDate: `${date.slice(0, 7)}-01`,
  } satisfies BoardSessionSnapshot;
}

function scheduleWhenBrowserIdle(callback: () => void, timeout = 1200) {
  if (typeof window === 'undefined') {
    callback();
    return () => undefined;
  }

  const idleWindow = window as IdleCapableWindow;

  if (idleWindow.requestIdleCallback && idleWindow.cancelIdleCallback) {
    const idleHandle = idleWindow.requestIdleCallback(() => callback(), { timeout });
    return () => idleWindow.cancelIdleCallback?.(idleHandle);
  }

  const timeoutId = window.setTimeout(callback, 0);
  return () => window.clearTimeout(timeoutId);
}

function formatCalendarSummaryLabel(minutes: number) {
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

function buildCalendarDays(
  anchorDate: string,
  selectedDate: string,
  referenceDate: string,
  records: Record<string, InputBoardDraft>,
): CalendarDayCell[] {
  const today = getTodayIsoDate();
  const monthStart = new Date(`${anchorDate.slice(0, 7)}-01T00:00:00`);
  const dayOffset = (monthStart.getDay() + 6) % 7;
  const gridStart = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1 - dayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const current = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    const date = `${year}-${month}-${day}`;
    const board = records[date];
    const isHoliday = isJapaneseHoliday(date);
    const holidayName = getJapaneseHolidayName(date);
    const displayMetrics = board
      ? calculateInputBoardMetrics(board)[date > referenceDate ? 'plan' : 'actual']
      : null;

    return {
      date,
      dayNumber: current.getDate(),
      inMonth: current.getMonth() === monthStart.getMonth(),
      isToday: date === today,
      isSelected: date === selectedDate,
      isWeekend: current.getDay() === 0 || current.getDay() === 6,
      isHoliday,
      holidayName,
      dayOffLabel: getDayOffLabel(date),
      status: board ? getModeInputStatus(board, date > referenceDate ? 'plan' : 'actual') : 'empty',
      summaryLabel:
        displayMetrics && displayMetrics.allocationTotalMinutes > 0
          ? formatCalendarSummaryLabel(displayMetrics.allocationTotalMinutes)
          : '',
    };
  });
}

export function DailyInputScreen() {
  const [recordsByDate, setRecordsByDate] = useState<Record<string, InputBoardDraft>>(initialBoardSession.recordsByDate);
  const [currentDate, setCurrentDate] = useState(initialBoardSession.currentDate);
  const [activeView, setActiveView] = useState<ActiveView>('daily');
  const [theme, setTheme] = useState<AppTheme>(initialUiSettings.theme);
  const [density, setDensity] = useState<DensityMode>(initialUiSettings.density);
  const [guideEnabled, setGuideEnabled] = useState(initialUiSettings.guideEnabled);
  const [greetingEnabled, setGreetingEnabled] = useState(initialUiSettings.greetingEnabled);
  const [simpleModeEnabled, setSimpleModeEnabled] = useState(initialUiSettings.simpleModeEnabled);
  const [isExcelExporting, setIsExcelExporting] = useState(false);
  const [excelExportError, setExcelExportError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState(initialCachedUserProfile?.userId ?? '');
  const [currentUserName, setCurrentUserName] = useState(initialCachedUserProfile?.userName ?? '');
  const [currentUserIdDraft, setCurrentUserIdDraft] = useState(initialCachedUserProfile?.userId ?? '');
  const [currentUserNameDraft, setCurrentUserNameDraft] = useState(initialCachedUserProfile?.userName ?? '');
  const [currentUserMailToDraft, setCurrentUserMailToDraft] = useState(initialMailRecipientSettings.to);
  const [currentUserMailCcDraft, setCurrentUserMailCcDraft] = useState(initialMailRecipientSettings.cc);
  const [mailRecipientSettings, setMailRecipientSettings] = useState<MailRecipientSettings>(initialMailRecipientSettings);
  const [isApplyingCurrentUser, setIsApplyingCurrentUser] = useState(false);
  const [monthAnchorDate, setMonthAnchorDate] = useState(initialBoardSession.monthAnchorDate);
  const [calendarMonthDate, setCalendarMonthDate] = useState(initialBoardSession.monthAnchorDate);
  const [dayListProjectCode, setDayListProjectCode] = useState<string | null>(null);
  const [isBoardSessionReady, setIsBoardSessionReady] = useState(false);
  const [isUserBootstrapOpen, setIsUserBootstrapOpen] = useState(
    !initialCachedUserProfile?.userId || !initialCachedUserProfile?.userName,
  );
  const [serverStorageError, setServerStorageError] = useState<string | null>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [selectedItemKey, setSelectedItemKey] = useState<SelectedItemKey>(null);
  const [autoFocusProjectId, setAutoFocusProjectId] = useState<string | null>(null);
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(null);
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isReleaseNotesDialogOpen, setIsReleaseNotesDialogOpen] = useState(false);
  const [isMailHelperSetupOpen, setIsMailHelperSetupOpen] = useState(false);
  const [isMailSending, setIsMailSending] = useState(false);
  const [mailSendError, setMailSendError] = useState<string | null>(null);
  const [mailSendSuccessMessage, setMailSendSuccessMessage] = useState<string | null>(null);
  const [isQuickProjectDialogOpen, setIsQuickProjectDialogOpen] = useState(false);
  const [adminStatus, setAdminStatus] = useState<ServerAdminStatus>({
    userId: '',
    isAdmin: false,
    isReadOnlyAdmin: false,
    canManageUsers: false,
    canReferenceUsers: false,
  });
  const [adminUsers, setAdminUsers] = useState<ServerAdminUserRecord[]>([]);
  const [adminUserSummary, setAdminUserSummary] = useState<ServerAdminUserListSummary | null>(null);
  const [adminMonitoring, setAdminMonitoring] = useState<ServerAdminMonitoring | null>(null);
  const [adminRankings, setAdminRankings] = useState<ServerAdminRankings | null>(null);
  const [adminDashboardAnalysis, setAdminDashboardAnalysis] = useState<ServerAdminDashboardAnalysis | null>(null);
  const [selectedAdminUserId, setSelectedAdminUserId] = useState<string | null>(null);
  const [isAdminUsersLoading, setIsAdminUsersLoading] = useState(false);
  const [isAdminUserSaving, setIsAdminUserSaving] = useState(false);
  const [isAdminUserDeleting, setIsAdminUserDeleting] = useState(false);
  const [adminUserError, setAdminUserError] = useState<string | null>(null);
  const [referenceUsers, setReferenceUsers] = useState<ServerReferenceUserRecord[]>([]);
  const [selectedReferenceUserId, setSelectedReferenceUserId] = useState<string | null>(null);
  const [selectedReferenceUserIds, setSelectedReferenceUserIds] = useState<string[]>([]);
  const [isReferenceUsersLoading, setIsReferenceUsersLoading] = useState(false);
  const [isReferenceBulkDownloading, setIsReferenceBulkDownloading] = useState(false);
  const [openingReferenceSnapshotUserId, setOpeningReferenceSnapshotUserId] = useState<string | null>(null);
  const [referenceDownloadingUserId, setReferenceDownloadingUserId] = useState<string | null>(null);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [referenceDownloadError, setReferenceDownloadError] = useState<string | null>(null);
  const [referenceDownloadNotice, setReferenceDownloadNotice] = useState<{ tone: 'info' | 'caution'; message: string } | null>(null);
  const [cachedReferenceSelectionIds, setCachedReferenceSelectionIds] = useState<string[]>([]);
  const [favoriteReferenceUserIds, setFavoriteReferenceUserIds] = useState<string[]>([]);
  const [referenceSession, setReferenceSession] = useState<ServerReferenceSession | null>(null);
  const activeUserProfile = currentUserId && currentUserName ? { userId: currentUserId, userName: currentUserName } : null;
  const currentDateRef = useRef(currentDate);
  const monthAnchorDateRef = useRef(monthAnchorDate);
  const activeUserProfileRef = useRef<UserProfile | null>(activeUserProfile);
  const serverSnapshotUpdatedAtRef = useRef<string | null>(null);
  const latestSnapshotRef = useRef(initialBoardSession);
  const mailRecipientSettingsRef = useRef(initialMailRecipientSettings);
  const isBoardSessionReadyRef = useRef(false);
  const pendingSelectedRowFocusRef = useRef(false);
  const pendingPersistenceTimeoutRef = useRef<number | null>(null);
  const cancelPendingIdlePersistenceRef = useRef<(() => void) | null>(null);
  const persistenceQueueRef = useRef(Promise.resolve());
  const referenceFavoritesSaveRequestIdRef = useRef(0);
  const referenceFavoritesLoadedUserIdRef = useRef<string | null>(null);
  const referenceFavoritesPersistedSnapshotRef = useRef('[]');
  const restorableReferenceSelectionIds = cachedReferenceSelectionIds.filter((selectedId) =>
    referenceUsers.some((user) => user.userId === selectedId),
  );
  const availableFavoriteReferenceUserIds = favoriteReferenceUserIds.filter((favoriteUserId) =>
    referenceUsers.some((user) => user.userId === favoriteUserId),
  );

  function setLatestServerSnapshotRevision(session: StoredBoardSession | null) {
    serverSnapshotUpdatedAtRef.current = session?.updatedAt?.trim() ? session.updatedAt : null;
  }

  function applyMailRecipientSettings(nextSettings: Partial<MailRecipientSettings> | null | undefined, userId: string) {
    const normalizedSettings = normalizeMailRecipientSettings(
      nextSettings ?? getDefaultMailRecipientSettings(userId),
    );
    setMailRecipientSettings(normalizedSettings);
    setCurrentUserMailToDraft(normalizedSettings.to);
    setCurrentUserMailCcDraft(normalizedSettings.cc);
  }

  function applyBoardSessionSnapshot(snapshot: BoardSessionSnapshot) {
    const normalizedSnapshot = normalizeBoardSessionSnapshot(snapshot);
    setRecordsByDate(normalizedSnapshot.recordsByDate);
    setCurrentDate(normalizedSnapshot.currentDate);
    setMonthAnchorDate(normalizedSnapshot.monthAnchorDate);
    setCalendarMonthDate(normalizedSnapshot.monthAnchorDate);
    setDayListProjectCode(null);
    setSelectedItemKey(null);
    setAutoFocusProjectId(null);
    setDraggingProjectId(null);
    setIsQuickProjectDialogOpen(false);
    setIsCalendarOpen(false);
    setIsHelpDialogOpen(false);
    setIsReleaseNotesDialogOpen(false);
    setIsMailSending(false);
    setMailSendError(null);
    setMailSendSuccessMessage(null);
  }

  function hydrateBoardSessionSnapshot(snapshot: BoardSessionSnapshot, userId: string) {
    const hydratedSnapshot = applyCachedViewport(snapshot, userId);
    applyBoardSessionSnapshot(hydratedSnapshot);
    latestSnapshotRef.current = hydratedSnapshot;
    saveCachedBoardViewport(
      {
        currentDate: hydratedSnapshot.currentDate,
        monthAnchorDate: hydratedSnapshot.monthAnchorDate,
      },
      userId,
    );
    saveCachedBoardSession(hydratedSnapshot, userId);
  }

  useEffect(() => {
    currentDateRef.current = currentDate;
    monthAnchorDateRef.current = monthAnchorDate;
    latestSnapshotRef.current = {
      recordsByDate,
      currentDate,
      monthAnchorDate,
    };
  }, [recordsByDate, currentDate, monthAnchorDate]);

  useEffect(() => {
    activeUserProfileRef.current = activeUserProfile;
  }, [activeUserProfile]);

  useEffect(() => {
    if (!activeUserProfile) {
      setCachedReferenceSelectionIds([]);
      setFavoriteReferenceUserIds([]);
      referenceFavoritesLoadedUserIdRef.current = null;
      referenceFavoritesPersistedSnapshotRef.current = '[]';
      return;
    }

    setCachedReferenceSelectionIds(readCachedReferenceSelection(activeUserProfile.userId));
    setFavoriteReferenceUserIds([]);
    referenceFavoritesLoadedUserIdRef.current = null;
    referenceFavoritesPersistedSnapshotRef.current = '[]';
  }, [activeUserProfile?.userId]);

  useEffect(() => {
    if (!activeUserProfile || selectedReferenceUserIds.length === 0) {
      return;
    }

    const normalizedSelection = normalizeReferenceSelectionIds(selectedReferenceUserIds) ?? [];
    setCachedReferenceSelectionIds(normalizedSelection);
    saveCachedReferenceSelection(normalizedSelection, activeUserProfile.userId);
  }, [activeUserProfile, selectedReferenceUserIds]);

  useEffect(() => {
    const currentAdminUserId = activeUserProfile?.userId ?? '';
    if (!currentAdminUserId || referenceFavoritesLoadedUserIdRef.current !== currentAdminUserId) {
      return;
    }

    const normalizedFavorites = normalizeReferenceSelectionIds(favoriteReferenceUserIds) ?? [];
    const serializedFavorites = JSON.stringify(normalizedFavorites);
    if (serializedFavorites === referenceFavoritesPersistedSnapshotRef.current) {
      return;
    }

    const requestId = referenceFavoritesSaveRequestIdRef.current + 1;
    referenceFavoritesSaveRequestIdRef.current = requestId;
    referenceFavoritesPersistedSnapshotRef.current = serializedFavorites;
    let isCancelled = false;

    void saveServerReferenceFavorites(currentAdminUserId, normalizedFavorites)
      .then((savedFavoriteUserIds) => {
        if (
          isCancelled ||
          referenceFavoritesSaveRequestIdRef.current !== requestId ||
          activeUserProfileRef.current?.userId !== currentAdminUserId
        ) {
          return;
        }

        const savedSerializedFavorites = JSON.stringify(savedFavoriteUserIds);
        referenceFavoritesPersistedSnapshotRef.current = savedSerializedFavorites;
        if (savedSerializedFavorites !== serializedFavorites) {
          setFavoriteReferenceUserIds(savedFavoriteUserIds);
        }
        setReferenceError(null);
      })
      .catch((error) => {
        if (
          isCancelled ||
          referenceFavoritesSaveRequestIdRef.current !== requestId ||
          activeUserProfileRef.current?.userId !== currentAdminUserId
        ) {
          return;
        }

        referenceFavoritesLoadedUserIdRef.current = null;
        setReferenceError(
          error instanceof Error
            ? `ピン留め設定の保存に失敗しました: ${error.message}`
            : 'ピン留め設定の保存に失敗しました。',
        );
        void refreshReferenceUsers(currentAdminUserId);
      });

    return () => {
      isCancelled = true;
    };
  }, [activeUserProfile?.userId, favoriteReferenceUserIds]);

  useEffect(() => {
    mailRecipientSettingsRef.current = mailRecipientSettings;
  }, [mailRecipientSettings]);

  useEffect(() => {
    isBoardSessionReadyRef.current = isBoardSessionReady;
  }, [isBoardSessionReady]);

  async function refreshAdminUsers(userId = activeUserProfile?.userId ?? '') {
    if (!userId) {
      setAdminUsers([]);
      setAdminUserSummary(null);
      setAdminMonitoring(null);
      setAdminRankings(null);
      setAdminDashboardAnalysis(null);
      setSelectedAdminUserId(null);
      return;
    }

    setIsAdminUsersLoading(true);
    try {
      const payload = await loadServerAdminUsers(userId);
      setAdminUsers(payload.users);
      setAdminUserSummary(payload.summary);
      setAdminMonitoring(payload.monitoring);
      setAdminRankings(payload.rankings);
      setAdminDashboardAnalysis(payload.analysis);
      setSelectedAdminUserId((current) => {
        if (current && payload.users.some((item) => item.userId === current)) {
          return current;
        }
        return payload.users[0]?.userId ?? null;
      });
      setAdminUserError(null);
    } catch (error) {
      setAdminUserError(
        error instanceof Error ? `利用者一覧の読み込みに失敗しました: ${error.message}` : '利用者一覧の読み込みに失敗しました。',
      );
      setAdminUsers([]);
      setAdminUserSummary(null);
      setAdminMonitoring(null);
      setAdminRankings(null);
      setAdminDashboardAnalysis(null);
      setSelectedAdminUserId(null);
    } finally {
      setIsAdminUsersLoading(false);
    }
  }

  async function refreshReferenceUsers(userId = activeUserProfile?.userId ?? '') {
    referenceFavoritesSaveRequestIdRef.current += 1;

    if (!userId) {
      setReferenceUsers([]);
      setSelectedReferenceUserId(null);
      setSelectedReferenceUserIds([]);
      setFavoriteReferenceUserIds([]);
      referenceFavoritesLoadedUserIdRef.current = null;
      referenceFavoritesPersistedSnapshotRef.current = '[]';
      setOpeningReferenceSnapshotUserId(null);
      setReferenceError(null);
      setReferenceDownloadError(null);
      setReferenceDownloadNotice(null);
      setReferenceSession(null);
      return;
    }

    setIsReferenceUsersLoading(true);
    try {
      const payload = await loadServerReferenceUsers(userId);
      setReferenceUsers(payload.users);
      setFavoriteReferenceUserIds(payload.favoriteUserIds);
      referenceFavoritesLoadedUserIdRef.current = userId;
      referenceFavoritesPersistedSnapshotRef.current = JSON.stringify(payload.favoriteUserIds);
      setSelectedReferenceUserId((current) => {
        if (current && payload.users.some((user) => user.userId === current)) {
          return current;
        }
        return payload.users[0]?.userId ?? null;
      });
      setSelectedReferenceUserIds((current) =>
        current.filter((selectedId) => payload.users.some((user) => user.userId === selectedId)),
      );
      setReferenceError(null);
      setReferenceDownloadError(null);
    } catch (error) {
      setReferenceError(
        error instanceof Error ? `参照対象一覧の読み込みに失敗しました: ${error.message}` : '参照対象一覧の読み込みに失敗しました。',
      );
      setReferenceUsers([]);
      setFavoriteReferenceUserIds([]);
      referenceFavoritesLoadedUserIdRef.current = null;
      referenceFavoritesPersistedSnapshotRef.current = '[]';
      setSelectedReferenceUserId(null);
      setSelectedReferenceUserIds([]);
      setOpeningReferenceSnapshotUserId(null);
      setReferenceSession(null);
    } finally {
      setIsReferenceUsersLoading(false);
    }
  }

  function toggleReferenceUserSelection(userId: string) {
    setSelectedReferenceUserIds((current) =>
      current.includes(userId) ? current.filter((item) => item !== userId) : [...current, userId],
    );
  }

  function selectReferenceUsers(userIds: string[]) {
    setSelectedReferenceUserIds(Array.from(new Set(userIds.filter(Boolean))));
  }

  function clearReferenceUserSelection() {
    setSelectedReferenceUserIds([]);
  }

  function restoreReferenceUserSelection() {
    if (!restorableReferenceSelectionIds.length) {
      return;
    }

    setSelectedReferenceUserIds(restorableReferenceSelectionIds);
    setSelectedReferenceUserId((current) =>
      current && restorableReferenceSelectionIds.includes(current)
        ? current
        : restorableReferenceSelectionIds[0] ?? current,
    );
    setReferenceError(null);
  }

  function toggleReferenceFavoriteUser(userId: string) {
    setReferenceError(null);
    setFavoriteReferenceUserIds((current) =>
      current.includes(userId) ? current.filter((item) => item !== userId) : [...current, userId],
    );
  }

  function selectFavoriteReferenceUsers() {
    if (!availableFavoriteReferenceUserIds.length) {
      return;
    }

    setSelectedReferenceUserIds(availableFavoriteReferenceUserIds);
    setSelectedReferenceUserId((current) =>
      current && availableFavoriteReferenceUserIds.includes(current)
        ? current
        : availableFavoriteReferenceUserIds[0] ?? current,
    );
    setReferenceError(null);
  }

  function cancelScheduledPersistence() {
    if (pendingPersistenceTimeoutRef.current !== null) {
      window.clearTimeout(pendingPersistenceTimeoutRef.current);
      pendingPersistenceTimeoutRef.current = null;
    }

    cancelPendingIdlePersistenceRef.current?.();
    cancelPendingIdlePersistenceRef.current = null;
  }

  function setServerStorageErrorFromSave(error: unknown) {
    if (error instanceof ServerBoardSessionConflictError) {
      setServerStorageError('別の画面または別の端末で更新されたため、サーバー保存を中止しました。画面を再読み込みして最新内容を確認してください。');
      return;
    }

    setServerStorageError(
      error instanceof Error
        ? `サーバー保存に失敗したため、ブラウザ側の一時保存のみ更新しました: ${error.message}`
        : 'サーバー保存に失敗したため、ブラウザ側の一時保存のみ更新しました。',
    );
  }

  async function persistBoardSessionSnapshot(snapshot: BoardSessionSnapshot, profile: UserProfile) {
    saveCachedBoardSession(snapshot, profile.userId);

    const persistTask = persistenceQueueRef.current.then(async () => {
      const savedSession = await saveServerBoardSession(snapshot, profile, {
        sourceEnv: serverSourceEnvs.web,
        expectedUpdatedAt: serverSnapshotUpdatedAtRef.current,
        mailSettings: mailRecipientSettingsRef.current,
      });
      setLatestServerSnapshotRevision(savedSession);
      setServerStorageError(null);
      return savedSession;
    });

    persistenceQueueRef.current = persistTask.then(
      () => undefined,
      () => undefined,
    );

    try {
      return await persistTask;
    } catch (error) {
      setServerStorageErrorFromSave(error);
      throw error;
    }
  }

  async function flushBoardSessionPersistence() {
    cancelScheduledPersistence();

    const profile = activeUserProfileRef.current;
    if (!profile || !isBoardSessionReadyRef.current) {
      return;
    }

    try {
      await persistBoardSessionSnapshot(latestSnapshotRef.current, profile);
    } catch {
      // Keep user flow moving; the warning banner already reflects the failure.
    }
  }

  useEffect(() => {
    if (!activeUserProfile) {
      serverSnapshotUpdatedAtRef.current = null;
      setIsBoardSessionReady(false);
      return;
    }

    let ignore = false;
    const fallbackBoardSession = createInitialBoardSession(activeUserProfile.userId);

    serverSnapshotUpdatedAtRef.current = null;
    setIsBoardSessionReady(false);
    setServerStorageError(null);

    void (async () => {
      try {
        const storedSession = await loadServerBoardSession(fallbackBoardSession, activeUserProfile);
        if (ignore) {
          return;
        }

        if (storedSession) {
          setLatestServerSnapshotRevision(storedSession);
          applyMailRecipientSettings(storedSession.mailSettings, activeUserProfile.userId);
          hydrateBoardSessionSnapshot(storedSession.snapshot, activeUserProfile.userId);

          if (storedSession.userName !== activeUserProfile.userName) {
            void saveServerBoardSession(storedSession.snapshot, activeUserProfile, {
              sourceEnv: serverSourceEnvs.web,
              expectedUpdatedAt: storedSession.updatedAt,
              mailSettings: storedSession.mailSettings,
            })
              .then((savedSession) => {
                if (!ignore) {
                  setLatestServerSnapshotRevision(savedSession);
                }
              })
              .catch(() => undefined);
          }

          return;
        }

        const migratedSnapshot = await loadBoardSession(fallbackBoardSession, activeUserProfile.userId);
        if (ignore) {
          return;
        }

        applyMailRecipientSettings(null, activeUserProfile.userId);
        hydrateBoardSessionSnapshot(migratedSnapshot, activeUserProfile.userId);
        void saveServerBoardSession(migratedSnapshot, activeUserProfile, {
          sourceEnv: serverSourceEnvs.browserMigration,
          expectedUpdatedAt: null,
          mailSettings: getDefaultMailRecipientSettings(activeUserProfile.userId),
        })
          .then((savedSession) => {
            if (!ignore) {
              setLatestServerSnapshotRevision(savedSession);
            }
          })
          .catch(() => undefined);
      } catch (error) {
        if (ignore) {
          return;
        }

        const cachedSnapshot = readCachedBoardSession(fallbackBoardSession, activeUserProfile.userId);
        const legacySnapshot = await loadBoardSession(cachedSnapshot, activeUserProfile.userId);

        if (ignore) {
          return;
        }

        serverSnapshotUpdatedAtRef.current = null;
        applyMailRecipientSettings(null, activeUserProfile.userId);
        hydrateBoardSessionSnapshot(legacySnapshot, activeUserProfile.userId);
        setServerStorageError(
          error instanceof Error
            ? `サーバー保存を読み込めなかったため、ブラウザ側の既存キャッシュを表示しています: ${error.message}`
            : 'サーバー保存を読み込めなかったため、ブラウザ側の既存キャッシュを表示しています。',
        );
      } finally {
        if (!ignore) {
          setIsBoardSessionReady(true);
        }
      }
    })();

    return () => {
      ignore = true;
    };
  }, [activeUserProfile?.userId, activeUserProfile?.userName]);

  useEffect(() => {
    if (!activeUserProfile) {
      return;
    }

    let cancelled = false;
    const heartbeatIntervalMs = 60 * 1000;

    const sendHeartbeat = () => {
      if (cancelled || document.visibilityState === 'hidden') {
        return;
      }

      void sendServerUserHeartbeat(activeUserProfile).catch(() => undefined);
    };

    sendHeartbeat();
    const intervalId = window.setInterval(sendHeartbeat, heartbeatIntervalMs);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        sendHeartbeat();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [activeUserProfile?.userId, activeUserProfile?.userName]);

  useEffect(() => {
    if (!activeUserProfile) {
      setAdminStatus({
        userId: '',
        isAdmin: false,
        isReadOnlyAdmin: false,
        canManageUsers: false,
        canReferenceUsers: false,
      });
      setAdminUsers([]);
      setAdminUserSummary(null);
      setAdminMonitoring(null);
      setAdminRankings(null);
      setAdminDashboardAnalysis(null);
      setSelectedAdminUserId(null);
      setAdminUserError(null);
      setReferenceUsers([]);
      setSelectedReferenceUserId(null);
      setSelectedReferenceUserIds([]);
      setOpeningReferenceSnapshotUserId(null);
      setReferenceError(null);
      setReferenceDownloadError(null);
      setReferenceDownloadNotice(null);
      setReferenceSession(null);
      setActiveView((current) =>
        current === 'user-admin' ||
          current === 'timesheet-transfer' ||
          current === 'user-reference' ||
          current === 'user-reference-preview'
          ? 'daily'
          : current,
      );
      return;
    }

    let ignore = false;

    void (async () => {
      try {
        const nextAdminStatus = await loadServerAdminStatus(activeUserProfile.userId);
        if (ignore) {
          return;
        }

        setAdminStatus(nextAdminStatus);
        if (!nextAdminStatus.canManageUsers) {
          setAdminUsers([]);
          setAdminUserSummary(null);
          setAdminMonitoring(null);
          setAdminRankings(null);
          setAdminDashboardAnalysis(null);
          setSelectedAdminUserId(null);
          setAdminUserError(null);
          setActiveView((current) => (current === 'user-admin' || current === 'timesheet-transfer' ? 'daily' : current));
        }

        if (!nextAdminStatus.canReferenceUsers) {
          setReferenceUsers([]);
          setSelectedReferenceUserId(null);
          setSelectedReferenceUserIds([]);
          setOpeningReferenceSnapshotUserId(null);
          setReferenceError(null);
          setReferenceDownloadError(null);
          setReferenceDownloadNotice(null);
          setReferenceSession(null);
          setActiveView((current) =>
            current === 'user-reference' || current === 'user-reference-preview' ? 'daily' : current,
          );
        }
      } catch (error) {
        if (ignore) {
          return;
        }

        setAdminStatus({
          userId: activeUserProfile.userId,
          isAdmin: false,
          isReadOnlyAdmin: false,
          canManageUsers: false,
          canReferenceUsers: false,
        });
        setAdminUsers([]);
        setAdminUserSummary(null);
        setAdminMonitoring(null);
        setAdminRankings(null);
        setAdminDashboardAnalysis(null);
        setSelectedAdminUserId(null);
        setReferenceUsers([]);
        setSelectedReferenceUserId(null);
        setSelectedReferenceUserIds([]);
        setOpeningReferenceSnapshotUserId(null);
        setReferenceSession(null);
        setReferenceDownloadError(null);
        setReferenceDownloadNotice(null);
        setReferenceError(null);
        setAdminUserError(
          error instanceof Error ? `管理者状態の確認に失敗しました: ${error.message}` : '管理者状態の確認に失敗しました。',
        );
        setActiveView((current) =>
          current === 'user-admin' ||
            current === 'timesheet-transfer' ||
            current === 'user-reference' ||
            current === 'user-reference-preview'
            ? 'daily'
            : current,
        );
      }
    })();

    return () => {
      ignore = true;
    };
  }, [activeUserProfile?.userId]);

  useEffect(() => {
    if (!activeUserProfile || !adminStatus.canManageUsers || activeView !== 'user-admin') {
      return;
    }

    void refreshAdminUsers(activeUserProfile.userId);
  }, [activeUserProfile?.userId, adminStatus.canManageUsers, activeView]);

  useEffect(() => {
    if (!activeUserProfile || !adminStatus.canReferenceUsers || activeView !== 'user-reference') {
      return;
    }

    void refreshReferenceUsers(activeUserProfile.userId);
  }, [activeUserProfile?.userId, adminStatus.canReferenceUsers, activeView]);

  const latestProjectCatalog = getLatestProjectCatalog(recordsByDate, mockInputBoardDraft.projectCatalog);
  const normalizedCurrentUserProfileDraft = normalizeUserProfile(currentUserIdDraft, currentUserNameDraft);
  const canApplyCurrentUser = Boolean(
    normalizedCurrentUserProfileDraft &&
      (normalizedCurrentUserProfileDraft.userId !== currentUserId ||
        normalizedCurrentUserProfileDraft.userName !== currentUserName),
  );
  const normalizedMailRecipientDraft = normalizeMailRecipientSettings({
    to: currentUserMailToDraft,
    cc: currentUserMailCcDraft,
  });
  const canSaveMailRecipientSettings =
    normalizedMailRecipientDraft.to !== mailRecipientSettings.to ||
    normalizedMailRecipientDraft.cc !== mailRecipientSettings.cc;
  const effectiveMailRecipientSettings = canSaveMailRecipientSettings
    ? normalizedMailRecipientDraft
    : mailRecipientSettings;
  const todayIsoDate = getTodayIsoDate();
  const board = recordsByDate[currentDate] ?? createDefaultBoardForDate(currentDate, latestProjectCatalog);
  const recentProjectCodes = collectRecentProjectCodes(recordsByDate);
  const currentMode = board.currentMode;
  const recentTaskNamesByProject = collectRecentTaskNamesByProject(recordsByDate, currentMode);
  const metrics = calculateInputBoardMetrics(board);
  const warnings = collectInputBoardWarnings(board, currentMode);
  const currentAuxEntries = board.auxEntries.filter((entry) => entry.mode === currentMode);
  const dayStatus = getModeInputStatus(board, currentMode);
  const dailyMonthSummary = calculateMonthlySummary(recordsByDate, currentDate, todayIsoDate);
  const monthlySummary = calculateMonthlySummary(recordsByDate, monthAnchorDate, todayIsoDate);
  const timesheetTransferViewModel = buildTimesheetTransferViewModel({
    date: currentDate,
    board,
    referenceDate: todayIsoDate,
  });
  const selectedDayListProject =
    dayListProjectCode
      ? monthlySummary.projects.find(
          (project) => normalizeProjectCode(project.projectCode) === normalizeProjectCode(dayListProjectCode),
        ) ?? null
      : null;
  const calendarDays = buildCalendarDays(calendarMonthDate, currentDate, todayIsoDate, recordsByDate);
  const headerMonthLabel =
    activeView === 'daily'
      ? dailyMonthSummary.monthLabel
      : activeView === 'timesheet-transfer'
        ? timesheetTransferViewModel.monthLabel
        : monthlySummary.monthLabel;
  const headerOvertimeMinutes =
    activeView === 'daily' ? dailyMonthSummary.overtimeMinutes : monthlySummary.overtimeMinutes;
  const previousDate = shiftIsoDate(currentDate, -1);
  const previousWeekDate = shiftIsoDate(currentDate, -7);
  const canCopyPreviousDayPlan = currentMode === 'plan' && hasCopyablePlanData(recordsByDate[previousDate]);
  const canCopyPreviousWeekPlan = currentMode === 'plan' && hasCopyablePlanData(recordsByDate[previousWeekDate]);
  const canCopyPlanToActual = currentMode === 'actual' && hasPlanData(board);
  const mailDraft = buildBoardMailDraft({
    date: currentDate,
    board,
    userId: currentUserId,
    userName: currentUserName,
    themeName: theme,
    currentMode,
  });
  const mailPreview: MailSendPreview = {
    ...mailDraft,
    to: effectiveMailRecipientSettings.to,
    cc: effectiveMailRecipientSettings.cc,
  };
  const isMailComposeEmpty = dayStatus === 'empty';
  const hasMailBlockingWarnings = warnings.length > 0;
  const mailSendDisabledReason = isMailComposeEmpty
    ? '日入力が空のため、メール作成画面を開けません。'
    : hasMailBlockingWarnings
      ? '入力ボードの警告を解消するとメール作成画面を開けます。'
      : !mailPreview.to.trim()
        ? '宛先(To)が未設定です。ヘッダーの「利用者設定」でメール送信先を保存してください。'
        : null;
  const canSendMail = !mailSendDisabledReason;
  const dailyNextAction =
    activeView === 'daily'
      ? getDailyNextAction(board, metrics, warnings, currentMode, canSendMail, mailSendDisabledReason)
      : null;
  const isReferencePreviewExcelExporting = Boolean(
    activeView === 'user-reference-preview' &&
      referenceSession &&
      referenceDownloadingUserId === referenceSession.userId,
  );
  const isHeaderExcelExporting = isExcelExporting || isReferencePreviewExcelExporting;
  const canExportExcelBackup = Boolean(activeUserProfile && isBoardSessionReady && !isHeaderExcelExporting);

  useEffect(() => {
    setRecordsByDate((prev) => {
      const currentBoard = prev[currentDate];
      if (!currentBoard) {
        return {
          ...prev,
          [currentDate]: createDefaultBoardForDate(
            currentDate,
            getLatestProjectCatalog(prev, mockInputBoardDraft.projectCatalog),
          ),
        };
      }

      const normalizedBoard = applyDefaultModeIfBoardEmpty(currentBoard);
      if (normalizedBoard === currentBoard) {
        return prev;
      }

      return {
        ...prev,
        [currentDate]: normalizedBoard,
      };
    });
  }, [currentDate]);

  useEffect(() => {
    const selectedProjectId =
      selectedItemKey?.startsWith('project:') ? selectedItemKey.replace('project:', '') : null;
    const selectedAuxId =
      selectedItemKey?.startsWith('aux:') ? selectedItemKey.replace('aux:', '') : null;
    const hasSelectedProject = selectedProjectId
      ? board.projectEntries.some((entry) => entry.id === selectedProjectId)
      : false;
    const hasSelectedAux = selectedAuxId
      ? currentAuxEntries.some((entry) => entry.id === selectedAuxId)
      : false;

    if (hasSelectedProject || hasSelectedAux) {
      return;
    }

    if (board.projectEntries[0]) {
      setSelectedItemKey(projectKey(board.projectEntries[0].id));
      return;
    }

    if (currentAuxEntries[0]) {
      setSelectedItemKey(auxKey(currentAuxEntries[0].id));
      return;
    }

    setSelectedItemKey(null);
  }, [board.projectEntries, currentAuxEntries, selectedItemKey]);

  useEffect(() => {
    if (!pendingSelectedRowFocusRef.current || activeView !== 'daily' || !selectedItemKey) {
      return;
    }

    pendingSelectedRowFocusRef.current = false;
    const handle = window.requestAnimationFrame(() => {
      const selectedRow = document.querySelector<HTMLButtonElement>('.workspace--daily .selectable-row.is-selected');
      selectedRow?.focus();
    });

    return () => window.cancelAnimationFrame(handle);
  }, [activeView, selectedItemKey, board.projectEntries, currentAuxEntries]);

  useEffect(() => {
    if (!activeUserProfile || isApplyingCurrentUser) {
      return;
    }

    saveUiSettings(activeUserProfile.userId, {
      theme,
      density,
      guideEnabled,
      greetingEnabled,
      simpleModeEnabled,
    });
  }, [theme, density, guideEnabled, greetingEnabled, simpleModeEnabled, activeUserProfile?.userId, isApplyingCurrentUser]);

  useEffect(() => {
    if (!isBoardSessionReady || !activeUserProfile || isApplyingCurrentUser) {
      return;
    }

    saveCachedBoardViewport(
      {
        currentDate,
        monthAnchorDate,
      },
      activeUserProfile.userId,
    );
  }, [currentDate, monthAnchorDate, isBoardSessionReady, activeUserProfile?.userId]);

  useEffect(() => {
    if (!isBoardSessionReady || !activeUserProfile) {
      return;
    }

    const snapshot = {
      recordsByDate,
      currentDate: currentDateRef.current,
      monthAnchorDate: monthAnchorDateRef.current,
    } satisfies BoardSessionSnapshot;

    cancelScheduledPersistence();
    pendingPersistenceTimeoutRef.current = window.setTimeout(() => {
      pendingPersistenceTimeoutRef.current = null;
      cancelPendingIdlePersistenceRef.current = scheduleWhenBrowserIdle(() => {
        cancelPendingIdlePersistenceRef.current = null;
        void persistBoardSessionSnapshot(snapshot, activeUserProfile).catch(() => undefined);
      });
    }, 350);

    return () => {
      cancelScheduledPersistence();
    };
  }, [recordsByDate, isBoardSessionReady, activeUserProfile?.userId, activeUserProfile?.userName, isApplyingCurrentUser]);

  useEffect(() => {
    if (!isBoardSessionReady) {
      return;
    }

    const handlePageHide = () => {
      cancelScheduledPersistence();
      const profile = activeUserProfileRef.current;
      if (!profile) {
        return;
      }

      const snapshot = latestSnapshotRef.current;
      saveCachedBoardViewport(
        {
          currentDate: snapshot.currentDate,
          monthAnchorDate: snapshot.monthAnchorDate,
        },
        profile.userId,
      );
      saveCachedBoardSession(snapshot, profile.userId);
      saveServerBoardSessionKeepalive(snapshot, profile, {
        sourceEnv: serverSourceEnvs.web,
        expectedUpdatedAt: serverSnapshotUpdatedAtRef.current,
        mailSettings: mailRecipientSettingsRef.current,
      });
    };

    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [isBoardSessionReady]);

  useEffect(() => {
    function handleKeyboardShortcut(event: KeyboardEvent) {
      const isDailyShortcutView = activeView === 'daily';
      const isMonthShortcutView = activeView === 'monthly' || activeView === 'day-list';

      if (
        (!isDailyShortcutView && !isMonthShortcutView) ||
        !isBoardSessionReady ||
        !activeUserProfile ||
        isUserBootstrapOpen ||
        isHelpDialogOpen ||
        isReleaseNotesDialogOpen ||
        isMailHelperSetupOpen ||
        isQuickProjectDialogOpen ||
        event.isComposing
      ) {
        return;
      }

      const key = event.key.toLowerCase();

      if ((event.ctrlKey || event.metaKey) && !event.altKey && key === 's') {
        if (!isDailyShortcutView) {
          return;
        }
        event.preventDefault();
        void flushBoardSessionPersistence();
        return;
      }

      if (event.ctrlKey || event.metaKey || !event.altKey) {
        return;
      }

      if (key === 'arrowup') {
        if (!isDailyShortcutView) {
          return;
        }
        event.preventDefault();
        setMode('plan');
        return;
      }

      if (key === 'arrowdown') {
        if (!isDailyShortcutView) {
          return;
        }
        event.preventDefault();
        setMode('actual');
        return;
      }

      if (
        isEditableKeyboardTarget(event.target) &&
        key !== 'arrowleft' &&
        key !== 'arrowright' &&
        key !== 'arrowup' &&
        key !== 'arrowdown'
      ) {
        return;
      }

      if (key === 'arrowleft') {
        event.preventDefault();
        if (isMonthShortcutView) {
          setMonthAnchorDate((prev) => shiftIsoMonth(prev, -1));
        } else {
          shiftDate(-1);
        }
        return;
      }

      if (key === 'arrowright') {
        event.preventDefault();
        if (isMonthShortcutView) {
          setMonthAnchorDate((prev) => shiftIsoMonth(prev, 1));
        } else {
          shiftDate(1);
        }
      }
    }

    window.addEventListener('keydown', handleKeyboardShortcut);
    return () => {
      window.removeEventListener('keydown', handleKeyboardShortcut);
    };
  }, [
    activeUserProfile,
    activeView,
    isBoardSessionReady,
    isHelpDialogOpen,
    isMailHelperSetupOpen,
    isQuickProjectDialogOpen,
    isReleaseNotesDialogOpen,
    isUserBootstrapOpen,
  ]);

  function updateBoard(updater: (current: InputBoardDraft) => InputBoardDraft) {
    setRecordsByDate((prev) => {
      const current =
        prev[currentDate] ??
        createDefaultBoardForDate(currentDate, getLatestProjectCatalog(prev, mockInputBoardDraft.projectCatalog));
      const nextRecordsByDate = {
        ...prev,
        [currentDate]: updater(current),
      };
      latestSnapshotRef.current = {
        recordsByDate: nextRecordsByDate,
        currentDate: currentDateRef.current,
        monthAnchorDate: monthAnchorDateRef.current,
      };
      return nextRecordsByDate;
    });
  }

  function openDate(date: string) {
    setCurrentDate(date);
    setCalendarMonthDate(`${date.slice(0, 7)}-01`);
    setMonthAnchorDate(`${date.slice(0, 7)}-01`);
    setActiveView('daily');
    setIsCalendarOpen(false);
    setIsQuickProjectDialogOpen(false);
    setSelectedItemKey(null);
    setDraggingProjectId(null);
  }

  function openTimesheetTransferDate(date: string) {
    setCurrentDate(date);
    setCalendarMonthDate(`${date.slice(0, 7)}-01`);
    setMonthAnchorDate(`${date.slice(0, 7)}-01`);
    setActiveView('timesheet-transfer');
    setIsCalendarOpen(false);
    setIsQuickProjectDialogOpen(false);
    setSelectedItemKey(null);
    setDraggingProjectId(null);
  }

  function setMode(mode: EntryMode) {
    updateBoard((current) => ({
      ...current,
      currentMode: mode,
    }));
  }

  function shiftDate(deltaDays: number) {
    openDate(shiftIsoDate(currentDate, deltaDays));
  }

  function setSummaryTime(field: 'startTime' | 'endTime', value: string) {
    updateBoard((current) => ({
      ...current,
      [field]: {
        ...current[field],
        [current.currentMode]: value,
      },
    }));
  }

  function stepSummaryTime(field: 'startTime' | 'endTime', deltaMinutes: number) {
    const fallbackValue = field === 'startTime' ? '09:30' : '18:00';
    updateBoard((current) => ({
      ...current,
      [field]: {
        ...current[field],
        [current.currentMode]: stepTimeValue(current[field][current.currentMode], deltaMinutes, fallbackValue),
      },
    }));
  }

  function copyPlanFromDate(sourceDate: string) {
    const sourceBoard = recordsByDate[sourceDate];
    if (!hasCopyablePlanData(sourceBoard)) {
      return;
    }

    updateBoard((current) => copyPlanIntoBoard(sourceBoard, current, currentDate));
    setIsQuickProjectDialogOpen(false);
    setSelectedItemKey(null);
    setAutoFocusProjectId(null);
    setDraggingProjectId(null);
  }

  function copyPreviousDay() {
    copyPlanFromDate(previousDate);
  }

  function copyPreviousWeek() {
    copyPlanFromDate(previousWeekDate);
  }

  function copyPlanToActual() {
    updateBoard((current) => {
      const actualAuxEntries = current.auxEntries
        .filter((entry) => entry.mode === 'plan')
        .map((entry) => ({
          ...createAuxTimeEntry('actual', entry.type),
          startTime: entry.startTime,
          endTime: entry.endTime,
          note: entry.note,
        }));

      return {
        ...current,
        currentMode: 'actual',
        startTime: {
          ...current.startTime,
          actual: current.startTime.plan,
        },
        endTime: {
          ...current.endTime,
          actual: current.endTime.plan,
        },
        projectEntries: current.projectEntries.map((entry) => ({
          ...entry,
          timeInputMode: {
            ...entry.timeInputMode,
            actual: entry.timeInputMode.plan,
          },
          rangeStart: {
            ...entry.rangeStart,
            actual: entry.rangeStart.plan,
          },
          rangeEnd: {
            ...entry.rangeEnd,
            actual: entry.rangeEnd.plan,
          },
          minutes: {
            ...entry.minutes,
            actual: roundToQuarter(entry.minutes.plan),
          },
          taskName: {
            ...entry.taskName,
            actual: entry.taskName.plan,
          },
          place: {
            ...entry.place,
            actual: entry.place.plan,
          },
          note: {
            ...entry.note,
            actual: entry.note.plan,
          },
        })),
        auxEntries: [
          ...current.auxEntries.filter((entry) => entry.mode !== 'actual'),
          ...actualAuxEntries,
        ],
      };
    });
    setSelectedItemKey(null);
    setAutoFocusProjectId(null);
    setDraggingProjectId(null);
    setIsQuickProjectDialogOpen(false);
  }

  function addBlankRow(selectNew = true) {
    const nextEntry = createProjectEntry();
    updateBoard((current) => ({
      ...current,
      projectEntries: [...current.projectEntries, nextEntry],
    }));
    if (selectNew) {
      setSelectedItemKey(projectKey(nextEntry.id));
      setAutoFocusProjectId(nextEntry.id);
    }
  }

  function addAux(type: AuxEntryType = 'split', selectNew = true) {
    const nextEntry = createAuxTimeEntry(board.currentMode, type);
    updateBoard((current) => ({
      ...current,
      auxEntries: [...current.auxEntries, nextEntry],
    }));
    if (selectNew) {
      setSelectedItemKey(auxKey(nextEntry.id));
    }
  }

  function quickAddProject(project: ProjectCatalogItem) {
    const blankEntry = board.projectEntries.find(
      (entry) =>
        entry.projectCode === '' &&
        entry.projectSearch === '' &&
        entry.minutes.plan === 0 &&
        entry.minutes.actual === 0 &&
        entry.taskName.plan === '' &&
        entry.taskName.actual === '',
    );

    if (blankEntry) {
      updateBoard((current) => ({
        ...current,
        projectEntries: replaceProjectEntry(current.projectEntries, blankEntry.id, (entry) =>
          applyProjectSelection(entry, project),
        ),
      }));
      setSelectedItemKey(projectKey(blankEntry.id));
      setAutoFocusProjectId(blankEntry.id);
      setIsQuickProjectDialogOpen(false);
      return;
    }

    const nextEntry = createProjectEntry(project);
    updateBoard((current) => ({
      ...current,
      projectEntries: [...current.projectEntries, nextEntry],
    }));
    setSelectedItemKey(projectKey(nextEntry.id));
    setAutoFocusProjectId(nextEntry.id);
    setIsQuickProjectDialogOpen(false);
  }

  function setProjectSearch(entryId: string, value: string) {
    updateBoard((current) => ({
      ...current,
      projectEntries: replaceProjectEntry(current.projectEntries, entryId, (entry) =>
        updateProjectSearch(entry, value),
      ),
    }));
  }

  function selectProject(entryId: string, project: ProjectCatalogItem) {
    updateBoard((current) => ({
      ...current,
      projectEntries: replaceProjectEntry(current.projectEntries, entryId, (entry) =>
        applyProjectSelection(entry, project),
      ),
    }));
  }

  function setProjectTimeInputMode(entryId: string, nextMode: ProjectTimeInputMode) {
    updateBoard((current) => ({
      ...current,
      projectEntries: replaceProjectEntry(current.projectEntries, entryId, (entry) => {
        const currentModeKey = current.currentMode;
        const nextEntry = {
          ...entry,
          timeInputMode: {
            ...entry.timeInputMode,
            [currentModeKey]: nextMode,
          },
        };

        if (nextMode === 'range' && !entry.rangeStart[currentModeKey] && !entry.rangeEnd[currentModeKey]) {
          const fallbackStart = current.startTime[currentModeKey] || '09:30';
          nextEntry.rangeStart = {
            ...entry.rangeStart,
            [currentModeKey]: fallbackStart,
          };
          nextEntry.rangeEnd = {
            ...entry.rangeEnd,
            [currentModeKey]: stepTimeValueExcludingLunch(
              fallbackStart,
              entry.minutes[currentModeKey],
              fallbackStart,
              current.lunchMinutes,
            ),
          };
        }

        const rangeMinutes =
          nextMode === 'range'
            ? calculateTimeRangeMinutesExcludingLunch(
                nextEntry.rangeStart[currentModeKey],
                nextEntry.rangeEnd[currentModeKey],
                current.lunchMinutes,
              ) ?? 0
            : entry.minutes[currentModeKey];

        nextEntry.minutes = {
          ...entry.minutes,
          [currentModeKey]: rangeMinutes,
        };

        return nextEntry;
      }),
    }));
  }

  function setProjectRange(entryId: string, field: 'rangeStart' | 'rangeEnd', value: string) {
    updateBoard((current) => ({
      ...current,
      projectEntries: replaceProjectEntry(current.projectEntries, entryId, (entry) => {
        const nextRangeStart =
          field === 'rangeStart' ? value : entry.rangeStart[current.currentMode];
        const nextRangeEnd = field === 'rangeEnd' ? value : entry.rangeEnd[current.currentMode];
        const nextMinutes =
          calculateTimeRangeMinutesExcludingLunch(nextRangeStart, nextRangeEnd, current.lunchMinutes) ?? 0;

        return {
          ...entry,
          [field]: {
            ...entry[field],
            [current.currentMode]: value,
          },
          minutes: {
            ...entry.minutes,
            [current.currentMode]: nextMinutes,
          },
        };
      }),
    }));
  }

  function setTask(entryId: string, value: string) {
    updateBoard((current) => ({
      ...current,
      projectEntries: replaceProjectEntry(current.projectEntries, entryId, (entry) => ({
        ...entry,
        taskName: {
          ...entry.taskName,
          [current.currentMode]: value,
        },
      })),
    }));
  }

  function setMinutes(entryId: string, nextMinutes: number) {
    updateBoard((current) => ({
      ...current,
      projectEntries: replaceProjectEntry(current.projectEntries, entryId, (entry) => ({
        ...entry,
        minutes: {
          ...entry.minutes,
          [current.currentMode]: roundToQuarter(nextMinutes),
        },
      })),
    }));
  }

  function stepMinutes(entryId: string, deltaMinutes: number) {
    updateBoard((current) => ({
      ...current,
      projectEntries: replaceProjectEntry(current.projectEntries, entryId, (entry) => ({
        ...entry,
        minutes: {
          ...entry.minutes,
          [current.currentMode]: roundToQuarter(entry.minutes[current.currentMode] + deltaMinutes),
        },
      })),
    }));
  }

  function setPlace(entryId: string, place: WorkPlace) {
    updateBoard((current) => ({
      ...current,
      projectEntries: replaceProjectEntry(current.projectEntries, entryId, (entry) => ({
        ...entry,
        place: {
          ...entry.place,
          [current.currentMode]: place,
        },
      })),
    }));
  }

  function setPlaceDetail(entryId: string, value: string) {
    updateBoard((current) => ({
      ...current,
      projectEntries: replaceProjectEntry(current.projectEntries, entryId, (entry) => ({
        ...entry,
        placeDetail: {
          plan: entry.placeDetail?.plan ?? '',
          actual: entry.placeDetail?.actual ?? '',
          [current.currentMode]: value,
        },
      })),
    }));
  }

  function setNote(entryId: string, value: string) {
    updateBoard((current) => ({
      ...current,
      projectEntries: replaceProjectEntry(current.projectEntries, entryId, (entry) => ({
        ...entry,
        note: {
          ...entry.note,
          [current.currentMode]: value,
        },
      })),
    }));
  }

  function removeProject(entryId: string) {
    const selectedEntry = board.projectEntries.find((entry) => entry.id === entryId);
    const currentModeKey = board.currentMode;
    const counterpartMode: EntryMode = currentModeKey === 'plan' ? 'actual' : 'plan';
    const shouldRemoveRow = selectedEntry ? !hasProjectEntryModeSpecificData(selectedEntry, counterpartMode) : true;

    updateBoard((current) => {
      const currentEntry = current.projectEntries.find((entry) => entry.id === entryId);
      if (!currentEntry) {
        return current;
      }

      const activeMode = current.currentMode;
      const nextCounterpartMode: EntryMode = activeMode === 'plan' ? 'actual' : 'plan';
      if (!hasProjectEntryModeSpecificData(currentEntry, nextCounterpartMode)) {
        return {
          ...current,
          projectEntries: current.projectEntries.filter((entry) => entry.id !== entryId),
        };
      }

      return {
        ...current,
        projectEntries: replaceProjectEntry(current.projectEntries, entryId, (entry) =>
          buildClearedProjectEntryForMode(entry, activeMode, current.projectCatalog),
        ),
      };
    });

    if (shouldRemoveRow) {
      setSelectedItemKey(null);
    }
  }

  function selectProjectEntry(entryId: string) {
    setSelectedItemKey(projectKey(entryId));
    setAutoFocusProjectId(null);
  }

  function selectAuxEntry(entryId: string) {
    setSelectedItemKey(auxKey(entryId));
    setAutoFocusProjectId(null);
  }

  function moveSelectedItem(delta: 1 | -1) {
    const selectableKeys: SelectedItemKey[] = [
      ...board.projectEntries.map((entry) => projectKey(entry.id)),
      ...currentAuxEntries.map((entry) => auxKey(entry.id)),
    ];

    if (selectableKeys.length === 0) {
      return;
    }

    const currentIndex = selectedItemKey ? selectableKeys.indexOf(selectedItemKey) : -1;
    const nextIndex =
      currentIndex === -1
        ? delta > 0
          ? 0
          : selectableKeys.length - 1
        : Math.min(Math.max(currentIndex + delta, 0), selectableKeys.length - 1);
    const nextKey = selectableKeys[nextIndex];

    if (!nextKey) {
      return;
    }

    pendingSelectedRowFocusRef.current = true;
    setSelectedItemKey(nextKey);
    setAutoFocusProjectId(null);
  }

  function startProjectDrag(entryId: string) {
    setDraggingProjectId(entryId);
  }

  function dropProject(entryId: string) {
    if (!draggingProjectId) {
      return;
    }

    updateBoard((current) => ({
      ...current,
      projectEntries: reorderProjectEntries(current.projectEntries, draggingProjectId, entryId),
    }));
    setDraggingProjectId(null);
  }

  function setAux(
    entryId: string,
    field: 'startTime' | 'endTime' | 'note',
    value: string,
  ) {
    updateBoard((current) => ({
      ...current,
      auxEntries: replaceAuxEntry(current.auxEntries, entryId, (entry) => ({
        ...entry,
        [field]: value,
      })),
    }));
  }

  function setAuxType(entryId: string, type: AuxEntryType) {
    updateBoard((current) => ({
      ...current,
      auxEntries: replaceAuxEntry(current.auxEntries, entryId, (entry) => {
        const nextTemplate = createAuxTimeEntry(entry.mode, type);
        const keepsExistingRange =
          isAuxRangeType(entry.type) &&
          isAuxRangeType(type) &&
          ((entry.type === 'split' || entry.type === 'break') && (type === 'split' || type === 'break'));

        return {
          ...entry,
          type,
          startTime: isAuxRangeType(type)
            ? keepsExistingRange
              ? entry.startTime || nextTemplate.startTime
              : nextTemplate.startTime
            : '',
          endTime: isAuxRangeType(type)
            ? keepsExistingRange
              ? entry.endTime || nextTemplate.endTime
              : nextTemplate.endTime
            : '',
        };
      }),
    }));
  }

  function removeAux(entryId: string) {
    updateBoard((current) => ({
      ...current,
      auxEntries: current.auxEntries.filter((entry) => entry.id !== entryId),
    }));
    setSelectedItemKey(null);
  }

  function handleSendMail() {
    if (isMailComposeEmpty) {
      setMailSendError('日入力が空のため、メール作成画面を開けません。');
      setMailSendSuccessMessage(null);
      return;
    }

    if (hasMailBlockingWarnings) {
      setMailSendError('入力ボードの警告を解消するとメール作成画面を開けます。');
      setMailSendSuccessMessage(null);
      return;
    }

    void sendCurrentBoardMail();
  }

  function saveCurrentUserMailSettings() {
    setMailRecipientSettings(normalizedMailRecipientDraft);
    setCurrentUserMailToDraft(normalizedMailRecipientDraft.to);
    setCurrentUserMailCcDraft(normalizedMailRecipientDraft.cc);
  }

  async function sendCurrentBoardMail() {
    if (isMailComposeEmpty) {
      setMailSendError('日入力が空のため、メール作成画面を開けません。');
      return;
    }

    if (hasMailBlockingWarnings) {
      setMailSendError('入力ボードの警告を解消するとメール作成画面を開けます。');
      return;
    }

    if (!effectiveMailRecipientSettings.to.trim()) {
      setMailSendError('宛先(To)が未設定です。ヘッダーの「利用者設定」でメール送信先を保存してください。');
      return;
    }

    if (canSaveMailRecipientSettings) {
      setMailRecipientSettings(effectiveMailRecipientSettings);
    }

    setIsMailSending(true);
    setMailSendError(null);
    setMailSendSuccessMessage(null);

    try {
      const latestSnapshot = latestSnapshotRef.current;
      const latestDate = latestSnapshot.currentDate;
      const latestBoard =
        latestSnapshot.recordsByDate[latestDate] ??
        createDefaultBoardForDate(
          latestDate,
          getLatestProjectCatalog(latestSnapshot.recordsByDate, mockInputBoardDraft.projectCatalog),
        );
      const latestMailDraft = buildBoardMailDraft({
        date: latestDate,
        board: latestBoard,
        userId: currentUserId,
        userName: currentUserName,
        themeName: theme,
        currentMode: latestBoard.currentMode,
      });
      const latestMailPreview: MailSendPreview = {
        ...latestMailDraft,
        to: effectiveMailRecipientSettings.to,
        cc: effectiveMailRecipientSettings.cc,
      };

      await openPreferredMailCompose(latestMailPreview);
      setMailSendSuccessMessage(null);
    } catch (error) {
      setMailSendError(error instanceof Error ? error.message : 'メール作成画面を開けませんでした。');
    } finally {
      setIsMailSending(false);
    }
  }

  function closeMailHelperSetupDialog() {
    setIsMailHelperSetupOpen(false);
  }

  function openMailHelperSetupDialog() {
    setIsMailHelperSetupOpen(true);
  }

  function openMonthlyView() {
    setIsQuickProjectDialogOpen(false);
    setMonthAnchorDate(activeView === 'daily' ? `${currentDate.slice(0, 7)}-01` : monthAnchorDate);
    setActiveView('monthly');
  }

  function openDayListView(projectCode: string | null = null) {
    setIsQuickProjectDialogOpen(false);
    setDayListProjectCode(projectCode?.trim() ? projectCode : null);
    setMonthAnchorDate(activeView === 'daily' ? `${currentDate.slice(0, 7)}-01` : monthAnchorDate);
    setActiveView('day-list');
  }

  function openProjectMasterView() {
    setIsQuickProjectDialogOpen(false);
    setMonthAnchorDate(activeView === 'daily' ? `${currentDate.slice(0, 7)}-01` : monthAnchorDate);
    setActiveView('project-master');
  }

  function openTimesheetTransferView() {
    setIsQuickProjectDialogOpen(false);
    setDayListProjectCode(null);
    setMonthAnchorDate(`${currentDate.slice(0, 7)}-01`);
    setActiveView('timesheet-transfer');
  }

  function openUserAdminView() {
    setIsQuickProjectDialogOpen(false);
    setActiveView('user-admin');
  }

  function openUserReferenceView() {
    setIsQuickProjectDialogOpen(false);
    setActiveView('user-reference');
  }

  async function openUserReferenceSnapshotView(targetUserId: string) {
    if (!activeUserProfile || !adminStatus.canReferenceUsers || openingReferenceSnapshotUserId) {
      return;
    }

    setOpeningReferenceSnapshotUserId(targetUserId);
    setReferenceError(null);
    try {
      const session = await loadServerReferenceSession(activeUserProfile.userId, targetUserId);
      if (!session) {
        throw new Error('最新保存データが見つかりませんでした。');
      }

      setReferenceSession(session);
      setActiveView('user-reference-preview');
    } catch (error) {
      setReferenceError(
        error instanceof Error ? `参照画面の読み込みに失敗しました: ${error.message}` : '参照画面の読み込みに失敗しました。',
      );
    } finally {
      setOpeningReferenceSnapshotUserId(null);
    }
  }

  function saveProjectMaster(nextProject: ProjectCatalogItem, previousProjectCode?: string) {
    setRecordsByDate((prev) =>
      saveProjectMasterToRecords(prev, nextProject, {
        previousProjectCode,
        templateDate: `${monthAnchorDate.slice(0, 7)}-01`,
        fallbackCatalog: mockInputBoardDraft.projectCatalog,
        createBoardForDate: createDefaultBoardForDate,
      }),
    );
  }

  function setMonthlyBudget(projectCode: string, nextBudgetMinutes: number) {
    // 月集計で触るのは PJ 固定属性ではなく、その月だけの計画値です。
    setRecordsByDate((prev) =>
      setMonthlyBudgetForRecords(prev, projectCode, nextBudgetMinutes, {
        monthKey: monthAnchorDate.slice(0, 7),
        fallbackCatalog: mockInputBoardDraft.projectCatalog,
        createBoardForDate: createDefaultBoardForDate,
      }),
    );
  }

  async function handleSaveAdminUser(
    user: Pick<ServerAdminUserRecord, 'userId' | 'userName' | 'mailTo' | 'mailCc' | 'adminNote'>,
  ) {
    if (!activeUserProfile || !adminStatus.canManageUsers || isAdminUserSaving) {
      return;
    }

    setIsAdminUserSaving(true);
    try {
      const savedUser = await saveServerAdminUser(activeUserProfile.userId, user);
      if (savedUser) {
        setAdminUsers((current) =>
          current.map((item) => (item.userId === savedUser.userId ? savedUser : item)),
        );
      }
      await refreshAdminUsers(activeUserProfile.userId);
      setAdminUserError(null);
    } catch (error) {
      setAdminUserError(
        error instanceof Error ? `利用者の更新に失敗しました: ${error.message}` : '利用者の更新に失敗しました。',
      );
    } finally {
      setIsAdminUserSaving(false);
    }
  }

  async function handleDeleteAdminUser(targetUserId: string) {
    if (!activeUserProfile || !adminStatus.canManageUsers || isAdminUserDeleting) {
      return;
    }

    setIsAdminUserDeleting(true);
    try {
      const deletedUserId = await deleteServerAdminUser(activeUserProfile.userId, targetUserId);
      setAdminUsers((current) => current.filter((item) => item.userId !== deletedUserId));
      setSelectedAdminUserId((current) => (current === deletedUserId ? null : current));
      await refreshAdminUsers(activeUserProfile.userId);
      setAdminUserError(null);
    } catch (error) {
      setAdminUserError(
        error instanceof Error ? `利用者データの削除に失敗しました: ${error.message}` : '利用者データの削除に失敗しました。',
      );
    } finally {
      setIsAdminUserDeleting(false);
    }
  }

  async function downloadReferenceUserExcel(targetUserId: string) {
    if (!activeUserProfile || !adminStatus.canReferenceUsers || referenceDownloadingUserId || isReferenceBulkDownloading) {
      return;
    }

    setReferenceDownloadingUserId(targetUserId);
    setReferenceDownloadError(null);
    setReferenceDownloadNotice(null);
    try {
      const { sessions, skippedUsers } = await loadServerReferenceExportSessions(activeUserProfile.userId, [targetUserId]);
      const session = sessions[0] ?? null;
      if (!session) {
        const reason = skippedUsers[0]?.reason ?? '最新保存データが見つかりませんでした。';
        throw new Error(reason);
      }

      const workbookDefinition = buildExportWorkbookDefinition(
        session.snapshot,
        { userId: session.userId, userName: session.userName },
        new Date(),
        getTodayIsoDate(),
      );
      await downloadExcelBackup(workbookDefinition);
    } catch (error) {
      setReferenceDownloadError(
        error instanceof Error ? `Excel ダウンロードに失敗しました: ${error.message}` : 'Excel ダウンロードに失敗しました。',
      );
    } finally {
      setReferenceDownloadingUserId(null);
    }
  }

  async function downloadReferenceUsersZip() {
    if (!activeUserProfile || !adminStatus.canReferenceUsers || !selectedReferenceUserIds.length || isReferenceBulkDownloading) {
      return;
    }

    setIsReferenceBulkDownloading(true);
    setReferenceDownloadError(null);
    setReferenceDownloadNotice(null);
    try {
      const exportedAt = new Date();
      const result = await loadServerReferenceExportSessions(activeUserProfile.userId, selectedReferenceUserIds);
      if (!result.sessions.length) {
        throw new Error(result.skippedUsers[0]?.reason ?? 'ダウンロード対象の保存済みデータがありません。');
      }

      const zipEntries = await Promise.all(
        result.sessions.map(async (session) => {
          const workbookDefinition = buildExportWorkbookDefinition(
            session.snapshot,
            { userId: session.userId, userName: session.userName },
            exportedAt,
            getTodayIsoDate(),
          );
          const buffer = await generateExcelBackupBuffer(workbookDefinition);
          return {
            fileName: workbookDefinition.fileName,
            content: buffer,
          };
        }),
      );

      const targetMonthKey = result.sessions[0]?.snapshot.monthAnchorDate ?? null;
      await downloadZipArchive(buildReferenceZipFileName(exportedAt, targetMonthKey), zipEntries);

      if (result.skippedUsers.length) {
        setReferenceDownloadNotice({
          tone: 'caution',
          message: `ZIP を作成しました。${result.sessions.length}人分を出力し、${result.skippedUsers.length}人をスキップしました。`,
        });
      } else {
        setReferenceDownloadNotice({
          tone: 'info',
          message: `ZIP を作成しました。${result.sessions.length}人分の Excel をまとめてダウンロードしました。`,
        });
      }
    } catch (error) {
      setReferenceDownloadError(
        error instanceof Error ? `一括ダウンロードに失敗しました: ${error.message}` : '一括ダウンロードに失敗しました。',
      );
    } finally {
      setIsReferenceBulkDownloading(false);
    }
  }

  async function exportExcelBackup() {
    if (!activeUserProfile || !isBoardSessionReady || isExcelExporting) {
      return;
    }

    setIsExcelExporting(true);
    setExcelExportError(null);

    try {
      const workbookDefinition = buildExportWorkbookDefinition(
        {
          recordsByDate,
          currentDate,
          monthAnchorDate,
        },
        {
          userId: currentUserId,
          userName: currentUserName,
        },
        new Date(),
        todayIsoDate,
      );
      await downloadExcelBackup(workbookDefinition);
    } catch (error) {
      setExcelExportError(
        error instanceof Error
          ? `Excelバックアップの出力に失敗しました: ${error.message}`
          : 'Excelバックアップの出力に失敗しました。',
      );
    } finally {
      setIsExcelExporting(false);
    }
  }

  async function applyCurrentUser() {
    if (!normalizedCurrentUserProfileDraft) {
      return;
    }

    setIsApplyingCurrentUser(true);
    try {
      await flushBoardSessionPersistence();

      const nextUiSettings = readUiSettings(normalizedCurrentUserProfileDraft.userId, defaultUiSettings);
      const nextMailRecipientSettings = getDefaultMailRecipientSettings(normalizedCurrentUserProfileDraft.userId);
      serverSnapshotUpdatedAtRef.current = null;
      saveCachedUserProfile(normalizedCurrentUserProfileDraft);
      setTheme(nextUiSettings.theme);
      setDensity(nextUiSettings.density);
      setGuideEnabled(nextUiSettings.guideEnabled);
      setGreetingEnabled(nextUiSettings.greetingEnabled);
      setSimpleModeEnabled(nextUiSettings.simpleModeEnabled);
      setCurrentUserId(normalizedCurrentUserProfileDraft.userId);
      setCurrentUserName(normalizedCurrentUserProfileDraft.userName);
      setCurrentUserIdDraft(normalizedCurrentUserProfileDraft.userId);
      setCurrentUserNameDraft(normalizedCurrentUserProfileDraft.userName);
      setMailRecipientSettings(nextMailRecipientSettings);
      setCurrentUserMailToDraft(nextMailRecipientSettings.to);
      setCurrentUserMailCcDraft(nextMailRecipientSettings.cc);
      setIsUserBootstrapOpen(false);
      setIsBoardSessionReady(false);
      setServerStorageError(null);
      setMailSendError(null);
      setMailSendSuccessMessage(null);
    } finally {
      setIsApplyingCurrentUser(false);
    }
  }

  function closeUserBootstrap() {
    if (!activeUserProfile) {
      return;
    }

    setCurrentUserIdDraft(currentUserId);
    setCurrentUserNameDraft(currentUserName);
    setIsUserBootstrapOpen(false);
  }

  const handleHeaderExcelExport =
    activeView === 'user-reference-preview' && referenceSession
      ? () => void downloadReferenceUserExcel(referenceSession.userId)
      : exportExcelBackup;

  return (
    <div className="app-background" data-theme={theme} data-density={density}>
      <div className="app-window">
        <AppWindowHeader
          activeView={activeView}
          currentMonthLabel={headerMonthLabel}
          monthOvertimeMinutes={headerOvertimeMinutes}
          referencePreviewLabel={activeView === 'user-reference-preview' && referenceSession ? referenceSession.userName || referenceSession.userId : null}
          theme={theme}
          density={density}
          guideEnabled={guideEnabled}
          greetingEnabled={greetingEnabled}
          simpleModeEnabled={simpleModeEnabled}
          recipientGuided={guideEnabled && dailyNextAction?.key === 'recipient'}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          currentUserMailToDraft={currentUserMailToDraft}
          currentUserMailCcDraft={currentUserMailCcDraft}
          canSaveMailRecipientSettings={canSaveMailRecipientSettings}
          canExportExcelBackup={canExportExcelBackup}
          canOpenTimesheetTransfer={adminStatus.canManageUsers}
          isExcelExporting={isHeaderExcelExporting}
          onOpenDaily={() => {
            setIsQuickProjectDialogOpen(false);
            setActiveView('daily');
          }}
          onOpenMonthly={openMonthlyView}
          onOpenDayList={() => openDayListView(null)}
          onOpenProjectMaster={openProjectMasterView}
          onOpenTimesheetTransfer={openTimesheetTransferView}
          canOpenUserAdmin={adminStatus.canManageUsers}
          canOpenUserReference={adminStatus.canReferenceUsers}
          onOpenUserAdmin={openUserAdminView}
          onOpenUserReference={openUserReferenceView}
          onChangeTheme={setTheme}
          onChangeDensity={setDensity}
          onChangeGuideEnabled={setGuideEnabled}
          onChangeGreetingEnabled={setGreetingEnabled}
          onChangeSimpleModeEnabled={setSimpleModeEnabled}
          onChangeCurrentUserMailToDraft={setCurrentUserMailToDraft}
          onChangeCurrentUserMailCcDraft={setCurrentUserMailCcDraft}
          onSaveCurrentUserMailSettings={saveCurrentUserMailSettings}
          onOpenMailHelperSetup={openMailHelperSetupDialog}
          onOpenReleaseNotes={() => setIsReleaseNotesDialogOpen(true)}
          onOpenHelp={() => setIsHelpDialogOpen(true)}
          onOpenCurrentUserDialog={() => setIsUserBootstrapOpen(true)}
          onExportExcelBackup={handleHeaderExcelExport}
        />

        <div
          className="app-window__body"
          data-e2e-board-ready={activeUserProfile && isBoardSessionReady ? 'true' : 'false'}
        >
          {serverStorageError ? (
            <p style={{ margin: 0, padding: '20px 28px 0', color: '#8d5a5f', fontSize: '0.88rem' }}>{serverStorageError}</p>
          ) : null}
          {excelExportError ? (
            <p style={{ margin: 0, padding: '20px 28px 0', color: '#8d5a5f', fontSize: '0.88rem' }}>{excelExportError}</p>
          ) : null}
          {!activeUserProfile ? (
            <p style={{ margin: 0, padding: '24px 28px', color: '#61717a' }}>
              ユーザ登録すると、保存済みの業務データを読み込みます。
            </p>
          ) : !isBoardSessionReady ? (
            <p style={{ margin: 0, padding: '24px 28px', color: '#61717a' }}>保存データを読み込んでいます...</p>
          ) : activeView === 'daily' ? (
            <DailyWorkspace
              board={board}
              recentProjectCodes={recentProjectCodes}
              recentTaskNamesByProject={recentTaskNamesByProject}
              metrics={metrics}
              warnings={warnings}
              guideEnabled={guideEnabled}
              greetingEnabled={greetingEnabled}
              simpleModeEnabled={simpleModeEnabled}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              selectedItemKey={selectedItemKey}
              currentAuxEntries={currentAuxEntries}
              dayStatus={dayStatus}
              isCalendarOpen={isCalendarOpen}
              calendarMonthLabel={formatMonthLabel(calendarMonthDate)}
              calendarDays={calendarDays}
              canCopyPreviousDay={canCopyPreviousDayPlan}
              canCopyPreviousWeek={canCopyPreviousWeekPlan}
              canCopyPlanToActual={canCopyPlanToActual}
              autoFocusProjectId={autoFocusProjectId}
              draggingProjectId={draggingProjectId}
              isQuickProjectDialogOpen={isQuickProjectDialogOpen}
              onToggleCalendar={() => {
                setCalendarMonthDate(`${currentDate.slice(0, 7)}-01`);
                setIsCalendarOpen((prev) => !prev);
              }}
              onCloseCalendar={() => setIsCalendarOpen(false)}
              onOpenQuickProjectDialog={() => setIsQuickProjectDialogOpen(true)}
              onCloseQuickProjectDialog={() => setIsQuickProjectDialogOpen(false)}
              onShiftCalendarMonth={(deltaMonths) =>
                setCalendarMonthDate((prev) => shiftIsoMonth(prev, deltaMonths))
              }
              onSelectDate={openDate}
              onShiftDate={shiftDate}
              onCopyPreviousDay={copyPreviousDay}
              onCopyPreviousWeek={copyPreviousWeek}
              onCopyPlanToActual={copyPlanToActual}
              onModeChange={setMode}
              onSendMail={handleSendMail}
              canSendMail={canSendMail}
              mailSendDisabledReason={mailSendDisabledReason}
              isMailSending={isMailSending}
              mailSendError={mailSendError}
              mailSendSuccessMessage={mailSendSuccessMessage}
              onAddBlankRow={() => addBlankRow(true)}
              onAddAux={() => addAux('split', true)}
              onQuickAddProject={quickAddProject}
              onSelectProjectEntry={selectProjectEntry}
              onSelectAuxEntry={selectAuxEntry}
              onProjectDragStart={startProjectDrag}
              onProjectDrop={dropProject}
              onProjectSearchChange={setProjectSearch}
              onProjectSelect={selectProject}
              onChangeProjectTimeInputMode={setProjectTimeInputMode}
              onChangeProjectRange={setProjectRange}
              onChangeTask={setTask}
              onChangeMinutes={setMinutes}
              onStepMinutes={stepMinutes}
              onChangePlace={setPlace}
              onChangePlaceDetail={setPlaceDetail}
              onChangeNote={setNote}
              onRemoveProject={removeProject}
              onChangeSummaryTime={setSummaryTime}
              onStepSummaryTime={stepSummaryTime}
              onChangeAux={setAux}
              onChangeAuxType={setAuxType}
              onRemoveAux={removeAux}
              onMoveSelectedItem={moveSelectedItem}
              onAutoFocusDone={() => setAutoFocusProjectId(null)}
            />
          ) : activeView === 'monthly' ? (
            <MonthlySummaryView
              summary={monthlySummary}
              monthAnchorDate={monthAnchorDate}
              onShiftMonth={(deltaMonths) =>
                setMonthAnchorDate((prev) => shiftIsoMonth(prev, deltaMonths))
              }
              onOpenDate={openDate}
              onChangeProjectBudget={setMonthlyBudget}
              onOpenDayList={openDayListView}
              onOpenProjectMaster={openProjectMasterView}
            />
          ) : activeView === 'day-list' ? (
            <MonthlyDayListView
              summary={monthlySummary}
              selectedProject={selectedDayListProject}
              onShiftMonth={(deltaMonths) => setMonthAnchorDate((prev) => shiftIsoMonth(prev, deltaMonths))}
              onOpenDate={openDate}
              onOpenMonthly={openMonthlyView}
              onClearProjectScope={() => setDayListProjectCode(null)}
            />
          ) : activeView === 'timesheet-transfer' ? (
            <TimesheetTransferSimulationView
              viewModel={timesheetTransferViewModel}
              onShiftDate={(deltaDays) => openTimesheetTransferDate(shiftIsoDate(currentDate, deltaDays))}
              onOpenDaily={() => setActiveView('daily')}
            />
          ) : activeView === 'project-master' ? (
            <ProjectMasterAdmin
              catalog={sortProjectCatalog(latestProjectCatalog, { recentProjectCodes })}
              monthlyProjects={monthlySummary.projects}
              monthLabel={monthlySummary.monthLabel}
              onShiftMonth={(deltaMonths) => setMonthAnchorDate((prev) => shiftIsoMonth(prev, deltaMonths))}
              onSaveProject={saveProjectMaster}
            />
          ) : activeView === 'user-admin' ? (
            <UserAdminPanel
              currentUserId={currentUserId}
              users={adminUsers}
              summary={adminUserSummary}
              monitoring={adminMonitoring}
              rankings={adminRankings}
              dashboardAnalysis={adminDashboardAnalysis}
              selectedUserId={selectedAdminUserId}
              isLoading={isAdminUsersLoading}
              isSaving={isAdminUserSaving}
              isDeleting={isAdminUserDeleting}
              error={adminUserError}
              onRefresh={() => void refreshAdminUsers(currentUserId)}
              onSelectUser={setSelectedAdminUserId}
              onSaveUser={(user) => void handleSaveAdminUser(user)}
              onDeleteUser={(userId) => void handleDeleteAdminUser(userId)}
            />
          ) : activeView === 'user-reference' ? (
            <UserReferencePanel
              users={referenceUsers}
              selectedUserIds={selectedReferenceUserIds}
              isLoading={isReferenceUsersLoading}
              isBulkDownloading={isReferenceBulkDownloading}
              openingSnapshotUserId={openingReferenceSnapshotUserId}
              downloadingUserId={referenceDownloadingUserId}
              error={referenceError}
              downloadError={referenceDownloadError}
              downloadNotice={referenceDownloadNotice}
              restoreSelectionCount={restorableReferenceSelectionIds.length}
              favoriteUserIds={availableFavoriteReferenceUserIds}
              onRefresh={() => void refreshReferenceUsers(currentUserId)}
              onToggleUserSelection={toggleReferenceUserSelection}
              onSelectVisibleUsers={selectReferenceUsers}
              onClearSelection={clearReferenceUserSelection}
              onRestoreSelection={restoreReferenceUserSelection}
              onToggleFavoriteUser={toggleReferenceFavoriteUser}
              onSelectFavoriteUsers={selectFavoriteReferenceUsers}
              onOpenSnapshot={(userId) => void openUserReferenceSnapshotView(userId)}
              onDownloadUser={(userId) => void downloadReferenceUserExcel(userId)}
              onDownloadSelected={() => void downloadReferenceUsersZip()}
            />
          ) : activeView === 'user-reference-preview' && referenceSession ? (
            <UserReferenceSnapshotView
              session={referenceSession}
              onBack={() => setActiveView('user-reference')}
            />
          ) : null}
        </div>

        <PageHelpDialog
          isOpen={isHelpDialogOpen}
          activeView={
            activeView === 'user-admin' ||
            activeView === 'user-reference' ||
            activeView === 'user-reference-preview' ||
            activeView === 'timesheet-transfer'
              ? 'daily'
              : activeView
          }
          onClose={() => setIsHelpDialogOpen(false)}
        />
        <ReleaseNotesDialog
          isOpen={isReleaseNotesDialogOpen}
          onClose={() => setIsReleaseNotesDialogOpen(false)}
        />

        <UserBootstrapDialog
          isOpen={isUserBootstrapOpen}
          canClose={Boolean(activeUserProfile)}
          userId={currentUserIdDraft}
          userName={currentUserNameDraft}
          isApplying={isApplyingCurrentUser}
          canApply={Boolean(normalizedCurrentUserProfileDraft)}
          onChangeUserId={setCurrentUserIdDraft}
          onChangeUserName={setCurrentUserNameDraft}
          onClose={closeUserBootstrap}
          onApply={applyCurrentUser}
        />
        <MailHelperSetupDialog
          isOpen={isMailHelperSetupOpen}
          onClose={closeMailHelperSetupDialog}
        />
      </div>
    </div>
  );
}
