import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import appLogo from '../assets/oshigoto-techo-logo.svg';
import { APP_VERSION_LABEL } from '../lib/app-version';
import { buildDailyGreeting, type DailyGreetingContent } from '../lib/daily-greeting';
import { releaseNotes } from '../lib/release-notes';
import {
  hasGreetingBeenSeen,
  markGreetingAsSeen,
} from '../storage/greeting-display-storage';
import { loadServerTodayFact } from '../storage/server-greeting';
import {
  buildDifferenceState,
  buildTaskSuggestions,
  calculateTimeRangeMinutesExcludingLunch,
  categoryLabels,
  formatDateLabel,
  formatHoursDecimal,
  formatHoursDetailed,
  formatHoursMinutesLabel,
  formatMinutesDetailed,
  formatMinutesShort,
  formatProjectSearchLabel,
  formatSignedHoursDecimal,
  formatSignedMinutesDetailed,
  getEntryPlaceDisplayLabel,
  getAuxTypeLabel,
  getAnnualLeaveBaseTargetMinutes,
  isProjectCatalogItemActive,
  isAuxRangeType,
  normalizeProjectCode,
  placeLabels,
  quarterHourOptions,
  resolveRecentProjects,
  roundToQuarter,
  stepTimeValue,
} from '../lib/input-board';
import type {
  DayInputStatus,
  InputBoardMetrics,
  InputBoardWarning,
  ModeMetrics,
  MonthlySummary,
} from '../lib/input-board';
import { ProjectMasterPicker } from './project-master-picker';
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
import type { MailSendPreview } from '../types/mail';

const modeLabels: Record<EntryMode, string> = {
  plan: '予定',
  actual: '実績',
};

const statusLabels: Record<DayInputStatus, string> = {
  empty: '未入力',
  partial: '入力途中',
  done: '入力済み',
};

const calendarLegendLabels: Record<DayInputStatus, string> = {
  empty: '空欄',
  partial: '途中',
  done: '完了',
};

const calendarStatusMarks: Record<DayInputStatus, string> = {
  empty: '未',
  partial: '途',
  done: '済',
};

const monthlyFilterLabels: Record<MonthlyDayFilter, string> = {
  all: '全部',
  difference: '差分あり',
  empty: '未入力',
  future: '未来日',
};

const placeOptions: WorkPlace[] = ['home', 'office', 'client', 'other'];

function extractWarningCount(detail: string) {
  const matched = detail.match(/^(\d+)件/);
  return matched ? Number(matched[1]) : null;
}

function formatWarningBadge(warning: InputBoardWarning) {
  const count = extractWarningCount(warning.detail);

  switch (warning.id) {
    case 'task-name':
      return count ? `要タスク ${count}件` : '要タスク';
    case 'project-code':
      return count ? `要PJ入力 ${count}件` : '要PJ入力';
    case 'project-range':
      return count ? `時間帯確認 ${count}件` : '時間帯確認';
    case 'aux-time':
      return count ? `年休/分断確認 ${count}件` : '年休/分断確認';
    case 'annual-leave-conflict':
      return '年休重複';
    case 'ses-comment':
      return count ? `要コメント ${count}件` : '要コメント';
    case 'time-range':
      return '開始 / 終了確認';
    default:
      return warning.title;
  }
}

function clampPercentage(value: number) {
  return Math.max(0, Math.min(100, value));
}

function formatRateLabel(value: number | null) {
  if (value === null) {
    return '--';
  }

  return `${Math.round(value * 100)}%`;
}

function formatDifferenceDetail(differenceMinutes: number | null) {
  if (differenceMinutes === null) {
    return '開始と終了を入れると計算できます';
  }

  if (differenceMinutes === 0) {
    return '稼働時間と一致しています';
  }

  if (differenceMinutes > 0) {
    return `入力過少 ${formatHoursDecimal(differenceMinutes)}`;
  }

  return `入力超過 ${formatHoursDecimal(Math.abs(differenceMinutes))}`;
}

function buildModeAuxDetail(metrics: ModeMetrics) {
  const labels: string[] = [];

  if (metrics.annualLeaveBaseType) {
    labels.push(getAuxTypeLabel(metrics.annualLeaveBaseType));
  }

  if (metrics.annualHourMinutes > 0) {
    labels.push(`1H休 ${formatMinutesShort(metrics.annualHourMinutes)}`);
  }

  if (metrics.splitMinutes > 0) {
    labels.push(`分断 ${formatMinutesShort(metrics.splitMinutes)}`);
  }

  if (metrics.breakMinutes > 0) {
    labels.push(`休憩 ${formatMinutesShort(metrics.breakMinutes)}`);
  }

  return labels.join(' / ') || '登録なし';
}

function buildAuxEntryMetaLabel(entry: AuxTimeEntry, lunchMinutes: number) {
  if (entry.type === 'annual-day') {
    return '終日';
  }

  if (entry.type === 'annual-am' || entry.type === 'annual-pm') {
    const targetMinutes = getAnnualLeaveBaseTargetMinutes(entry.type);
    const baseRange = entry.type === 'annual-am' ? '13:00 - 17:00' : '8:30 - 12:00';
    return `${baseRange} / 基準 ${formatMinutesShort(targetMinutes)}`;
  }

  const duration = calculateTimeRangeMinutesExcludingLunch(entry.startTime, entry.endTime, lunchMinutes);
  return `${entry.startTime || '--:--'} - ${entry.endTime || '--:--'} / ${formatMinutesShort(duration)}`;
}

function buildAuxEntryNotePlaceholder(type: AuxEntryType) {
  if (type === 'split') {
    return '任意メモ。移動や待機の補足があればここに。';
  }

  if (type === 'break' || type === 'annual-hour') {
    return '補足メモ';
  }

  return '年休メモ';
}

type SummaryTone = 'danger' | 'caution' | 'neutral' | 'info';

function formatMinuteCount(value: number | null, signed = false) {
  if (value === null) {
    return '--';
  }

  if (signed && value === 0) {
    return '±0分';
  }

  const sign = value < 0 ? '-' : signed && value > 0 ? '+' : '';
  return `${sign}${Math.abs(value)}分`;
}

function buildHourMinuteDisplay(value: number | null, signed = false) {
  return {
    hoursLabel: signed ? formatSignedHoursDecimal(value) : formatHoursDecimal(value),
    minutesLabel: `（${formatMinuteCount(value, signed)}）`,
  };
}

interface MonthlyOverviewCardMetaItem {
  label: string;
  value: string;
}

function isProjectEntryTouched(entry: ProjectEntry, mode: EntryMode) {
  return (
    entry.projectCode.trim() !== '' ||
    entry.projectSearch.trim() !== '' ||
    entry.taskName[mode].trim() !== '' ||
    entry.note[mode].trim() !== '' ||
    entry.minutes[mode] > 0 ||
    entry.rangeStart[mode].trim() !== '' ||
    entry.rangeEnd[mode].trim() !== ''
  );
}

function hasProjectInputForMode(board: InputBoardDraft, mode: EntryMode) {
  return board.projectEntries.some((entry) => isProjectEntryTouched(entry, mode));
}

function getDailyGuide(
  board: InputBoardDraft,
  metrics: InputBoardMetrics,
  warnings: InputBoardWarning[],
  currentMode: EntryMode,
): DailyGuide | null {
  const currentMetrics = metrics[currentMode];
  const summaryReady =
    currentMetrics.annualLeaveBaseType === 'annual-day' ||
    (board.startTime[currentMode] !== '' && board.endTime[currentMode] !== '');
  const hasProjectInput = hasProjectInputForMode(board, currentMode);
  const hasAuxInput = board.auxEntries.some((entry) => entry.mode === currentMode);
  const hasBoardInput = hasProjectInput || hasAuxInput;

  if (!summaryReady) {
    return {
      step: 'summary',
      eyebrow: 'STEP 1 / 3',
      title: `開始と終了の${modeLabels[currentMode]}を入力`,
      detail: 'ここでその日の稼働時間が決まります。',
    };
  }

  if (!hasBoardInput) {
    return {
      step: 'board',
      eyebrow: 'STEP 2 / 3',
      title: `${modeLabels[currentMode]}を入力ボードに追加`,
      detail: 'PJ行や分断・休憩を追加して入力します。',
    };
  }

  if (currentMetrics.differenceMinutes !== 0 || warnings.length > 0) {
    return {
      step: 'difference',
      eyebrow: 'STEP 3 / 3',
      title: '差分と警告を確認',
      detail: '未入力や時間のずれがないか確認します。',
    };
  }

  return null;
}

export function getDailyNextAction(
  board: InputBoardDraft,
  metrics: InputBoardMetrics,
  warnings: InputBoardWarning[],
  currentMode: EntryMode,
  canSendMail: boolean,
  mailSendDisabledReason?: string | null,
): DailyNextAction {
  const currentMetrics = metrics[currentMode];
  const summaryReady = board.startTime[currentMode] !== '' && board.endTime[currentMode] !== '';
  const hasProjectInput = hasProjectInputForMode(board, currentMode);
  const hasAuxInput = board.auxEntries.some((entry) => entry.mode === currentMode);
  const projectTarget =
    board.projectEntries.find((entry) => {
      if (!entry.projectCode.trim()) {
        return isProjectEntryTouched(entry, currentMode);
      }

      return false;
    }) ??
    (!hasProjectInput && !hasAuxInput ? board.projectEntries[0] ?? null : null);

  if (!summaryReady) {
    return {
      key: 'summary',
      label: '勤務時間を入れる',
      tone: 'info',
    };
  }

  if (projectTarget) {
    return {
      key: 'project',
      label: 'PJを選ぶ',
      tone: 'info',
      targetProjectId: projectTarget.id,
    };
  }

  const taskTarget = board.projectEntries.find(
    (entry) =>
      isProjectEntryTouched(entry, currentMode) &&
      entry.projectCode.trim() !== '' &&
      entry.taskName[currentMode].trim() === '',
  );

  if (taskTarget) {
    return {
      key: 'task',
      label: 'タスクを入れる',
      tone: 'info',
      targetProjectId: taskTarget.id,
    };
  }

  if (currentMetrics.differenceMinutes !== 0) {
    return {
      key: 'difference',
      label: '差分を合わせる',
      tone: 'caution',
    };
  }

  if (warnings.length > 0) {
    const firstWarning = warnings.find((warning) => warning.id !== 'difference') ?? warnings[0];
    const needsTimeFix =
      firstWarning.id === 'time-range' ||
      firstWarning.id === 'summary-quarter' ||
      firstWarning.id === 'project-range' ||
      firstWarning.id === 'project-range-quarter' ||
      firstWarning.id === 'aux-time' ||
      firstWarning.id === 'aux-quarter';

    return {
      key: 'difference',
      label: needsTimeFix ? '時間を整える' : '不足を直す',
      tone: firstWarning.tone === 'danger' ? 'caution' : 'info',
    };
  }

  if (canSendMail) {
    return {
      key: 'mail',
      label: 'メール作成できる状態です',
      tone: 'safe',
    };
  }

  if (mailSendDisabledReason?.includes('宛先')) {
    return {
      key: 'recipient',
      label: '宛先を設定する',
      tone: 'info',
    };
  }

  return {
    key: 'mail',
    label: 'メール作成の前に確認する',
    tone: 'info',
  };
}

function buildSpotlightRect(targetRefs: SpotlightTargetRef[]) {
  const rects = targetRefs
    .map((targetRef) => targetRef.current?.getBoundingClientRect() ?? null)
    .filter((rect): rect is DOMRect => rect !== null);

  if (rects.length === 0) {
    return null;
  }

  const top = Math.min(...rects.map((rect) => rect.top));
  const left = Math.min(...rects.map((rect) => rect.left));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  const padding = 10;

  return {
    top: Math.max(12, top - padding),
    left: Math.max(12, left - padding),
    width: right - left + padding * 2,
    height: bottom - top + padding * 2,
  } satisfies SpotlightRect;
}

export interface CalendarDayCell {
  date: string;
  dayNumber: number;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName: string | null;
  dayOffLabel: string | null;
  status: DayInputStatus;
  summaryLabel: string;
}

type MonthlyDayFilter = 'all' | 'difference' | 'empty' | 'future';
type MonthlyProjectSort = 'budget' | 'difference' | 'progress' | 'code';
type MonthlyProjectCategoryFilter = 'all' | 'direct' | 'indirect' | 'unset';
type DailyGuideStep = 'summary' | 'board' | 'difference';
type DailyNextActionKey = 'summary' | 'project' | 'task' | 'difference' | 'mail' | 'recipient';
export type AppTheme =
  | 'warm-teal'
  | 'citrus-pop'
  | 'berry-pop'
  | 'glitter-gold'
  | 'lavender-fog'
  | 'sage-paper'
  | 'cedar-moss'
  | 'electric-pop'
  | 'plum-smoke'
  | 'coral-sunset'
  | 'blue-pearl'
  | 'neon-splash'
  | 'hyper-candy'
  | 'miami-pulse'
  | 'cobalt-pulse'
  | 'aqua-yellow'
  | 'royal-lime'
  | 'tango-blue'
  | 'deep-navy'
  | 'graphite-mint'
  | 'electric-yellow'
  | 'paper-ink'
  | 'black-ruby'
  | 'garnet-red'
  | 'midnight-ink';
export type DensityMode = 'comfortable' | 'compact';

const monthlyProjectSortLabels: Record<MonthlyProjectSort, string> = {
  budget: '計画が多い順',
  difference: '差分が大きい順',
  progress: '消化率順',
  code: 'PJCD順',
};

const monthlyProjectCategoryLabels: Record<MonthlyProjectCategoryFilter, string> = {
  all: '全部',
  direct: '直接',
  indirect: '間接',
  unset: '未設定',
};

interface DailyGuide {
  step: DailyGuideStep;
  eyebrow: string;
  title: string;
  detail: string;
}

interface DailyNextAction {
  key: DailyNextActionKey;
  label: string;
  tone: 'info' | 'caution' | 'safe';
  targetProjectId?: string | null;
}

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

type SpotlightTargetRef = RefObject<Element | null>;

const appThemeLabels: Record<AppTheme, string> = {
  'warm-teal': 'Warm Teal',
  'citrus-pop': 'Citrus Pop',
  'berry-pop': 'Berry Pop',
  'glitter-gold': 'Glitter Gold',
  'lavender-fog': 'Lavender Fog',
  'sage-paper': 'Sage Paper',
  'cedar-moss': 'Cedar Moss',
  'electric-pop': 'Electric Pop',
  'plum-smoke': 'Plum Smoke',
  'coral-sunset': 'Coral Sunset',
  'blue-pearl': 'Blue Pearl',
  'neon-splash': 'Neon Splash',
  'hyper-candy': 'Hyper Candy',
  'miami-pulse': 'Miami Pulse',
  'cobalt-pulse': 'Cobalt Pulse',
  'aqua-yellow': 'Aqua Yellow',
  'royal-lime': 'Royal Lime',
  'tango-blue': 'Tango Blue',
  'deep-navy': 'Deep Navy',
  'graphite-mint': 'Graphite Mint',
  'electric-yellow': 'Electric Yellow',
  'paper-ink': 'Paper Ink',
  'black-ruby': 'Black Ruby',
  'garnet-red': 'Garnet Red',
  'midnight-ink': 'Midnight Ink',
};

const appThemeGroups: Array<{ label: string; items: AppTheme[] }> = [
  {
    label: 'natural',
    items: ['warm-teal', 'sage-paper', 'glitter-gold', 'coral-sunset', 'cedar-moss'],
  },
  {
    label: 'soft',
    items: ['lavender-fog', 'berry-pop', 'citrus-pop', 'garnet-red', 'blue-pearl'],
  },
  {
    label: 'vivid',
    items: ['electric-pop', 'neon-splash', 'hyper-candy', 'miami-pulse', 'aqua-yellow'],
  },
  {
    label: 'bold',
    items: ['electric-yellow', 'plum-smoke', 'cobalt-pulse', 'royal-lime', 'tango-blue'],
  },
  {
    label: 'contrast',
    items: ['deep-navy', 'midnight-ink', 'graphite-mint', 'black-ruby', 'paper-ink'],
  },
];

const densityLabels: Record<DensityMode, string> = {
  comfortable: 'Default',
  compact: 'Compact',
};

const recentReleaseHighlightDays = 7;
const millisecondsPerDay = 24 * 60 * 60 * 1000;

function isCurrentReleaseRecent(referenceDate = new Date()) {
  const latestRelease = releaseNotes[0];

  if (!latestRelease || latestRelease.version !== APP_VERSION_LABEL) {
    return false;
  }

  const releaseDate = new Date(`${latestRelease.releasedOn}T00:00:00`);
  if (Number.isNaN(releaseDate.getTime())) {
    return false;
  }

  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const releaseDay = new Date(releaseDate.getFullYear(), releaseDate.getMonth(), releaseDate.getDate());
  const daysSinceRelease = Math.floor((today.getTime() - releaseDay.getTime()) / millisecondsPerDay);
  return daysSinceRelease >= 0 && daysSinceRelease < recentReleaseHighlightDays;
}

interface AppWindowHeaderProps {
  activeView:
    | 'daily'
    | 'monthly'
    | 'day-list'
    | 'project-master'
    | 'timesheet-transfer'
    | 'user-admin'
    | 'user-reference'
    | 'user-reference-preview';
  currentMonthLabel: string;
  monthOvertimeMinutes: number;
  referencePreviewLabel?: string | null;
  theme: AppTheme;
  density: DensityMode;
  guideEnabled: boolean;
  greetingEnabled: boolean;
  simpleModeEnabled: boolean;
  recipientGuided?: boolean;
  currentUserId: string;
  currentUserName: string;
  currentUserMailToDraft: string;
  currentUserMailCcDraft: string;
  canSaveMailRecipientSettings: boolean;
  canExportExcelBackup: boolean;
  canOpenUserAdmin?: boolean;
  canOpenUserReference?: boolean;
  canOpenTimesheetTransfer?: boolean;
  isExcelExporting: boolean;
  onOpenDaily: () => void;
  onOpenMonthly: () => void;
  onOpenDayList: () => void;
  onOpenProjectMaster: () => void;
  onOpenTimesheetTransfer: () => void;
  onOpenUserAdmin?: () => void;
  onOpenUserReference?: () => void;
  onChangeTheme: (theme: AppTheme) => void;
  onChangeDensity: (density: DensityMode) => void;
  onChangeGuideEnabled: (enabled: boolean) => void;
  onChangeGreetingEnabled: (enabled: boolean) => void;
  onChangeSimpleModeEnabled: (enabled: boolean) => void;
  onChangeCurrentUserMailToDraft: (value: string) => void;
  onChangeCurrentUserMailCcDraft: (value: string) => void;
  onSaveCurrentUserMailSettings: () => void;
  onOpenMailHelperSetup: () => void;
  onOpenReleaseNotes: () => void;
  onOpenHelp: () => void;
  onOpenCurrentUserDialog: () => void;
  onExportExcelBackup: () => void;
}

export function AppWindowHeader({
  activeView,
  currentMonthLabel,
  monthOvertimeMinutes,
  referencePreviewLabel = null,
  theme,
  density,
  guideEnabled,
  greetingEnabled,
  simpleModeEnabled,
  recipientGuided = false,
  currentUserId,
  currentUserName,
  currentUserMailToDraft,
  currentUserMailCcDraft,
  canSaveMailRecipientSettings,
  canExportExcelBackup,
  canOpenUserAdmin = false,
  canOpenUserReference = false,
  canOpenTimesheetTransfer = false,
  isExcelExporting,
  onOpenDaily,
  onOpenMonthly,
  onOpenDayList,
  onOpenProjectMaster,
  onOpenTimesheetTransfer,
  onOpenUserAdmin,
  onOpenUserReference,
  onChangeTheme,
  onChangeDensity,
  onChangeGuideEnabled,
  onChangeGreetingEnabled,
  onChangeSimpleModeEnabled,
  onChangeCurrentUserMailToDraft,
  onChangeCurrentUserMailCcDraft,
  onSaveCurrentUserMailSettings,
  onOpenMailHelperSetup,
  onOpenReleaseNotes,
  onOpenHelp,
  onOpenCurrentUserDialog,
  onExportExcelBackup,
}: AppWindowHeaderProps) {
  const displayMenuRef = useRef<HTMLDetailsElement | null>(null);
  const currentUserMenuRef = useRef<HTMLDetailsElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (displayMenuRef.current?.open && !displayMenuRef.current.contains(event.target as Node)) {
        displayMenuRef.current.open = false;
      }

      if (currentUserMenuRef.current?.open && !currentUserMenuRef.current.contains(event.target as Node)) {
        currentUserMenuRef.current.open = false;
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const isReferencePreviewHeader = activeView === 'user-reference-preview' && Boolean(referencePreviewLabel);
  const shouldHighlightRelease = isCurrentReleaseRecent();

  return (
      <header className="app-window__header">
        <div className="app-brand">
          <div className="traffic-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="app-brand__title">
            <img className="app-brand__logo" src={appLogo} alt="" aria-hidden="true" />
            <div>
              <p className="app-brand__eyebrow">oshigoto techo</p>
              <div className="app-brand__name-row">
                <h1>おしごと手帳</h1>
                <button
                  type="button"
                  className={[
                    'app-brand__version app-brand__version-button',
                    shouldHighlightRelease ? 'is-recent-release' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={onOpenReleaseNotes}
                  title="変更履歴を開く"
                  aria-label={`${APP_VERSION_LABEL} の変更履歴を開く`}
                >
                  {APP_VERSION_LABEL}
                  {shouldHighlightRelease ? <span className="app-brand__version-update">NEW</span> : null}
                </button>
              </div>
            </div>
          </div>
        </div>

      <div className="app-window__actions">
        {isReferencePreviewHeader ? (
          <div className="header-kpi header-kpi--reference-lock">
            <span>照会中</span>
            <strong>{referencePreviewLabel}</strong>
          </div>
        ) : (
          <>
            <div className="header-kpi">
              <span>{currentMonthLabel}</span>
              <strong>FT清算時間 {formatHoursDecimal(monthOvertimeMinutes)}</strong>
            </div>

            <div className="window-tabset" role="tablist" aria-label="画面切り替え">
              <button
                type="button"
                className={activeView === 'daily' ? 'window-tabset__item is-active' : 'window-tabset__item'}
                onClick={onOpenDaily}
              >
                日入力
              </button>
              <button
                type="button"
                className={activeView === 'day-list' ? 'window-tabset__item is-active' : 'window-tabset__item'}
                onClick={onOpenDayList}
              >
                日一覧
              </button>
              <button
                type="button"
                className={activeView === 'monthly' ? 'window-tabset__item is-active' : 'window-tabset__item'}
                onClick={onOpenMonthly}
              >
                月集計
              </button>
              <button
                type="button"
                className={activeView === 'project-master' ? 'window-tabset__item is-active' : 'window-tabset__item'}
                onClick={onOpenProjectMaster}
              >
                PJマスタ
              </button>
            </div>
          </>
        )}
        <div className="app-window__utility-area">
          <div className="app-window__utility-columns">
            <div className="app-window__utility-stack">
              {!isReferencePreviewHeader ? (
                <details ref={displayMenuRef} className="display-menu">
                <summary className="ghost-button">表示設定</summary>
                <div className="display-menu__panel">
                  <section className="display-menu__section">
                    <p className="section-label">theme</p>
                    <h3>テーマ</h3>
                    <div className="display-menu__theme-groups">
                      {appThemeGroups.map((group) => (
                        <div key={group.label} className="display-menu__theme-group">
                          <p className="display-menu__theme-group-label">{group.label}</p>
                          <div className="display-menu__choices display-menu__choices--themes">
                            {group.items.map((item) => (
                              <button
                                key={item}
                                type="button"
                                className={theme === item ? 'display-choice is-active' : 'display-choice'}
                                onClick={() => {
                                  onChangeTheme(item);
                                  if (displayMenuRef.current) {
                                    displayMenuRef.current.open = false;
                                  }
                                }}
                              >
                                {appThemeLabels[item]}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="display-menu__section">
                    <p className="section-label">density</p>
                    <h3>表示密度</h3>
                    <div className="display-menu__choices display-menu__choices--density">
                      {(Object.keys(densityLabels) as DensityMode[]).map((item) => (
                        <button
                          key={item}
                          type="button"
                          className={density === item ? 'display-choice is-active' : 'display-choice'}
                          onClick={() => {
                            onChangeDensity(item);
                            if (displayMenuRef.current) {
                              displayMenuRef.current.open = false;
                            }
                          }}
                        >
                          {densityLabels[item]}
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="display-menu__section">
                    <p className="section-label">extras</p>
                    <h3>おまけ機能</h3>
                    <label className="display-toggle">
                      <input
                        type="checkbox"
                        checked={simpleModeEnabled}
                        onChange={(event) => onChangeSimpleModeEnabled(event.target.checked)}
                      />
                      <span>かんたんモードを使う</span>
                    </label>
                    <label className="display-toggle">
                      <input
                        type="checkbox"
                        checked={guideEnabled}
                        onChange={(event) => onChangeGuideEnabled(event.target.checked)}
                      />
                      <span>入力ガイドを表示する</span>
                    </label>
                    <label className="display-toggle display-toggle--greeting">
                      <input
                        type="checkbox"
                        checked={greetingEnabled}
                        onChange={(event) => onChangeGreetingEnabled(event.target.checked)}
                      />
                      <span>朝と夜の挨拶を表示する</span>
                    </label>
                  </section>
                </div>
                </details>
              ) : null}

              <button type="button" className="ghost-button" onClick={onOpenHelp}>
                ヘルプ
              </button>
            </div>

            <div className="app-window__utility-stack">
              {!isReferencePreviewHeader ? (
                <details ref={currentUserMenuRef} className="display-menu display-menu--user">
                <summary
                  className={[
                    'ghost-button',
                    'display-menu__summary',
                    recipientGuided ? 'is-guide-target' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span>利用者設定</span>
                  <span className="display-menu__summary-badge" title={currentUserId || '未設定'}>
                    {currentUserId || '未設定'}
                  </span>
                </summary>
                <div className="display-menu__panel">
                  <section className="display-menu__section">
                    <p className="section-label">user</p>
                    <div className="display-menu__heading">
                      <h3>現在の利用者</h3>
                    </div>
                    <div className="display-current-user display-current-user--profile">
                      <div>
                        <span className="display-current-user__label">user name</span>
                        <strong className="display-current-user__value">{currentUserName || '未設定'}</strong>
                      </div>
                      <div>
                        <span className="display-current-user__label">user id</span>
                        <strong className="display-current-user__value">{currentUserId || '未設定'}</strong>
                      </div>
                    </div>
                    <p className="display-menu__note">
                      別の利用者を確認したいときは「利用者参照」を使います。ここでは現在の表示名だけ変更できます。
                    </p>
                    <div className="display-actions">
                      {canOpenUserReference && onOpenUserReference ? (
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => {
                            if (currentUserMenuRef.current) {
                              currentUserMenuRef.current.open = false;
                            }
                            onOpenUserReference();
                          }}
                        >
                          利用者参照
                        </button>
                      ) : null}
                      {canOpenTimesheetTransfer ? (
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => {
                            if (currentUserMenuRef.current) {
                              currentUserMenuRef.current.open = false;
                            }
                            onOpenTimesheetTransfer();
                          }}
                        >
                          転記確認（試作）
                        </button>
                      ) : null}
                      {canOpenUserAdmin && onOpenUserAdmin ? (
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => {
                            if (currentUserMenuRef.current) {
                              currentUserMenuRef.current.open = false;
                            }
                            onOpenUserAdmin();
                          }}
                        >
                          利用者管理
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => {
                          if (currentUserMenuRef.current) {
                            currentUserMenuRef.current.open = false;
                          }
                          onOpenCurrentUserDialog();
                        }}
                      >
                        表示名変更
                      </button>
                    </div>
                  </section>

                  <section className="display-menu__section">
                    <p className="section-label">mail</p>
                    <div className="display-menu__heading">
                      <h3>メール送信先</h3>
                      <span className="display-menu__badge">利用者ごと</span>
                    </div>
                    <p className="display-menu__note">
                      <strong>
                        先に
                        <code> 設定 &gt; アプリ &gt; 既定のアプリ &gt; MAILTO &gt; Outlook (classic)</code>
                        に変更してください。
                      </strong>
                    </p>
                    <p className="display-menu__note">
                      宛先は利用者単位で保存します。複数指定は <code>;</code> / <code>,</code> / 改行で区切れます。
                    </p>
                    <label className="display-field">
                      <span className="display-field__label">to</span>
                      <input
                        className="display-field__input"
                        type="text"
                        name="current-user-mail-to"
                        value={currentUserMailToDraft}
                        onChange={(event) => onChangeCurrentUserMailToDraft(event.target.value)}
                        placeholder="user@example.com"
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </label>
                    <label className="display-field">
                      <span className="display-field__label">cc</span>
                      <input
                        className="display-field__input"
                        type="text"
                        name="current-user-mail-cc"
                        value={currentUserMailCcDraft}
                        onChange={(event) => onChangeCurrentUserMailCcDraft(event.target.value)}
                        placeholder="member1@example.com; member2@example.com"
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </label>
                    <div className="display-actions">
                      <button
                        type="button"
                        className="secondary-button secondary-button--compact"
                        onClick={onSaveCurrentUserMailSettings}
                        disabled={!canSaveMailRecipientSettings}
                      >
                        送信先を保存
                      </button>
                    </div>
                  </section>

                  <section className="display-menu__section">
                    <p className="section-label">mail</p>
                    <div className="display-menu__heading">
                      <h3>HTMLメール設定</h3>
                    </div>
                    <p className="display-menu__note">
                      HTML の見た目でメールを作りたい場合だけ設定してください。補助ツールが見つかれば HTML メールを開き、
                      見つからなければ通常メールの下書きを開きます。
                    </p>
                    <div className="display-actions">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => {
                          if (currentUserMenuRef.current) {
                            currentUserMenuRef.current.open = false;
                          }
                          onOpenMailHelperSetup();
                        }}
                      >
                        設定手順を見る
                      </button>
                    </div>
                  </section>
                </div>
                </details>
              ) : null}

              <button
                type="button"
                className="ghost-button"
                onClick={onExportExcelBackup}
                disabled={!canExportExcelBackup || isExcelExporting}
              >
                {isExcelExporting ? 'Excelエクスポート中...' : 'Excelエクスポート'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

interface UserBootstrapDialogProps {
  isOpen: boolean;
  canClose: boolean;
  userId: string;
  userName: string;
  isApplying: boolean;
  canApply: boolean;
  onChangeUserId: (value: string) => void;
  onChangeUserName: (value: string) => void;
  onClose: () => void;
  onApply: () => void;
}

export function UserBootstrapDialog({
  isOpen,
  canClose,
  userId,
  userName,
  isApplying,
  canApply,
  onChangeUserId,
  onChangeUserName,
  onClose,
  onApply,
}: UserBootstrapDialogProps) {
  if (!isOpen) {
    return null;
  }

  const isSetupMode = !canClose;
  const dialogModeLabel = isSetupMode ? 'user setup' : 'profile';
  const dialogTitle = isSetupMode ? 'ユーザ登録' : '表示名を変更';
  const applyLabel = isSetupMode ? '確定' : '表示名を保存';
  const appBackground = document.querySelector<HTMLElement>('.app-background');
  const theme = appBackground?.dataset.theme;
  const dialog = (
    <div
      className="modal-backdrop"
      data-theme={theme}
      role="presentation"
      onClick={canClose && !isApplying ? onClose : undefined}
    >
      <section
        className="modal-card modal-card--user-bootstrap"
        role="dialog"
        aria-modal="true"
        aria-label="利用者設定"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="section-header">
          <div>
            <p className="section-label">{dialogModeLabel}</p>
            <h2>{dialogTitle}</h2>
          </div>
          {canClose ? (
            <button type="button" className="icon-button" onClick={onClose} disabled={isApplying}>
              閉じる
            </button>
          ) : null}
        </div>

        {!isSetupMode ? (
          <div className="storage-info-card">
            <div className="storage-info-card__grid">
              <div className="storage-info-card__item storage-info-card__item--wide">
                <span className="storage-info-card__label">現在の user id</span>
                <strong className="storage-info-card__value storage-info-card__value--mono">{userId || '未設定'}</strong>
              </div>
            </div>
            <p className="storage-info-card__note">別の利用者を見るときは「利用者参照」を使います。</p>
          </div>
        ) : null}

        <div className="user-bootstrap__grid">
          {isSetupMode ? (
            <label className="field-stack">
              <span>user id</span>
              <input
                type="text"
                value={userId}
                onChange={(event) => onChangeUserId(event.target.value)}
                placeholder="demo-user"
                autoComplete="off"
                spellCheck={false}
                disabled={isApplying}
              />
            </label>
          ) : null}

          <label className="field-stack">
            <span>user name</span>
            <input
              type="text"
              value={userName}
              onChange={(event) => onChangeUserName(event.target.value)}
              placeholder="Demo User"
              autoComplete="off"
              disabled={isApplying}
            />
          </label>
        </div>
        <div className="header-action-row">
          {canClose ? (
            <button type="button" className="secondary-button" onClick={onClose} disabled={isApplying}>
              戻る
            </button>
          ) : null}
          <button type="button" className="primary-button" onClick={onApply} disabled={!canApply || isApplying}>
            {isApplying ? '更新中...' : applyLabel}
          </button>
        </div>
      </section>
    </div>
  );

  return createPortal(dialog, document.body);
}

interface MailDraftDialogProps {
  isOpen: boolean;
  preview: MailSendPreview;
  canSend: boolean;
  disabledReason?: string | null;
  isSending: boolean;
  sendError: string | null;
  sendSuccessMessage: string | null;
  onClose: () => void;
  onSend: () => void;
}

interface MailHelperSetupDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MailHelperSetupDialog({
  isOpen,
  onClose,
}: MailHelperSetupDialogProps) {
  if (!isOpen) {
    return null;
  }

  const appBackground = document.querySelector<HTMLElement>('.app-background');
  const theme = appBackground?.dataset.theme;
  const dialog = (
    <div className="modal-backdrop" data-theme={theme} role="presentation" onClick={onClose}>
      <section
        className="modal-card modal-card--mail-helper"
        role="dialog"
        aria-modal="true"
        aria-label="HTMLメール設定"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="section-header">
          <div>
            <p className="section-label">mail</p>
            <h2>HTMLメール設定</h2>
            <p className="user-bootstrap__lead">
              Public edition ではローカル補助ツールのバイナリ配布を含めていません。通常のメール作成導線にフォールバックできます。
            </p>
          </div>
          <button type="button" className="icon-button mail-helper-close-button" onClick={onClose}>
            閉じる
          </button>
        </div>

        <div className="mail-helper-setup">
          <ol className="mail-helper-setup__steps">
            <li>メール本文はアプリ内でプレビューできます。</li>
            <li>HTML helper がない環境では、ブラウザの標準メール作成へ切り替わります。</li>
            <li>独自のローカル helper を使う場合は、別途安全に配布・管理してください。</li>
          </ol>
        </div>
      </section>
    </div>
  );

  return createPortal(dialog, document.body);
}

export function MailDraftDialog({
  isOpen,
  preview,
  canSend,
  disabledReason,
  isSending,
  sendError,
  sendSuccessMessage,
  onClose,
  onSend,
}: MailDraftDialogProps) {
  if (!isOpen) {
    return null;
  }

  const appBackground = document.querySelector<HTMLElement>('.app-background');
  const theme = appBackground?.dataset.theme;
  const templateSummary = `${preview.templateLabel} / ${preview.phaseLabel}`;
  const dialog = (
    <div className="modal-backdrop" data-theme={theme} role="presentation" onClick={onClose}>
      <section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="メール内容確認"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="section-header">
          <div>
            <p className="section-label">mail</p>
            <h2>メール内容確認</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            閉じる
          </button>
        </div>

        <div className="field-stack">
          <span>To</span>
          <input type="text" value={preview.to || '未設定'} readOnly />
        </div>

        <div className="field-stack">
          <span>CC</span>
          <input type="text" value={preview.cc || '未設定'} readOnly />
        </div>

        <div className="field-stack">
          <span>テンプレート</span>
          <input type="text" value={templateSummary} readOnly />
        </div>

        <div className="field-stack">
          <span>件名</span>
          <input type="text" value={preview.subject} readOnly />
        </div>

        <label className="field-stack">
          <span>メール本文プレビュー</span>
          <div className="mail-preview" dangerouslySetInnerHTML={{ __html: preview.htmlBody }} />
        </label>

        {sendError ? <p className="mail-send-status is-error">{sendError}</p> : null}
        {sendSuccessMessage ? <p className="mail-send-status is-success">{sendSuccessMessage}</p> : null}
        {!canSend ? (
          <p className="mail-send-status is-warning">
            {disabledReason || '宛先(To)が未設定です。ヘッダーの「利用者設定」でメール送信先を保存してください。'}
          </p>
        ) : null}

        <div className="header-action-row">
          <button type="button" className="secondary-button" onClick={onClose}>
            戻る
          </button>
          <button type="button" className="primary-button" onClick={onSend} disabled={!canSend || isSending}>
            {isSending ? 'Outlookを開いています...' : 'この内容でOutlookを開く'}
          </button>
        </div>
      </section>
    </div>
  );

  return createPortal(dialog, document.body);
}

interface DailyWorkspaceProps {
  board: InputBoardDraft;
  recentProjectCodes: string[];
  recentTaskNamesByProject: Map<string, string[]>;
  metrics: InputBoardMetrics;
  warnings: InputBoardWarning[];
  readOnly?: boolean;
  compactToolbar?: boolean;
  heroLabel?: string;
  guideEnabled: boolean;
  greetingEnabled: boolean;
  simpleModeEnabled: boolean;
  currentUserId: string;
  currentUserName: string;
  selectedItemKey: string | null;
  currentAuxEntries: AuxTimeEntry[];
  dayStatus: DayInputStatus;
  isCalendarOpen: boolean;
  calendarMonthLabel: string;
  calendarDays: CalendarDayCell[];
  canCopyPreviousDay: boolean;
  canCopyPreviousWeek: boolean;
  canCopyPlanToActual: boolean;
  canSendMail: boolean;
  mailSendDisabledReason?: string | null;
  isMailSending: boolean;
  mailSendError: string | null;
  mailSendSuccessMessage: string | null;
  autoFocusProjectId: string | null;
  draggingProjectId: string | null;
  isQuickProjectDialogOpen: boolean;
  onToggleCalendar: () => void;
  onCloseCalendar: () => void;
  onOpenQuickProjectDialog: () => void;
  onCloseQuickProjectDialog: () => void;
  onShiftCalendarMonth: (deltaMonths: number) => void;
  onSelectDate: (date: string) => void;
  onShiftDate: (deltaDays: number) => void;
  onCopyPreviousDay: () => void;
  onCopyPreviousWeek: () => void;
  onCopyPlanToActual: () => void;
  onModeChange: (mode: EntryMode) => void;
  onSendMail: () => void;
  onAddBlankRow: () => void;
  onAddAux: () => void;
  onQuickAddProject: (project: ProjectCatalogItem) => void;
  onSelectProjectEntry: (entryId: string) => void;
  onSelectAuxEntry: (entryId: string) => void;
  onProjectDragStart: (entryId: string) => void;
  onProjectDrop: (entryId: string) => void;
  onProjectSearchChange: (entryId: string, value: string) => void;
  onProjectSelect: (entryId: string, project: ProjectCatalogItem) => void;
  onChangeProjectTimeInputMode: (entryId: string, nextMode: ProjectTimeInputMode) => void;
  onChangeProjectRange: (entryId: string, field: 'rangeStart' | 'rangeEnd', value: string) => void;
  onChangeTask: (entryId: string, value: string) => void;
  onChangeMinutes: (entryId: string, nextMinutes: number) => void;
  onStepMinutes: (entryId: string, deltaMinutes: number) => void;
  onChangePlace: (entryId: string, place: WorkPlace) => void;
  onChangePlaceDetail: (entryId: string, value: string) => void;
  onChangeNote: (entryId: string, value: string) => void;
  onRemoveProject: (entryId: string) => void;
  onChangeSummaryTime: (field: 'startTime' | 'endTime', value: string) => void;
  onStepSummaryTime: (field: 'startTime' | 'endTime', deltaMinutes: number) => void;
  onChangeAux: (entryId: string, field: 'startTime' | 'endTime' | 'note', value: string) => void;
  onChangeAuxType: (entryId: string, type: AuxEntryType) => void;
  onRemoveAux: (entryId: string) => void;
  onMoveSelectedItem: (delta: 1 | -1) => void;
  onAutoFocusDone: () => void;
}

export function DailyWorkspace({
  board,
  recentProjectCodes,
  recentTaskNamesByProject,
  metrics,
  warnings,
  readOnly = false,
  compactToolbar = false,
  heroLabel,
  guideEnabled,
  greetingEnabled,
  simpleModeEnabled,
  currentUserId,
  currentUserName,
  selectedItemKey,
  currentAuxEntries,
  dayStatus,
  isCalendarOpen,
  calendarMonthLabel,
  calendarDays,
  canCopyPreviousDay,
  canCopyPreviousWeek,
  canCopyPlanToActual,
  canSendMail,
  mailSendDisabledReason,
  isMailSending,
  mailSendError,
  mailSendSuccessMessage,
  autoFocusProjectId,
  draggingProjectId,
  isQuickProjectDialogOpen,
  onToggleCalendar,
  onCloseCalendar,
  onOpenQuickProjectDialog,
  onCloseQuickProjectDialog,
  onShiftCalendarMonth,
  onSelectDate,
  onShiftDate,
  onCopyPreviousDay,
  onCopyPreviousWeek,
  onCopyPlanToActual,
  onModeChange,
  onSendMail,
  onAddBlankRow,
  onAddAux,
  onQuickAddProject,
  onSelectProjectEntry,
  onSelectAuxEntry,
  onProjectDragStart,
  onProjectDrop,
  onProjectSearchChange,
  onProjectSelect,
  onChangeProjectTimeInputMode,
  onChangeProjectRange,
  onChangeTask,
  onChangeMinutes,
  onStepMinutes,
  onChangePlace,
  onChangePlaceDetail,
  onChangeNote,
  onRemoveProject,
  onChangeSummaryTime,
  onStepSummaryTime,
  onChangeAux,
  onChangeAuxType,
  onRemoveAux,
  onMoveSelectedItem,
  onAutoFocusDone,
}: DailyWorkspaceProps) {
  const currentMode = board.currentMode;
  const nextAction = getDailyNextAction(
    board,
    metrics,
    warnings,
    currentMode,
    canSendMail,
    mailSendDisabledReason,
  );
  const selectedProject =
    selectedItemKey?.startsWith('project:')
      ? board.projectEntries.find((entry) => entry.id === selectedItemKey.replace('project:', '')) ?? null
      : null;
  const selectedAux =
    selectedItemKey?.startsWith('aux:')
      ? currentAuxEntries.find((entry) => entry.id === selectedItemKey.replace('aux:', '')) ?? null
      : null;
  const selectedProjectNumber = selectedProject
    ? board.projectEntries.findIndex((entry) => entry.id === selectedProject.id) + 1
    : null;
  const selectedProjectRecentTaskNames = selectedProject
    ? recentTaskNamesByProject.get(normalizeProjectCode(selectedProject.projectCode)) ?? []
    : [];
  const selectedAuxNumber = selectedAux ? currentAuxEntries.findIndex((entry) => entry.id === selectedAux.id) + 1 : null;
  const highlightedStep: DailyGuideStep | null =
    simpleModeEnabled && (nextAction.key === 'summary' || nextAction.key === 'difference')
      ? nextAction.key
      : null;
  const guidedStep: DailyGuideStep | null =
    guideEnabled && (nextAction.key === 'summary' || nextAction.key === 'difference')
      ? nextAction.key
      : null;
  const assistProjectId =
    nextAction.key === 'project' || nextAction.key === 'task'
      ? nextAction.targetProjectId ?? null
      : null;
  const nextActionProjectId =
    simpleModeEnabled ? assistProjectId
      : null;
  const guidedProjectId = guideEnabled ? assistProjectId : null;
  const selectedProjectHighlight =
    selectedProject?.id === nextActionProjectId
      ? nextAction.key === 'project'
        ? 'project'
        : nextAction.key === 'task'
          ? 'task'
          : null
      : null;
  const selectedProjectGuide =
    selectedProject?.id === guidedProjectId
      ? nextAction.key === 'project'
        ? 'project'
        : nextAction.key === 'task'
          ? 'task'
          : null
      : null;
  return (
    <div
      className={[
        simpleModeEnabled ? 'workspace workspace--daily is-simple-mode' : 'workspace workspace--daily',
        readOnly ? 'is-read-only' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-entry-mode={currentMode}
    >
      <DailyToolbar
        date={board.date}
        currentMode={currentMode}
        dayStatus={dayStatus}
        greetingEnabled={greetingEnabled}
        isMailNextAction={simpleModeEnabled && nextAction.key === 'mail'}
        isMailGuided={guideEnabled && nextAction.key === 'mail'}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        isCalendarOpen={isCalendarOpen}
        calendarMonthLabel={calendarMonthLabel}
        calendarDays={calendarDays}
        canCopyPreviousDay={canCopyPreviousDay}
        canCopyPreviousWeek={canCopyPreviousWeek}
        canCopyPlanToActual={canCopyPlanToActual}
        readOnly={readOnly}
        compactLayout={compactToolbar}
        heroLabel={heroLabel}
        onToggleCalendar={onToggleCalendar}
        onCloseCalendar={onCloseCalendar}
        onShiftCalendarMonth={onShiftCalendarMonth}
        onSelectDate={onSelectDate}
        onShiftDate={onShiftDate}
        onCopyPreviousDay={onCopyPreviousDay}
        onCopyPreviousWeek={onCopyPreviousWeek}
        onCopyPlanToActual={onCopyPlanToActual}
        onModeChange={onModeChange}
        onSendMail={onSendMail}
        canSendMail={canSendMail}
        mailSendDisabledReason={mailSendDisabledReason}
        isMailSending={isMailSending}
        mailSendError={mailSendError}
        mailSendSuccessMessage={mailSendSuccessMessage}
      />

      {simpleModeEnabled && !readOnly ? <SimpleModeNextActionStrip action={nextAction} /> : null}

      <SummaryStrip
        board={board}
        metrics={metrics}
        warnings={warnings}
        currentMode={currentMode}
        readOnly={readOnly}
        onTimeChange={onChangeSummaryTime}
        onTimeStep={onStepSummaryTime}
        highlightedStep={highlightedStep}
        guidedStep={guidedStep}
      />

      <div className="board-layout">
        <section className="board-list-shell">
          <div className="section-header">
            <div>
              <p className="section-label">daily board</p>
              <h2 className="board-list-title">入力ボード</h2>
            </div>
            {!readOnly ? (
              <div className="header-action-row">
              <button type="button" className="ghost-button" onClick={onOpenQuickProjectDialog}>
                よく使うPJ
              </button>
              <button type="button" className="secondary-button" onClick={onAddAux}>
                年休／分断を追加
              </button>
              <button type="button" className="primary-button" onClick={onAddBlankRow}>
                行を追加
              </button>
              </div>
            ) : null}
          </div>

          <div className="detail-list">
            <div className="detail-section-label">PJ行</div>
            <div className="list-grid-head" aria-hidden="true">
              <span>#</span>
              <span>PJ</span>
              <span>タスク</span>
              <span>場所</span>
              <span>時間</span>
              <span>確認</span>
            </div>
            {board.projectEntries.map((entry, index) => (
              <SelectableProjectRow
                key={entry.id}
                rowNumber={index + 1}
                entry={entry}
                currentMode={currentMode}
                readOnly={readOnly}
                isSelected={selectedProject?.id === entry.id}
                isDragging={draggingProjectId === entry.id}
                isNextStep={nextActionProjectId === entry.id}
                isGuided={guidedProjectId === entry.id}
                onDragStart={() => onProjectDragStart(entry.id)}
                onDrop={() => onProjectDrop(entry.id)}
                onSelect={() => onSelectProjectEntry(entry.id)}
                onMoveSelection={onMoveSelectedItem}
              />
            ))}

              <div className="detail-section-label">年休／分断</div>
              {currentAuxEntries.map((entry) => (
                <SelectableAuxRow
                  key={entry.id}
                entry={entry}
                lunchMinutes={board.lunchMinutes}
                isSelected={selectedAux?.id === entry.id}
                onSelect={() => onSelectAuxEntry(entry.id)}
                onMoveSelection={onMoveSelectedItem}
              />
            ))}
          </div>
        </section>

        <aside className="detail-pane-shell">
          {selectedProject && (
            <ProjectDetailPane
              entry={selectedProject}
              detailNumber={selectedProjectNumber ?? 1}
              board={board}
              recentProjectCodes={recentProjectCodes}
              recentTaskNames={selectedProjectRecentTaskNames}
              currentMode={currentMode}
              autoFocus={autoFocusProjectId === selectedProject.id}
              highlightedField={selectedProjectHighlight}
              guidedField={selectedProjectGuide}
              readOnly={readOnly}
              onAutoFocusDone={onAutoFocusDone}
              onProjectSearchChange={onProjectSearchChange}
              onProjectSelect={onProjectSelect}
              onChangeTimeInputMode={onChangeProjectTimeInputMode}
              onChangeRange={onChangeProjectRange}
              onChangeTask={onChangeTask}
              onChangeMinutes={onChangeMinutes}
              onStepMinutes={onStepMinutes}
              onChangePlace={onChangePlace}
              onChangePlaceDetail={onChangePlaceDetail}
              onChangeNote={onChangeNote}
              onRemoveProject={onRemoveProject}
            />
          )}

          {selectedAux && (
            <AuxDetailPane
              entry={selectedAux}
              detailNumber={selectedAuxNumber ?? 1}
              lunchMinutes={board.lunchMinutes}
              readOnly={readOnly}
              onChangeAux={onChangeAux}
              onChangeAuxType={onChangeAuxType}
              onRemoveAux={onRemoveAux}
            />
          )}

          {!selectedProject && !selectedAux && (
            <div className="detail-pane__empty">左の行を選ぶと、ここで明細編集できます。</div>
          )}
        </aside>
      </div>

      {!readOnly ? (
        <QuickProjectDialog
          isOpen={isQuickProjectDialogOpen}
          catalog={board.projectCatalog}
          recentProjectCodes={recentProjectCodes}
          onQuickAddProject={onQuickAddProject}
          onClose={onCloseQuickProjectDialog}
        />
      ) : null}
    </div>
  );
}

function SimpleModeNextActionStrip({ action }: { action: DailyNextAction }) {
  const className = [
    'simple-mode-next-step',
    action.tone === 'caution' ? 'is-caution' : '',
    action.tone === 'safe' ? 'is-safe' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section className={className}>
      <span className="simple-mode-next-step__label">Next Action</span>
      <strong className="simple-mode-next-step__value">{action.label}</strong>
    </section>
  );
}

interface MonthlySummaryViewProps {
  summary: MonthlySummary;
  monthAnchorDate: string;
  onShiftMonth: (deltaMonths: number) => void;
  onOpenDate: (date: string) => void;
  onChangeProjectBudget: (projectCode: string, nextBudgetMinutes: number) => void;
  onOpenDayList: (projectCode?: string | null) => void;
  onOpenProjectMaster: () => void;
  readOnly?: boolean;
  monthlyNavigationEnabled?: boolean;
}

export function MonthlySummaryView({
  summary,
  monthAnchorDate,
  onShiftMonth,
  onOpenDate,
  onChangeProjectBudget,
  onOpenDayList,
  onOpenProjectMaster,
  readOnly = false,
  monthlyNavigationEnabled = true,
}: MonthlySummaryViewProps) {
  const [sortKey, setSortKey] = useState<MonthlyProjectSort>('budget');
  const [categoryFilter, setCategoryFilter] = useState<MonthlyProjectCategoryFilter>('all');
  const [selectedProjectCode, setSelectedProjectCode] = useState<string | null>(null);
  const visibleProjects = summary.projects
    .filter(
      (project) =>
        (project.budgetMinutes > 0 || project.actualMinutes > 0 || project.landingMinutes > 0) &&
        (categoryFilter === 'all' ||
          (categoryFilter === 'unset'
            ? project.budgetMinutes <= 0
            : project.category === categoryFilter)),
    )
    .sort((left, right) => {
      if (sortKey === 'code') {
        return left.projectCode.localeCompare(right.projectCode, 'ja');
      }

      if (sortKey === 'budget') {
        if (left.budgetMinutes !== right.budgetMinutes) {
          return right.budgetMinutes - left.budgetMinutes;
        }
      }

      if (sortKey === 'progress') {
        const leftRate = left.progressRate ?? -1;
        const rightRate = right.progressRate ?? -1;

        if (leftRate !== rightRate) {
          return rightRate - leftRate;
        }
      }

      if (Math.abs(left.differenceMinutes) !== Math.abs(right.differenceMinutes)) {
        return Math.abs(right.differenceMinutes) - Math.abs(left.differenceMinutes);
      }

      return left.projectCode.localeCompare(right.projectCode, 'ja');
    });

  useEffect(() => {
    setSelectedProjectCode(null);
  }, [monthAnchorDate]);

  useEffect(() => {
    if (visibleProjects.length === 0) {
      if (selectedProjectCode !== null) {
        setSelectedProjectCode(null);
      }
      return;
    }

    const hasSelectedProject = selectedProjectCode
      ? visibleProjects.some((project) => project.projectCode === selectedProjectCode)
      : false;

    if (!hasSelectedProject) {
      const firstUnsetProject = visibleProjects.find((project) => project.budgetMinutes <= 0);
      setSelectedProjectCode((firstUnsetProject ?? visibleProjects[0]).projectCode);
    }
  }, [selectedProjectCode, visibleProjects]);

  const selectedProject =
    (selectedProjectCode
      ? visibleProjects.find((project) => project.projectCode === selectedProjectCode)
      : null) ??
    visibleProjects[0] ??
    null;
  const budgetDifferenceMinutes = summary.landingTotalMinutes - summary.budgetTotalMinutes;
  const budgetProjectsCount = summary.projects.filter((project) => project.budgetMinutes > 0).length;
  const budgetOverview = buildHourMinuteDisplay(summary.budgetTotalMinutes);
  const actualOverview = buildHourMinuteDisplay(summary.actualTotalMinutes);
  const forecastOverview = buildHourMinuteDisplay(summary.landingTotalMinutes);
  const futureOverview = buildHourMinuteDisplay(summary.futureEstimateMinutes);
  const overtimeOverview = buildHourMinuteDisplay(summary.overtimeMinutes);
  const differenceOverview = buildHourMinuteDisplay(budgetDifferenceMinutes, true);
  const differenceTone: SummaryTone =
    budgetDifferenceMinutes > 0 ? 'danger' : budgetDifferenceMinutes === 0 ? 'neutral' : 'info';
  const projectsWithoutBudgetCount = summary.projects.filter(
    (project) => project.budgetMinutes <= 0 && project.landingMinutes > 0,
  ).length;
  const differenceDetail =
    budgetDifferenceMinutes > 0
      ? '計画より多め'
      : budgetDifferenceMinutes === 0
        ? '計画どおり'
        : '計画内';
  const warningChips = [
    projectsWithoutBudgetCount > 0
      ? { key: 'unset-budget', label: `計画未設定 ${projectsWithoutBudgetCount}PJ`, tone: 'warning' as const }
      : null,
    summary.attentionDays > 0
      ? { key: 'attention-days', label: `差分あり ${summary.attentionDays}日`, tone: 'warning' as const }
      : null,
    summary.emptyDays > 0 ? { key: 'empty-days', label: `未入力 ${summary.emptyDays}日`, tone: 'danger' as const } : null,
  ].filter((item): item is { key: string; label: string; tone: 'warning' | 'danger' } => Boolean(item));

  return (
    <div className="workspace workspace--monthly">
      <section className="monthly-shell monthly-shell--analytics">
        <div className="section-header">
          <div>
            <p className="section-label">monthly view</p>
            <h2>月集計</h2>
            <p>{summary.monthLabel}</p>
          </div>
          <div className="header-action-row">
            <button type="button" className="secondary-button" onClick={() => onOpenDayList(null)}>
              日一覧を開く
            </button>
            {monthlyNavigationEnabled ? (
              <>
                <button type="button" className="ghost-button" onClick={() => onShiftMonth(-1)}>
                  前月
                </button>
                <button type="button" className="ghost-button" onClick={() => onShiftMonth(1)}>
                  翌月
                </button>
              </>
            ) : null}
          </div>
        </div>

        {warningChips.length > 0 && (
          <div className="monthly-warning-row" aria-label="月集計の注意項目">
            {warningChips.map((item) => (
              <span
                key={item.key}
                className={item.tone === 'danger' ? 'monthly-inline-chip is-danger' : 'monthly-inline-chip is-warning'}
              >
                {item.label}
              </span>
            ))}
          </div>
        )}

        <div className="monthly-cards">
          <MonthlyOverviewCard
            label="計画合計"
            value={budgetOverview.hoursLabel}
            minutesLabel={budgetOverview.minutesLabel}
            detail="月の計画基準"
            metaItems={[
              { label: '計画設定PJ', value: `${budgetProjectsCount}件` },
              { label: '対象日', value: `${summary.days.length}日` },
            ]}
          />
          <MonthlyOverviewCard
            label="実績合計"
            value={actualOverview.hoursLabel}
            minutesLabel={actualOverview.minutesLabel}
            detail="確定した実績"
            tone="neutral"
            metaItems={[
              { label: '完了', value: `${summary.completedDays}日` },
              { label: '要確認', value: `${summary.attentionDays}日` },
            ]}
          />
          <MonthlyOverviewCard
            label="着地見込み"
            value={forecastOverview.hoursLabel}
            minutesLabel={forecastOverview.minutesLabel}
            detail="月末の着地見込み"
            tone="info"
            metaItems={[
              { label: '未来日予定', value: `${futureOverview.hoursLabel}${futureOverview.minutesLabel}` },
              { label: 'FT清算時間', value: `${overtimeOverview.hoursLabel}${overtimeOverview.minutesLabel}` },
            ]}
          />
          <MonthlyOverviewCard
            label="着地差分"
            value={differenceOverview.hoursLabel}
            minutesLabel={differenceOverview.minutesLabel}
            detail={differenceDetail}
            tone={differenceTone}
            metaItems={[
              { label: '計画', value: `${budgetOverview.hoursLabel}${budgetOverview.minutesLabel}` },
              { label: '見込み', value: `${forecastOverview.hoursLabel}${forecastOverview.minutesLabel}` },
            ]}
          />
        </div>

        <div className="monthly-analysis-grid">
          <MonthlyBudgetWorkspace
            projects={visibleProjects}
            sortKey={sortKey}
            categoryFilter={categoryFilter}
            selectedProjectCode={selectedProject?.projectCode ?? null}
            onSortChange={setSortKey}
            onCategoryFilterChange={setCategoryFilter}
            onSelectProject={setSelectedProjectCode}
            onOpenDayList={onOpenDayList}
            readOnly={readOnly}
          />
          <MonthlyPlanningAside
            project={selectedProject}
            summary={summary}
            onChangeProjectBudget={onChangeProjectBudget}
            onOpenDayList={onOpenDayList}
            onOpenProjectMaster={onOpenProjectMaster}
            readOnly={readOnly}
          />
        </div>
      </section>
    </div>
  );
}

function isWeekendDate(date: string) {
  const day = new Date(`${date}T00:00:00`).getDay();
  return day === 0 || day === 6;
}

function getDayStatusLabel(day: MonthlySummary['days'][number]) {
  if (day.annualLeaveType === 'annual-day') {
    return '年休';
  }

  if (day.annualLeaveType === 'annual-am' || day.annualLeaveType === 'annual-pm') {
    return getAuxTypeLabel(day.annualLeaveType);
  }

  if (day.status === 'empty' && day.dayOffLabel) {
    return day.dayOffLabel;
  }

  if (day.isFuture) {
    return '未来日';
  }

  if (day.status === 'empty') {
    return '未入力';
  }

  return day.needsAttention ? '差分あり' : '入力済み';
}

function getCalendarStatusLabel(day: CalendarDayCell) {
  if (day.status === 'empty' && day.dayOffLabel) {
    return day.dayOffLabel === '祝' ? '祝日' : '休日';
  }

  return statusLabels[day.status];
}

function getCalendarStatusMark(day: CalendarDayCell) {
  if (day.status === 'empty' && day.dayOffLabel) {
    return day.dayOffLabel;
  }

  return calendarStatusMarks[day.status];
}

function getCalendarStatusVariant(day: CalendarDayCell) {
  if (day.status === 'empty' && day.dayOffLabel === '祝') {
    return 'holiday';
  }

  if (day.status === 'empty' && day.dayOffLabel === '休') {
    return 'day-off';
  }

  return day.status;
}

function getDayStatusVariant(day: MonthlySummary['days'][number]) {
  if (day.annualLeaveType) {
    return 'leave';
  }

  if (day.status === 'empty' && day.dayOffLabel === '祝') {
    return 'holiday';
  }

  if (day.status === 'empty' && day.dayOffLabel === '休') {
    return 'day-off';
  }

  if (day.isFuture) {
    return 'future';
  }

  if (day.status === 'empty') {
    return 'empty';
  }

  return day.needsAttention ? 'partial' : 'done';
}

function formatDayWorkLabel(day: MonthlySummary['days'][number]) {
  if (day.annualLeaveType === 'annual-day') {
    return '-';
  }

  const hasWorkTime = day.workStartTime !== '' || day.workEndTime !== '';
  const workLabel = hasWorkTime ? `${day.workStartTime || '--:--'}-${day.workEndTime || '--:--'}` : '';
  const splitLabel = day.splitMinutes > 0 ? `分断 ${formatHoursDecimal(day.splitMinutes)}` : '';

  return [workLabel, splitLabel].filter(Boolean).join(' / ') || '-';
}

function formatDayWorkplaceLabel(day: MonthlySummary['days'][number]) {
  if (day.annualLeaveType === 'annual-day') {
    return '-';
  }

  return day.workplaceLabel === '未設定' ? '-' : day.workplaceLabel;
}

function formatDayRuntimeLabel(day: MonthlySummary['days'][number]) {
  if (day.annualLeaveType === 'annual-day') {
    return '-';
  }

  const runtimeMinutes = day.isFuture ? day.planWorkTargetMinutes : day.actualWorkTargetMinutes;
  return runtimeMinutes === null ? '-' : formatHoursDecimal(runtimeMinutes);
}

function formatDayProjectHoursLabel(
  day: MonthlySummary['days'][number],
  displayAllocationMinutes: number,
  selectedProject: MonthlySummary['projects'][number] | null,
  isProjectScoped: boolean,
) {
  const totalAllocationMinutes = day.isFuture ? day.planAllocationMinutes : day.actualAllocationMinutes;
  if (selectedProject && isProjectScoped) {
    return `${formatHoursDecimal(displayAllocationMinutes)} / 全体 ${formatHoursDecimal(totalAllocationMinutes)}`;
  }

  return formatHoursDecimal(displayAllocationMinutes);
}

function filterMonthlyDays(days: MonthlySummary['days'], filter: MonthlyDayFilter, weekdaysOnly: boolean) {
  return days.filter((day) => {
    if (weekdaysOnly && (isWeekendDate(day.date) || day.isHoliday)) {
      return false;
    }

    switch (filter) {
      case 'difference':
        return !day.isFuture && day.needsAttention;
      case 'empty':
        return !day.isFuture && day.status === 'empty';
      case 'future':
        return day.isFuture;
      default:
        return true;
    }
  });
}

function buildMonthlyDayFilterCounts(days: MonthlySummary['days'], weekdaysOnly: boolean) {
  return {
    all: filterMonthlyDays(days, 'all', weekdaysOnly).length,
    difference: filterMonthlyDays(days, 'difference', weekdaysOnly).length,
    empty: filterMonthlyDays(days, 'empty', weekdaysOnly).length,
    future: filterMonthlyDays(days, 'future', weekdaysOnly).length,
  } satisfies Record<MonthlyDayFilter, number>;
}

function countMonthlyDaysForOverview(days: MonthlySummary['days']) {
  return days.reduce(
    (counts, day) => {
      if (day.isFuture) {
        counts.future += 1;
        return counts;
      }

      if (day.needsAttention) {
        counts.attention += 1;
      } else if (day.status === 'done') {
        counts.done += 1;
      } else if (day.status === 'empty') {
        counts.empty += 1;
      } else {
        counts.attention += 1;
      }

      return counts;
    },
    { done: 0, attention: 0, empty: 0, future: 0 },
  );
}

interface MonthlyDayTableProps {
  days: MonthlySummary['days'];
  onOpenDate: (date: string) => void;
  selectedProject?: MonthlySummary['projects'][number] | null;
  isProjectScoped?: boolean;
}

function MonthlyDayTable({ days, onOpenDate, selectedProject = null, isProjectScoped = false }: MonthlyDayTableProps) {
  return (
    <div className="day-list-table">
      <div className="day-list-head" aria-hidden="true">
        <span>日付</span>
        <span>状態</span>
        <span>勤務</span>
        <span>場所</span>
        <span>稼働時間</span>
        <span>{selectedProject && isProjectScoped ? 'このPJ' : 'PJ時間'}</span>
        <span>差分</span>
        <span>確認</span>
      </div>
      {days.length === 0 && <div className="detail-pane__empty">この条件で表示できる日はありません。</div>}

      {days.map((day) => {
        const differenceState = buildDifferenceState(day.differenceMinutes);
        const dayStateLabel = getDayStatusLabel(day);
        const dayStateClass = `is-${getDayStatusVariant(day)}`;
        const projectMinutes = selectedProject ? day.projectMinutesByCode[selectedProject.projectCode] : null;
        const displayAllocationMinutes = selectedProject && isProjectScoped
          ? day.isFuture
            ? projectMinutes?.planMinutes ?? 0
            : projectMinutes?.actualMinutes ?? 0
          : day.isFuture
            ? day.planAllocationMinutes
            : day.actualAllocationMinutes;

        return (
          <button
            key={day.date}
            type="button"
            className={day.isHoliday || isWeekendDate(day.date) ? 'day-list-row is-day-off' : 'day-list-row'}
            onClick={() => onOpenDate(day.date)}
          >
            <div className="day-list-row__date">
              <strong>{formatDateLabel(day.date)}</strong>
              {day.holidayName ? <small>{day.holidayName}</small> : null}
            </div>
            <span className={`status-pill ${dayStateClass}`}>{dayStateLabel}</span>
            <span>{formatDayWorkLabel(day)}</span>
            <span>{formatDayWorkplaceLabel(day)}</span>
            <span>{formatDayRuntimeLabel(day)}</span>
            <span>{formatDayProjectHoursLabel(day, displayAllocationMinutes, selectedProject, isProjectScoped)}</span>
            <strong className="day-list-row__difference">{differenceState.label}</strong>
            <div className="day-list-row__warning">
              {day.warningCount > 0 && !day.isFuture ? (
                <span className="row-badge">{`${day.warningCount}件`}</span>
              ) : (
                <span className="day-list-row__dash">-</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

interface MonthlyDayListViewProps {
  summary: MonthlySummary;
  selectedProject: MonthlySummary['projects'][number] | null;
  onShiftMonth: (deltaMonths: number) => void;
  onOpenDate: (date: string) => void;
  onOpenMonthly: () => void;
  onClearProjectScope: () => void;
  readOnly?: boolean;
  monthlyNavigationEnabled?: boolean;
  backLabel?: string;
}

function filterDaysByProject(
  days: MonthlySummary['days'],
  selectedProject: MonthlySummary['projects'][number] | null,
) {
  if (!selectedProject) {
    return days;
  }

  return days.filter((day) => {
    const projectMinutes = day.projectMinutesByCode[selectedProject.projectCode];
    return (projectMinutes?.actualMinutes ?? 0) > 0 || (projectMinutes?.planMinutes ?? 0) > 0 || (projectMinutes?.landingMinutes ?? 0) > 0;
  });
}

export function MonthlyDayListView({
  summary,
  selectedProject,
  onShiftMonth,
  onOpenDate,
  onOpenMonthly,
  onClearProjectScope,
  readOnly = false,
  monthlyNavigationEnabled = true,
  backLabel = '月集計へ戻る',
}: MonthlyDayListViewProps) {
  const [filter, setFilter] = useState<MonthlyDayFilter>('all');
  const [weekdaysOnly, setWeekdaysOnly] = useState(false);
  const dayFilterItems = Object.keys(monthlyFilterLabels) as MonthlyDayFilter[];
  const dayFilterButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const scopedDays = filterDaysByProject(summary.days, selectedProject);
  const filterCounts = buildMonthlyDayFilterCounts(scopedDays, weekdaysOnly);
  const filteredDays = filterMonthlyDays(scopedDays, filter, weekdaysOnly);
  const dayOverviewCounts = countMonthlyDaysForOverview(scopedDays);

  function handleDayFilterKeyDown(index: number, event: ReactKeyboardEvent<HTMLButtonElement>) {
    const nextIndex = getNextSegmentIndex(index, dayFilterItems.length, event);
    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    const nextFilter = dayFilterItems[nextIndex];
    setFilter(nextFilter);
    dayFilterButtonRefs.current[nextIndex]?.focus();
  }

  return (
    <div className="workspace workspace--day-list">
      <section className="monthly-shell monthly-shell--day-list">
        <div className="section-header">
          <div>
            <p className="section-label">days</p>
            <h2>日一覧</h2>
            <p>
              {selectedProject
                ? `${selectedProject.projectCode} ${selectedProject.projectName} の入力日`
                : summary.monthLabel}
            </p>
          </div>
          <div className="header-action-row">
            <button type="button" className="ghost-button" onClick={onOpenMonthly}>
              {backLabel}
            </button>
            {selectedProject && !readOnly && (
              <button type="button" className="secondary-button" onClick={onClearProjectScope}>
                月全体に戻る
              </button>
            )}
            {monthlyNavigationEnabled ? (
              <>
                <button type="button" className="ghost-button" onClick={() => onShiftMonth(-1)}>
                  前月
                </button>
                <button type="button" className="ghost-button" onClick={() => onShiftMonth(1)}>
                  翌月
                </button>
              </>
            ) : null}
          </div>
        </div>

        {selectedProject && (
          <div className="day-list-scope-banner">
            <strong>{selectedProject.projectCode}</strong>
            <span>このPJが入っている日だけを表示しています。</span>
          </div>
        )}

        <div className="monthly-cards monthly-cards--compact">
            <MonthlyOverviewCard
              label="入力済み"
              value={`${dayOverviewCounts.done}日`}
              detail="見直しまで済んだ日"
              tone="neutral"
            />
            <MonthlyOverviewCard
              label="差分あり"
              value={`${dayOverviewCounts.attention}日`}
              detail="差分や警告が残る日"
              tone={dayOverviewCounts.attention > 0 ? 'caution' : 'info'}
            />
            <MonthlyOverviewCard
              label="未入力"
              value={`${dayOverviewCounts.empty}日`}
              detail="まだ着手していない日"
              tone={dayOverviewCounts.empty > 0 ? 'danger' : 'info'}
            />
            <MonthlyOverviewCard
              label="未来日予定"
              value={`${dayOverviewCounts.future}日`}
              detail="見込みに使う未来日"
              tone={dayOverviewCounts.future > 0 ? 'info' : 'neutral'}
            />
        </div>

        <div className="monthly-filter-row" role="tablist" aria-label="日別一覧フィルタ">
          {dayFilterItems.map((item, index) => (
            <button
              key={item}
              type="button"
              ref={(node) => {
                dayFilterButtonRefs.current[index] = node;
              }}
              role="tab"
              aria-selected={filter === item}
              tabIndex={filter === item ? 0 : -1}
              className={filter === item ? 'monthly-filter-chip is-active' : 'monthly-filter-chip'}
              onClick={() => setFilter(item)}
              onKeyDown={(event) => handleDayFilterKeyDown(index, event)}
            >
              <span>{monthlyFilterLabels[item]}</span>
              <strong>{filterCounts[item]}</strong>
            </button>
          ))}
          <button
            type="button"
            className={weekdaysOnly ? 'monthly-filter-chip is-active' : 'monthly-filter-chip'}
            onClick={() => setWeekdaysOnly((prev) => !prev)}
          >
            <span>平日のみ</span>
          </button>
        </div>

        <section className="monthly-section">
          <div className="section-header monthly-section__header">
            <div>
              <p className="section-label">days</p>
              <h3>{selectedProject ? 'このPJの日別' : '日別'}</h3>
            </div>
            <span className="monthly-project-count">{filteredDays.length} 日</span>
          </div>

          <MonthlyDayTable
            days={filteredDays}
            onOpenDate={onOpenDate}
            selectedProject={selectedProject}
            isProjectScoped={Boolean(selectedProject)}
          />
        </section>
      </section>
    </div>
  );
}

function MonthlyBudgetChart({ projects }: { projects: MonthlySummary['projects'] }) {
  const visibleProjects = projects
    .filter((project) => project.budgetMinutes > 0 || project.actualMinutes > 0 || project.landingMinutes > 0)
    .sort((left, right) => {
      const leftRatio = left.budgetMinutes > 0 ? left.landingMinutes / left.budgetMinutes : 0;
      const rightRatio = right.budgetMinutes > 0 ? right.landingMinutes / right.budgetMinutes : 0;

      if (leftRatio !== rightRatio) {
        return rightRatio - leftRatio;
      }

      return Math.abs(right.differenceMinutes) - Math.abs(left.differenceMinutes);
    });

  return (
    <section className="monthly-section">
      <div className="section-header monthly-section__header">
        <div>
          <p className="section-label">forecast</p>
          <h3>着地見込み</h3>
        </div>
        <span className="monthly-project-count">{projects.length} PJ</span>
      </div>

      <div className="chart-note">
        <span>1本のバー全体を今月の計画100%として見ます。緑が実績、黄が着地見込みです。右端との差分で余りや超過を見ます。</span>
      </div>

      <div className="monthly-project-list">
        {visibleProjects.length === 0 && (
          <div className="detail-pane__empty">PJ配賦が入ると、ここに月集計が出ます。</div>
        )}

        {visibleProjects.map((project) => (
          <ProjectProgressRow key={project.projectCode} project={project} />
        ))}
      </div>
      </section>
  );
}


function buildMonthlyAllocationSegments(
  projects: MonthlySummary['projects'],
  minutesSelector: (project: MonthlySummary['projects'][number]) => number,
) {
  const palette = ['#1f7f72', '#ef8d73', '#d6a24a', '#84af86', '#d47b8f', '#93a879'];
  const sourceProjects = projects
    .map((project) => ({
      project,
      minutes: minutesSelector(project),
    }))
    .filter((entry) => entry.minutes > 0)
    .sort((left, right) => right.minutes - left.minutes);
  const coreProjects = sourceProjects.slice(0, 5);
  const otherMinutes = sourceProjects.slice(5).reduce((total, entry) => total + entry.minutes, 0);
  const segments = coreProjects.map((entry, index) => ({
    key: entry.project.projectCode,
    label: entry.project.projectCode === 'UNASSIGNED' ? 'PJ未選択' : entry.project.projectCode,
    detail: entry.project.projectName,
    minutes: entry.minutes,
    color: palette[index % palette.length],
  }));

  if (otherMinutes > 0) {
    segments.push({
      key: 'other',
      label: 'その他',
      detail: `${sourceProjects.length - coreProjects.length} PJ`,
      minutes: otherMinutes,
      color: palette[coreProjects.length % palette.length],
    });
  }

  return segments;
}

function MonthlyAllocationPieChart({
  title,
  note,
  projects,
  totalMinutes,
  selectedProjectCode,
  minutesSelector,
  emptyMessage,
}: {
  title: string;
  note: string;
  projects: MonthlySummary['projects'];
  totalMinutes: number;
  selectedProjectCode?: string | null;
  minutesSelector: (project: MonthlySummary['projects'][number]) => number;
  emptyMessage: string;
}) {
  const segments = buildMonthlyAllocationSegments(projects, minutesSelector);

  let progress = 0;
  const gradientStops = segments.map((segment) => {
    const start = progress;
    const ratio = totalMinutes > 0 ? segment.minutes / totalMinutes : 0;
    progress += ratio * 100;
    return `${segment.color} ${start}% ${progress}%`;
  });
  const pieStyle =
    gradientStops.length > 0
      ? { background: `conic-gradient(${gradientStops.join(', ')})` }
      : undefined;

  return (
    <section className="monthly-section monthly-section--compact monthly-allocation-card">
      <div className="section-header monthly-section__header">
        <div>
          <p className="section-label">breakdown</p>
          <h3>{title}</h3>
          <p className="monthly-allocation-card__note">{note}</p>
        </div>
      </div>

      {segments.length === 0 ? (
        <div className="detail-pane__empty">{emptyMessage}</div>
      ) : (
        <div className="pie-chart-layout">
          <div className="pie-chart-card">
            <div className="pie-chart-ring" style={pieStyle}>
              <div className="pie-chart-ring__hole">
                <span>合計</span>
                <strong>{formatHoursDecimal(totalMinutes)}</strong>
              </div>
            </div>
          </div>

          <div className="pie-chart-legend">
            {segments.map((segment) => {
              const share = totalMinutes > 0 ? Math.round((segment.minutes / totalMinutes) * 100) : 0;

              return (
                <div
                  key={segment.key}
                  className={
                    selectedProjectCode === segment.key
                      ? 'pie-chart-legend__item is-active'
                      : 'pie-chart-legend__item'
                  }
                >
                  <span className="pie-chart-legend__swatch" style={{ backgroundColor: segment.color }} />
                  <div className="pie-chart-legend__text">
                    <strong>{segment.label}</strong>
                    <span>{segment.detail}</span>
                  </div>
                  <div className="pie-chart-legend__meta">
                    <strong>{formatHoursDecimal(segment.minutes)}</strong>
                    <span>{share}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function ProjectProgressRow({ project }: { project: MonthlySummary['projects'][number] }) {
  const referenceMinutes = Math.max(project.budgetMinutes, project.actualMinutes, project.landingMinutes, 60);
  const actualWidth = clampPercentage((project.actualMinutes / referenceMinutes) * 100);
  const landingWidth = clampPercentage((project.landingMinutes / referenceMinutes) * 100);
  const budgetLine = project.budgetMinutes > 0 ? clampPercentage((project.budgetMinutes / referenceMinutes) * 100) : null;
  const differenceLabel =
    project.budgetMinutes <= 0
      ? '計画未設定'
      : project.differenceMinutes > 0
        ? `計画超過 ${formatSignedHoursDecimal(project.differenceMinutes)}`
        : project.differenceMinutes === 0
          ? 'ぴったり'
          : `残り ${formatHoursDecimal(Math.abs(project.differenceMinutes))}`;
  const differenceTone =
    project.budgetMinutes <= 0
      ? 'is-neutral'
      : project.differenceMinutes > 0
        ? 'is-danger'
        : project.differenceMinutes === 0
          ? 'is-caution'
          : 'is-safe';
  const futurePortion = Math.max(0, project.landingMinutes - project.actualMinutes);

  return (
    <div className="monthly-project-row">
      <div className="monthly-project-row__top">
        <div className="monthly-project-row__main">
          <strong>
            {project.projectCode === 'UNASSIGNED'
              ? 'PJ未選択'
              : `${project.projectCode} ${project.projectName}`}
          </strong>
        </div>
        <div className="monthly-project-row__badges">
          <span className={`project-status-chip ${differenceTone}`}>{differenceLabel}</span>
          <span className="row-badge">進捗率 {formatRateLabel(project.progressRate)}</span>
        </div>
      </div>

      <div className="project-progress">
        <div className="project-progress__bar">
          <div className="project-progress__track" />
          {budgetLine !== null && <div className="project-progress__budget-line" style={{ left: `${budgetLine}%` }} />}
          <div className="project-progress__fill is-landing" style={{ width: `${landingWidth}%` }} />
          <div className="project-progress__fill is-actual" style={{ width: `${actualWidth}%` }} />
        </div>
        <div className="project-progress__legend">
          <span>実績 {formatHoursDecimal(project.actualMinutes)}</span>
          <span>見込み {formatHoursDecimal(project.landingMinutes)}</span>
          <span>計画 {project.budgetMinutes > 0 ? formatHoursDecimal(project.budgetMinutes) : '未設定'}</span>
        </div>
      </div>

      <div className="monthly-project-row__stats">
        <span>{project.category ? categoryLabels[project.category] : '未分類'}</span>
        <span>今後予定分 {formatHoursDecimal(futurePortion)}</span>
        <span>{project.activeDays}日</span>
        <strong>{formatSignedHoursDecimal(project.differenceMinutes)}</strong>
      </div>
    </div>
  );
}

interface MonthlyBudgetWorkspaceProps {
  projects: MonthlySummary['projects'];
  sortKey: MonthlyProjectSort;
  categoryFilter: MonthlyProjectCategoryFilter;
  selectedProjectCode: string | null;
  onSortChange: (sortKey: MonthlyProjectSort) => void;
  onCategoryFilterChange: (filter: MonthlyProjectCategoryFilter) => void;
  onSelectProject: (projectCode: string) => void;
  onOpenDayList: (projectCode?: string | null) => void;
  readOnly?: boolean;
}

function MonthlyBudgetWorkspace({
  projects,
  sortKey,
  categoryFilter,
  selectedProjectCode,
  onSortChange,
  onCategoryFilterChange,
  onSelectProject,
  onOpenDayList,
  readOnly = false,
}: MonthlyBudgetWorkspaceProps) {
  const categoryItems = Object.keys(monthlyProjectCategoryLabels) as MonthlyProjectCategoryFilter[];
  const categoryButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const projectRowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const categoryCounts: Record<MonthlyProjectCategoryFilter, number> = {
    all: projects.length,
    direct: projects.filter((project) => project.category === 'direct').length,
    indirect: projects.filter((project) => project.category === 'indirect').length,
    unset: projects.filter((project) => project.budgetMinutes <= 0).length,
  };

  function handleCategoryKeyDown(index: number, event: ReactKeyboardEvent<HTMLButtonElement>) {
    const nextIndex = getNextSegmentIndex(index, categoryItems.length, event);
    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    const nextCategory = categoryItems[nextIndex];
    onCategoryFilterChange(nextCategory);
    categoryButtonRefs.current[nextIndex]?.focus();
  }

  function handleProjectRowKeyDown(index: number, event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const currentProject = projects[index];
      if (currentProject) {
        onSelectProject(currentProject.projectCode);
      }
      return;
    }

    const nextIndex = getNextListIndex(index, projects.length, event);
    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    const nextProject = projects[nextIndex];
    if (!nextProject) {
      return;
    }

    onSelectProject(nextProject.projectCode);
    projectRowRefs.current[nextIndex]?.focus();
  }

  return (
    <section className="monthly-section monthly-section--hero">
      <div className="section-header monthly-section__header">
        <div>
          <p className="section-label">projects</p>
          <h3>PJ別サマリ</h3>
          <p>
            {readOnly
              ? 'ここでは保存済みの月実績と見込みを見比べます。右側では計画と配賦構成を照会できます。'
              : 'ここでは月の実績と見込みを見比べます。計画値の編集対象は右側の今月の計画です。'}
          </p>
        </div>
        <span className="monthly-project-count">{projects.length} PJ</span>
      </div>

      <div className="monthly-chart-toolbar monthly-chart-toolbar--sticky">
        <div className="monthly-chart-toolbar__intro">
          <span className="monthly-chart-toolbar__eyebrow">操作</span>
          <strong>並び替えと絞り込み</strong>
        </div>
        <label className="field-stack monthly-chart-toolbar__sort">
          <span>並び順</span>
          <select value={sortKey} onChange={(event) => onSortChange(event.target.value as MonthlyProjectSort)}>
            {(Object.keys(monthlyProjectSortLabels) as MonthlyProjectSort[]).map((item) => (
              <option key={item} value={item}>
                {monthlyProjectSortLabels[item]}
              </option>
            ))}
          </select>
        </label>

        <div className="monthly-filter-row" role="tablist" aria-label="PJ絞り込み">
          {categoryItems.map((item, index) => (
            <button
              key={item}
              type="button"
              ref={(node) => {
                categoryButtonRefs.current[index] = node;
              }}
              role="tab"
              aria-selected={categoryFilter === item}
              tabIndex={categoryFilter === item ? 0 : -1}
              className={categoryFilter === item ? 'monthly-filter-chip is-active' : 'monthly-filter-chip'}
              onClick={() => onCategoryFilterChange(item)}
              onKeyDown={(event) => handleCategoryKeyDown(index, event)}
            >
              <span>{monthlyProjectCategoryLabels[item]}</span>
              <strong>{categoryCounts[item]}</strong>
            </button>
          ))}
        </div>
      </div>

      <div className="monthly-project-list">
        {projects.length === 0 && <div className="detail-pane__empty">月集計の対象になるPJがまだありません。</div>}

        {projects.map((project, index) => (
          <div
            key={project.projectCode}
            ref={(node) => {
              projectRowRefs.current[index] = node;
            }}
            role="button"
            tabIndex={selectedProjectCode === project.projectCode ? 0 : -1}
            className={selectedProjectCode === project.projectCode ? 'monthly-project-row is-selected' : 'monthly-project-row'}
            onClick={() => onSelectProject(project.projectCode)}
            onKeyDown={(event) => handleProjectRowKeyDown(index, event)}
          >
            <div className="monthly-project-row__top">
              <div className="monthly-project-row__main">
                {selectedProjectCode === project.projectCode ? (
                  <span className="monthly-project-row__eyebrow">選択中の詳細</span>
                ) : null}
                <strong>
                  {project.projectCode === 'UNASSIGNED'
                    ? 'PJ未選択'
                    : `${project.projectCode} ${project.projectName}`}
                </strong>
              </div>
              <div className="monthly-project-row__badges">
                <span
                  className={`project-status-chip ${
                    project.budgetMinutes <= 0
                      ? 'is-neutral'
                      : project.differenceMinutes > 0
                        ? 'is-danger'
                        : project.differenceMinutes === 0
                          ? 'is-caution'
                          : 'is-safe'
                  }`}
                >
                  {project.budgetMinutes <= 0
                    ? '計画未設定'
                    : `差分 ${formatSignedHoursDecimal(project.differenceMinutes)}`}
                </span>
                <button
                  type="button"
                  tabIndex={selectedProjectCode === project.projectCode ? 0 : -1}
                  className="chip-button chip-button--mini"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenDayList(project.projectCode);
                  }}
                >
                  日一覧で確認
                </button>
              </div>
            </div>

            <div className="project-progress">
              <div className="project-progress__bar">
                <div className="project-progress__track" />
                {project.budgetMinutes > 0 && (
                  <div
                    className="project-progress__budget-line"
                    style={{
                      left: `${clampPercentage(
                        (project.budgetMinutes /
                          Math.max(project.budgetMinutes, project.actualMinutes, project.landingMinutes, 60)) *
                          100,
                      )}%`,
                    }}
                  />
                )}
                <div
                  className="project-progress__fill is-landing"
                  style={{
                    width: `${clampPercentage(
                      (project.landingMinutes /
                        Math.max(project.budgetMinutes, project.actualMinutes, project.landingMinutes, 60)) *
                        100,
                    )}%`,
                  }}
                />
                <div
                  className="project-progress__fill is-actual"
                  style={{
                    width: `${clampPercentage(
                      (project.actualMinutes /
                        Math.max(project.budgetMinutes, project.actualMinutes, project.landingMinutes, 60)) *
                        100,
                    )}%`,
                  }}
                />
              </div>
              <div className="project-progress__legend">
                <span className="project-progress__legend-item">計画 {project.budgetMinutes > 0 ? formatHoursDecimal(project.budgetMinutes) : '未設定'}</span>
                <span className="project-progress__legend-item">実績 {formatHoursDecimal(project.actualMinutes)}</span>
                <span className="project-progress__legend-item is-primary">見込み {formatHoursDecimal(project.landingMinutes)}</span>
                <span className="project-progress__legend-item">今後予定分 {formatHoursDecimal(Math.max(0, project.landingMinutes - project.actualMinutes))}</span>
              </div>
            </div>

            <div className="monthly-project-row__stats">
              <span>{project.category ? categoryLabels[project.category] : '未分類'}</span>
              <span>進捗率 {formatRateLabel(project.progressRate)}</span>
              <span>{project.activeDays}日</span>
              <strong>{formatSignedHoursDecimal(project.differenceMinutes)}</strong>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

interface MonthlyPlanningAsideProps {
  project: MonthlySummary['projects'][number] | null;
  summary: MonthlySummary;
  onChangeProjectBudget: (projectCode: string, nextBudgetMinutes: number) => void;
  onOpenDayList: (projectCode?: string | null) => void;
  onOpenProjectMaster: () => void;
  readOnly?: boolean;
}

function MonthlyPlanningAside({
  project,
  summary,
  onChangeProjectBudget,
  onOpenDayList,
  onOpenProjectMaster,
  readOnly = false,
}: MonthlyPlanningAsideProps) {
  if (!project) {
    return <div className="detail-pane__empty">PJを選ぶと、今月の計画と配賦構成を確認できます。</div>;
  }

  const projectLabel =
    project.projectCode === 'UNASSIGNED' ? 'PJ未選択' : `${project.projectCode} ${project.projectName}`;
  const projectMetaItems = [
    project.projectCode === 'UNASSIGNED' ? null : `PJCD ${project.projectCode}`,
    project.projectCode === 'UNASSIGNED' || !project.category ? null : categoryLabels[project.category],
  ].filter((value): value is string => Boolean(value));
  const planValueLabel = project.budgetMinutes > 0 ? formatHoursDecimal(project.budgetMinutes) : '未設定';
  const planValueDetail =
    project.budgetMinutes > 0 ? formatHoursDetailed(project.budgetMinutes) : 'この月の計画をまだ設定していません';
  const landingDifferenceLabel = formatSignedHoursDecimal(project.differenceMinutes);
  const landingDifferenceDetail =
    project.budgetMinutes <= 0 ? '計画未設定' : '着地見込みと計画の差';
  const landingDifferenceTone: SummaryTone =
    project.budgetMinutes <= 0 ? 'info' : project.differenceMinutes > 0 ? 'danger' : 'neutral';
  const futurePortionLabel = formatHoursDecimal(Math.max(0, project.landingMinutes - project.actualMinutes));

  return (
    <aside className="monthly-side-stack">
      <section className="monthly-section">
        <div className="section-header monthly-section__header">
          <div>
            <p className="section-label">monthly plan</p>
            <h3>今月の計画</h3>
          </div>
          <span className="monthly-project-count">{readOnly ? '照会専用' : '計画のみ編集可'}</span>
        </div>

        <div className="monthly-plan-readonly">
          <span className="monthly-plan-readonly__label">選択中PJ</span>
          <strong>{projectLabel}</strong>
          {projectMetaItems.length > 0 ? (
            <div className="monthly-plan-readonly__meta">
              {projectMetaItems.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="monthly-plan-hero">
          <div className="monthly-plan-hero__header">
            <span className="monthly-plan-hero__eyebrow">計画</span>
            <span className={`monthly-inline-chip ${landingDifferenceTone === 'danger' ? 'is-warning' : ''}`}>
              {project.budgetMinutes <= 0 ? '計画未設定' : `着地差分 ${landingDifferenceLabel}`}
            </span>
          </div>
          <strong className="monthly-plan-hero__value">{planValueLabel}</strong>
          <p className="monthly-plan-hero__detail">{planValueDetail}</p>
          <div className="monthly-plan-hero__support">
            <div className="monthly-plan-hero__support-item">
              <span>実績</span>
              <strong>{formatHoursDecimal(project.actualMinutes)}</strong>
              <small>{formatHoursDetailed(project.actualMinutes)}</small>
            </div>
            <div className="monthly-plan-hero__support-item">
              <span>着地見込み</span>
              <strong>{formatHoursDecimal(project.landingMinutes)}</strong>
              <small>{formatHoursDetailed(project.landingMinutes)}</small>
            </div>
          </div>
        </div>

        {readOnly ? (
          <div className="field-stack">
            <span>今月の計画値</span>
            <div className="monthly-plan-readonly">
              <strong>{planValueLabel}</strong>
              <small>
                {project.budgetMinutes <= 0
                  ? `未設定 / 着地差分 ${landingDifferenceLabel}`
                  : `計画 ${formatHoursDetailed(project.budgetMinutes)} / 着地差分 ${landingDifferenceLabel}`}
              </small>
            </div>
          </div>
        ) : (
          <label className="field-stack">
            <span>今月の計画値</span>
            <BudgetMinutesEditor
              value={project.budgetMinutes}
              onChange={(nextMinutes) => onChangeProjectBudget(project.projectCode, nextMinutes)}
            />
            <small>
              {project.budgetMinutes <= 0
                ? `未設定 / 着地差分 ${landingDifferenceLabel}`
                : `計画 ${formatHoursDetailed(project.budgetMinutes)} / 着地差分 ${landingDifferenceLabel}`}
            </small>
          </label>
        )}

        <div className="monthly-mini-metrics monthly-mini-metrics--secondary">
          <SummaryMetric
            label="今後予定分"
            value={futurePortionLabel}
            detail="まだ実績になっていない予定分"
          />
          <SummaryMetric
            label="稼働日"
            value={`${project.activeDays}日`}
            detail="このPJに実績がある日数"
            tone="info"
          />
          <SummaryMetric
            label="着地差分"
            value={landingDifferenceLabel}
            detail={landingDifferenceDetail}
            tone={landingDifferenceTone}
          />
        </div>

        <div className="monthly-plan-actions">
          <button type="button" className="secondary-button" onClick={() => onOpenDayList(project.projectCode)}>
            日一覧を開く
          </button>
          {!readOnly ? (
            <button type="button" className="ghost-button" onClick={onOpenProjectMaster}>
              PJマスタを開く
            </button>
          ) : null}
        </div>
      </section>

      <section className="monthly-allocation-grid">
        <MonthlyAllocationPieChart
          title="実績の配賦構成"
          note="いま積み上がっている実績の内訳"
          projects={summary.projects}
          totalMinutes={summary.actualTotalMinutes}
          selectedProjectCode={project.projectCode}
          minutesSelector={(entry) => entry.actualMinutes}
          emptyMessage="実績が入っているPJがまだありません。"
        />
        <MonthlyAllocationPieChart
          title="見込みの配賦構成"
          note="月末時点の着地見込み内訳"
          projects={summary.projects}
          totalMinutes={summary.landingTotalMinutes}
          selectedProjectCode={project.projectCode}
          minutesSelector={(entry) => entry.landingMinutes}
          emptyMessage="見込みが入っているPJがまだありません。"
        />
      </section>
    </aside>
  );
}

interface BudgetMinutesEditorProps {
  value: number;
  onChange: (nextMinutes: number) => void;
}

function BudgetMinutesEditor({ value, onChange }: BudgetMinutesEditorProps) {
  const quickHours = [30, 80, 150];
  const minusStepHours = [10, 1, 0.5];
  const plusStepHours = [0.5, 1, 10];

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const nextValue = Number(event.target.value);
    onChange(Number.isNaN(nextValue) ? 0 : roundToQuarter(nextValue * 60));
  }

  return (
    <div className="time-editor time-editor--budget">
      <div className="time-editor__step-grid time-editor__step-grid--budget">
        {minusStepHours.map((hours) => (
          <button
            key={`minus-${hours}`}
            type="button"
            className="step-button step-button--mini"
            onClick={() => onChange(Math.max(0, value - hours * 60))}
          >
            {`-${hours}h`}
          </button>
        ))}
        <input
          type="number"
          min={0}
          step={0.25}
          value={Number((value / 60).toFixed(2))}
          onChange={handleChange}
        />
        {plusStepHours.map((hours) => (
          <button
            key={`plus-${hours}`}
            type="button"
            className="step-button step-button--mini"
            onClick={() => onChange(value + hours * 60)}
          >
            {`+${hours}h`}
          </button>
        ))}
      </div>
      <div className="chip-row">
        {quickHours.map((hours) => (
          <button key={hours} type="button" className="chip-button" onClick={() => onChange(hours * 60)}>
            {`${hours}h`}
          </button>
        ))}
      </div>
      <small>{formatHoursDetailed(value)}</small>
    </div>
  );
}

interface DailyToolbarProps {
  date: string;
  currentMode: EntryMode;
  dayStatus: DayInputStatus;
  greetingEnabled: boolean;
  isMailNextAction: boolean;
  isMailGuided: boolean;
  readOnly?: boolean;
  compactLayout?: boolean;
  heroLabel?: string;
  currentUserId: string;
  currentUserName: string;
  isCalendarOpen: boolean;
  calendarMonthLabel: string;
  calendarDays: CalendarDayCell[];
  canCopyPreviousDay: boolean;
  canCopyPreviousWeek: boolean;
  canCopyPlanToActual: boolean;
  onToggleCalendar: () => void;
  onCloseCalendar: () => void;
  onShiftCalendarMonth: (deltaMonths: number) => void;
  onSelectDate: (date: string) => void;
  onShiftDate: (deltaDays: number) => void;
  onCopyPreviousDay: () => void;
  onCopyPreviousWeek: () => void;
  onCopyPlanToActual: () => void;
  onModeChange: (mode: EntryMode) => void;
  onSendMail: () => void;
  canSendMail: boolean;
  mailSendDisabledReason?: string | null;
  isMailSending: boolean;
  mailSendError: string | null;
  mailSendSuccessMessage: string | null;
}

function formatLocalDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isTodayDate(date: string, now = new Date()) {
  return date === formatLocalDateKey(now);
}

function isMorningGreetingTime(now = new Date()) {
  return now.getHours() < 17;
}

function isNightGreetingTime(now = new Date()) {
  return now.getHours() >= 17;
}

function DailyToolbar({
  date,
  currentMode,
  dayStatus,
  greetingEnabled,
  isMailNextAction,
  isMailGuided,
  readOnly = false,
  compactLayout = false,
  heroLabel,
  currentUserId,
  currentUserName,
  isCalendarOpen,
  calendarMonthLabel,
  calendarDays,
  canCopyPreviousDay,
  canCopyPreviousWeek,
  canCopyPlanToActual,
  onToggleCalendar,
  onCloseCalendar,
  onShiftCalendarMonth,
  onSelectDate,
  onShiftDate,
  onCopyPreviousDay,
  onCopyPreviousWeek,
  onCopyPlanToActual,
  onModeChange,
  onSendMail,
  canSendMail,
  mailSendDisabledReason,
  isMailSending,
  mailSendError,
  mailSendSuccessMessage,
}: DailyToolbarProps) {
  const dateStackRef = useRef<HTMLDivElement | null>(null);
  const calendarPopoverRef = useRef<HTMLDivElement | null>(null);
  const greetingBubbleRef = useRef<HTMLDivElement | null>(null);
  const previousModeRef = useRef(currentMode);
  const [calendarPopoverStyle, setCalendarPopoverStyle] = useState<CSSProperties | null>(null);
  const modeHeroLabel = currentMode === 'plan' ? 'Morning / 朝の予定' : 'Night / 夜の実績';
  const dayStatusLabel = statusLabels[dayStatus];
  const resolvedHeroLabel = heroLabel ?? 'daily focus';
  const canApplyPlanToActual = currentMode === 'actual';
  const todayDate = formatLocalDateKey(new Date());
  const isTodaySelected = isTodayDate(date);
  const [greeting, setGreeting] = useState<DailyGreetingContent | null>(null);
  const [isGreetingBubbleOpen, setIsGreetingBubbleOpen] = useState(false);

  useEffect(() => {
    if (!isCalendarOpen) {
      setCalendarPopoverStyle(null);
      return;
    }

    function updateCalendarPopoverPosition() {
      const anchorRect = dateStackRef.current?.getBoundingClientRect();
      if (!anchorRect) {
        return;
      }

      const width = Math.min(380, window.innerWidth - 24);
      const estimatedHeight = 720;
      const unclampedTop = anchorRect.bottom + 10;
      const top = Math.max(12, Math.min(unclampedTop, window.innerHeight - estimatedHeight - 12));
      const left = Math.min(
        Math.max(12, anchorRect.left),
        Math.max(12, window.innerWidth - width - 12),
      );

      setCalendarPopoverStyle({
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        maxHeight: `${Math.max(240, window.innerHeight - top - 12)}px`,
      });
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (dateStackRef.current?.contains(target) || calendarPopoverRef.current?.contains(target)) {
        return;
      }

      if (dateStackRef.current) {
        onCloseCalendar();
      }
    }

    updateCalendarPopoverPosition();
    window.addEventListener('resize', updateCalendarPopoverPosition);
    window.addEventListener('scroll', updateCalendarPopoverPosition, true);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('resize', updateCalendarPopoverPosition);
      window.removeEventListener('scroll', updateCalendarPopoverPosition, true);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isCalendarOpen, onCloseCalendar]);

  useEffect(() => {
    if (!isGreetingBubbleOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (dateStackRef.current?.contains(target) || greetingBubbleRef.current?.contains(target)) {
        return;
      }

      setIsGreetingBubbleOpen(false);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isGreetingBubbleOpen]);

  useEffect(() => {
    if (readOnly || !greetingEnabled || !currentUserId || !isTodaySelected) {
      setGreeting(null);
      setIsGreetingBubbleOpen(false);
      return;
    }

    const nightSeen = hasGreetingBeenSeen(currentUserId, date, 'night');
    const morningSeen = hasGreetingBeenSeen(currentUserId, date, 'morning');
    if (!nightSeen && !morningSeen) {
      setGreeting(null);
      return;
    }

    let ignore = false;
    const seenMode: EntryMode = nightSeen ? 'actual' : 'plan';
    const factRequest =
      seenMode === 'plan'
        ? loadServerTodayFact(date).catch(() => null)
        : Promise.resolve(null);

    void factRequest.then((fact) => {
      if (ignore) {
        return;
      }

      setGreeting(buildDailyGreeting({ date, mode: seenMode, userId: currentUserId, userName: currentUserName, fact }));
    });

    return () => {
      ignore = true;
    };
  }, [currentUserId, currentUserName, date, greetingEnabled, isTodaySelected, readOnly]);

  useEffect(() => {
    if (readOnly || !greetingEnabled || !currentUserId || !isTodaySelected || !isMorningGreetingTime()) {
      return;
    }

    if (hasGreetingBeenSeen(currentUserId, date, 'morning')) {
      return;
    }

    markGreetingAsSeen(currentUserId, date, 'morning');

    let ignore = false;

    void loadServerTodayFact(date)
      .catch(() => null)
      .then((fact) => {
        if (ignore) {
          return;
        }

        setGreeting(
          buildDailyGreeting({ date, mode: 'plan', userId: currentUserId, userName: currentUserName, fact }),
        );
        setIsGreetingBubbleOpen(true);
      });

    return () => {
      ignore = true;
    };
  }, [currentUserId, currentUserName, date, greetingEnabled, isTodaySelected, readOnly]);

  useEffect(() => {
    const previousMode = previousModeRef.current;
    previousModeRef.current = currentMode;

    if (readOnly || !greetingEnabled || !currentUserId || !isTodaySelected || !isNightGreetingTime()) {
      return;
    }

    if (currentMode !== 'actual' || previousMode === 'actual') {
      return;
    }

    if (hasGreetingBeenSeen(currentUserId, date, 'night')) {
      return;
    }

    markGreetingAsSeen(currentUserId, date, 'night');
    setGreeting(buildDailyGreeting({ date, mode: 'actual', userId: currentUserId, userName: currentUserName }));
    setIsGreetingBubbleOpen(true);
  }, [currentMode, currentUserId, currentUserName, date, greetingEnabled, isTodaySelected, readOnly]);

  const showGreetingBubble = !readOnly && greeting !== null && isGreetingBubbleOpen;
  const showGreetingReopen = !readOnly && greetingEnabled && isTodaySelected && greeting !== null && !isGreetingBubbleOpen;

  return (
    <section
      className={[
        'toolbar-shell toolbar-shell--hero toolbar-shell--daily',
        compactLayout ? 'is-compact' : '',
      ].filter(Boolean).join(' ')}
      data-entry-mode={currentMode}
    >
      {!compactLayout ? (
        <>
          <div className="toolbar-shell__intro">
            <div>
              <p className="section-label">{resolvedHeroLabel}</p>
              <h2>日入力</h2>
              <p>開始と終了を合わせてから、PJごとの予定と実績をすばやく整えます。</p>
            </div>
            <div className="toolbar-shell__chips">
              <span className="toolbar-shell__chip">{modeHeroLabel}</span>
              <span className={`toolbar-shell__chip is-${dayStatus}`}>{dayStatusLabel}</span>
              {readOnly ? <span className="toolbar-shell__chip is-accent">照会専用</span> : null}
              {currentMode === 'actual' && canCopyPlanToActual && (
                <span className="toolbar-shell__chip is-accent">予定コピー可</span>
              )}
            </div>
          </div>
          <p className="toolbar-mode-hint toolbar-mode-hint--floating" aria-label="キーボードショートカット">
            Alt+↑/↓ 朝夜切替 ・ Alt+←/→ 日付移動
          </p>
        </>
      ) : null}
      <div className="toolbar-shell__content">
        <div className="toolbar-date">
          <button type="button" className="ghost-button" onClick={() => onShiftDate(-1)}>
            前日
          </button>

          <div ref={dateStackRef} className={isCalendarOpen ? 'date-stack is-open' : 'date-stack'}>
            <button
              type="button"
              className="date-chip date-chip--button"
              disabled={readOnly}
              onClick={() => {
                setIsGreetingBubbleOpen(false);
                onToggleCalendar();
              }}
            >
              <span>{formatDateLabel(date)}</span>
              <strong className={`date-chip__status is-${dayStatus}`}>{statusLabels[dayStatus]}</strong>
            </button>

            <button
              type="button"
              className="ghost-button date-stack__today"
              onClick={() => {
                setIsGreetingBubbleOpen(false);
                onCloseCalendar();
                onSelectDate(todayDate);
              }}
              disabled={isTodaySelected}
            >
              本日
            </button>

            {isCalendarOpen && (
              <CalendarPopover
                popoverRef={calendarPopoverRef}
                popoverStyle={calendarPopoverStyle}
                monthLabel={calendarMonthLabel}
                days={calendarDays}
                onShiftMonth={onShiftCalendarMonth}
                onSelectDate={onSelectDate}
                onClose={onCloseCalendar}
              />
            )}
          </div>

          <button type="button" className="ghost-button" onClick={() => onShiftDate(1)}>
            翌日
          </button>

          {currentMode === 'plan' ? (
            <div className="toolbar-copy-stack" aria-label="予定コピー">
              <button
                type="button"
                className="ghost-button toolbar-copy-previous-button"
                onClick={onCopyPreviousDay}
                disabled={readOnly || !canCopyPreviousDay}
                title="前日の予定だけをコピーします"
              >
                前日コピー
              </button>
              <button
                type="button"
                className="ghost-button toolbar-copy-previous-button"
                onClick={onCopyPreviousWeek}
                disabled={readOnly || !canCopyPreviousWeek}
                title="前週同曜日の予定だけをコピーします"
              >
                前週コピー
              </button>
            </div>
          ) : null}
        </div>

        <div className="toolbar-side">
          <div className="toolbar-side__stack">
            <div className="toolbar-side__mode-stack">
              <button
                type="button"
                className={
                  canApplyPlanToActual
                    ? 'secondary-button toolbar-copy-button'
                    : 'secondary-button toolbar-copy-button is-reserved'
                }
                onClick={onCopyPlanToActual}
                disabled={readOnly || !canApplyPlanToActual || !canCopyPlanToActual}
                aria-hidden={readOnly || !canApplyPlanToActual}
                tabIndex={readOnly || !canApplyPlanToActual ? -1 : 0}
                title={
                  canApplyPlanToActual
                    ? '予定を実績へ反映'
                    : '実績入力で予定コピー可のときに使えます'
                }
              >
                予定を反映
              </button>
              <div className="proposal-mode-switch" role="tablist" aria-label="入力モード切り替え">
                {(['plan', 'actual'] as EntryMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={
                      currentMode === mode
                        ? 'proposal-mode-switch__item is-active'
                        : 'proposal-mode-switch__item'
                    }
                    onClick={() => onModeChange(mode)}
                  >
                    <span>{mode === 'plan' ? 'Morning' : 'Night'}</span>
                    <strong>{modeLabels[mode]}</strong>
                  </button>
                ))}
              </div>
            </div>
            <div className={readOnly ? 'toolbar-side__mail-stack is-hidden' : 'toolbar-side__mail-stack'}>
              {isMailGuided ? <span className="toolbar-mail-guide-badge" aria-hidden="true">👇ココ！</span> : null}
              <button
                type="button"
                className={[
                  'primary-button',
                  'daily-mail-button',
                  isMailNextAction ? 'is-next-step' : '',
                  isMailGuided ? 'is-guide-target' : '',
                ].filter(Boolean).join(' ')}
                onClick={onSendMail}
                disabled={readOnly || !canSendMail || isMailSending}
                title={readOnly ? '照会モードではメール送信できません。' : !canSendMail ? mailSendDisabledReason || undefined : undefined}
              >
                {isMailSending
                  ? 'メール作成中...'
                  : 'メール作成'}
              </button>

              {showGreetingReopen ? (
                <button
                  type="button"
                  className="ghost-button toolbar-greeting-button"
                  onClick={() => setIsGreetingBubbleOpen(true)}
                >
                  ごあいさつ
                </button>
              ) : null}
            </div>
            {mailSendError ? <p className="mail-send-status is-error toolbar-mail-status">{mailSendError}</p> : null}
          </div>
        </div>
      </div>

      {showGreetingBubble ? (
        <DailyGreetingBubblePortal
          bubbleRef={greetingBubbleRef}
          greeting={greeting}
          onClose={() => setIsGreetingBubbleOpen(false)}
        />
      ) : null}
    </section>
  );
}

interface DailyGreetingBubblePortalProps {
  bubbleRef: RefObject<HTMLDivElement | null>;
  greeting: DailyGreetingContent;
  onClose: () => void;
}

function DailyGreetingBubblePortal({ bubbleRef, greeting, onClose }: DailyGreetingBubblePortalProps) {
  return (
    <section
      ref={bubbleRef}
      className="daily-greeting-bubble"
      data-entry-mode={greeting.mode}
      role="dialog"
      aria-label={greeting.periodLabel}
      aria-modal="false"
    >
      <div className="daily-greeting-bubble__surface">
        <div className="daily-greeting-bubble__header">
          <div>
            <p className="section-label">{greeting.periodLabel}</p>
            <strong className="daily-greeting-bubble__headline">{greeting.headline}</strong>
          </div>
          <button type="button" className="ghost-button daily-greeting-bubble__close" onClick={onClose}>
            閉じる
          </button>
        </div>

        {greeting.mode === 'plan' ? (
          <>
            {greeting.fact ? (
              <div className="daily-greeting-bubble__fact">
                <strong>{greeting.fact.line}</strong>
                {greeting.fact.sourceUrl ? (
                  <a
                    href={greeting.fact.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="daily-greeting-bubble__source"
                  >
                    {greeting.fact.sourceLabel || 'Wikipedia'}
                  </a>
                ) : null}
              </div>
            ) : null}
            {greeting.fortune ? (
              <div className="daily-greeting-bubble__luck-grid">
                <article className="daily-greeting-bubble__pill">
                  <span>{greeting.fortune.omikujiLabel}</span>
                  <strong>{greeting.fortune.omikujiTitle}</strong>
                </article>
                <article className="daily-greeting-bubble__pill">
                  <span>{greeting.fortune.luckyColorLabel}</span>
                  <div className="daily-greeting-bubble__color-value">
                    <span
                      className="daily-greeting-bubble__color-swatch"
                      aria-hidden="true"
                      style={{ backgroundColor: greeting.fortune.luckyColor.hex }}
                    />
                    <strong>{greeting.fortune.luckyColor.name}</strong>
                  </div>
                </article>
                <article className="daily-greeting-bubble__pill">
                  <span>{greeting.fortune.luckyItemLabel}</span>
                  <strong>{greeting.fortune.luckyItem}</strong>
                </article>
              </div>
            ) : null}
            {greeting.morningJinx ? (
              <article className="daily-greeting-bubble__quote">
                <span>{greeting.morningJinx.label}</span>
                <p>{greeting.morningJinx.text}</p>
              </article>
            ) : null}
            {greeting.pcTip ? (
              <article className="daily-greeting-bubble__quote">
                <span>{greeting.pcTip.label}</span>
                <p>{greeting.pcTip.text}</p>
                {greeting.pcTip.sourceUrl ? (
                  <a
                    href={greeting.pcTip.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="daily-greeting-bubble__source"
                  >
                    {greeting.pcTip.sourceLabel || 'Source'}
                  </a>
                ) : null}
              </article>
            ) : null}
          </>
        ) : null}

        {greeting.closing ? (
          <article className="daily-greeting-bubble__quote">
            <span>{greeting.closing.label}</span>
            <p>{greeting.closing.text}</p>
          </article>
        ) : null}
      </div>
    </section>
  );
}

interface CalendarPopoverProps {
  popoverRef: RefObject<HTMLDivElement | null>;
  popoverStyle: CSSProperties | null;
  monthLabel: string;
  days: CalendarDayCell[];
  onShiftMonth: (deltaMonths: number) => void;
  onSelectDate: (date: string) => void;
  onClose: () => void;
}

function CalendarPopover({
  popoverRef,
  popoverStyle,
  monthLabel,
  days,
  onShiftMonth,
  onSelectDate,
  onClose,
}: CalendarPopoverProps) {
  const popover = (
    <div ref={popoverRef} className="calendar-popover calendar-popover--portal" style={popoverStyle ?? undefined}>
      <div className="calendar-popover__header">
        <button type="button" className="ghost-button" onClick={() => onShiftMonth(-1)}>
          前月
        </button>
        <strong>{monthLabel}</strong>
        <button type="button" className="ghost-button" onClick={() => onShiftMonth(1)}>
          翌月
        </button>
      </div>

      <div className="calendar-grid calendar-grid--weekdays">
        {['月', '火', '水', '木', '金', '土', '日'].map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="calendar-grid">
        {days.map((day) => (
          <button
            key={day.date}
            type="button"
            className={[
              'calendar-day',
              day.inMonth ? '' : 'is-outside',
              day.isSelected ? 'is-selected' : '',
              day.isToday ? 'is-today' : '',
              day.isWeekend || day.isHoliday ? 'is-day-off' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label={`${formatDateLabel(day.date)} ${getCalendarStatusLabel(day)}${
              day.summaryLabel ? ` ${day.summaryLabel}` : ''
            }`}
            title={day.holidayName ?? undefined}
            onClick={() => onSelectDate(day.date)}
          >
            <div className="calendar-day__top">
              <span className="calendar-day__number">{day.dayNumber}</span>
            </div>
            <div className="calendar-day__status-row">
              <small className={`calendar-status-badge is-${getCalendarStatusVariant(day)}`} aria-hidden="true">
                {getCalendarStatusMark(day)}
              </small>
            </div>
            <div className="calendar-day__footer">
              <em>{day.summaryLabel || ' '}</em>
            </div>
          </button>
        ))}
      </div>

      <div className="calendar-legend">
        {(['done', 'partial', 'empty'] as DayInputStatus[]).map((status) => (
          <span key={status} className="calendar-legend__item">
            <span className={`calendar-status-badge is-${status}`} aria-hidden="true">
              {calendarStatusMarks[status]}
            </span>
            <small>{calendarLegendLabels[status]}</small>
          </span>
        ))}
        <span className="calendar-legend__item">
          <span className="calendar-status-badge is-day-off" aria-hidden="true">
            休
          </span>
          <small>土日</small>
        </span>
        <span className="calendar-legend__item">
          <span className="calendar-status-badge is-holiday" aria-hidden="true">
            祝
          </span>
          <small>祝日</small>
        </span>
      </div>

      <button type="button" className="calendar-close" onClick={onClose}>
        閉じる
      </button>
    </div>
  );

  return createPortal(popover, document.body);
}

interface SpotlightOverlayProps {
  guide: DailyGuide;
  targetRefs: SpotlightTargetRef[];
  onDismiss: () => void;
}

function SpotlightOverlay({ guide, targetRefs, onDismiss }: SpotlightOverlayProps) {
  const [rect, setRect] = useState<SpotlightRect | null>(null);
  const [containerRect, setContainerRect] = useState<SpotlightRect | null>(null);

  useEffect(() => {
    let frameId = 0;
    const resizeObserver =
      typeof window !== 'undefined' && 'ResizeObserver' in window
        ? new ResizeObserver(() => scheduleUpdate())
        : null;

    function update() {
      const nextRect = buildSpotlightRect(targetRefs);
      const targetElement = targetRefs.find((targetRef) => targetRef.current)?.current;
      const containerElement = targetElement?.closest('.app-window__body') as HTMLElement | null;
      const nextContainerRect = containerElement?.getBoundingClientRect();

      setRect(nextRect);
      setContainerRect(
        nextContainerRect
          ? {
              top: nextContainerRect.top,
              left: nextContainerRect.left,
              width: nextContainerRect.width,
              height: nextContainerRect.height,
            }
          : null,
      );
    }

    function scheduleUpdate() {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(update);
    }

    scheduleUpdate();
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('scroll', scheduleUpdate, true);
    targetRefs.forEach((targetRef) => {
      if (targetRef.current) {
        resizeObserver?.observe(targetRef.current);
      }
    });
    const targetElement = targetRefs.find((targetRef) => targetRef.current)?.current;
    const containerElement = targetElement?.closest('.app-window__body');
    if (containerElement) {
      resizeObserver?.observe(containerElement);
    }

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('scroll', scheduleUpdate, true);
      resizeObserver?.disconnect();
    };
  }, [guide.step, targetRefs]);

  if (!rect || !containerRect) {
    return null;
  }

  const relativeTop = rect.top - containerRect.top;
  const relativeLeft = rect.left - containerRect.left;
  const cardWidth = Math.min(340, Math.max(220, containerRect.width - 32));
  const spaceBelow = containerRect.height - (relativeTop + rect.height);
  const shouldPlaceAbove = relativeTop > spaceBelow + 150;
  const rawTop = shouldPlaceAbove ? relativeTop - 144 : relativeTop + rect.height + 16;
  const cardTop = Math.min(Math.max(16, rawTop), Math.max(16, containerRect.height - 156));
  const cardLeft = Math.min(Math.max(16, relativeLeft), Math.max(16, containerRect.width - cardWidth - 16));

  return (
    <>
      <div className="spotlight-overlay" aria-hidden="true" />
      <div
        className={`spotlight-hole spotlight-hole--${guide.step}`}
        style={{
          top: relativeTop,
          left: relativeLeft,
          width: rect.width,
          height: rect.height,
        }}
        aria-hidden="true"
      />
      <section
        className={`spotlight-card spotlight-card--${guide.step}`}
        style={{
          top: cardTop,
          left: cardLeft,
          width: cardWidth,
        }}
        role="status"
        aria-live="polite"
      >
        <div className="spotlight-card__eyebrow-row">
          <span className="spotlight-card__eyebrow">{guide.eyebrow}</span>
          <button type="button" className="ghost-button spotlight-card__close" onClick={onDismiss}>
            閉じる
          </button>
        </div>
        <strong className="spotlight-card__title">{guide.title}</strong>
        <p className="spotlight-card__detail">{guide.detail}</p>
      </section>
    </>
  );
}

interface SummaryStripProps {
  board: InputBoardDraft;
  metrics: InputBoardMetrics;
  warnings: InputBoardWarning[];
  currentMode: EntryMode;
  readOnly?: boolean;
  onTimeChange: (field: 'startTime' | 'endTime', value: string) => void;
  onTimeStep: (field: 'startTime' | 'endTime', deltaMinutes: number) => void;
  highlightedStep: DailyGuideStep | null;
  guidedStep: DailyGuideStep | null;
}

function SummaryStrip({
  board,
  metrics,
  warnings,
  currentMode,
  readOnly = false,
  onTimeChange,
  onTimeStep,
  highlightedStep,
  guidedStep,
}: SummaryStripProps) {
  const counterpartMode: EntryMode = currentMode === 'plan' ? 'actual' : 'plan';
  const currentMetrics = metrics[currentMode];
  const counterpartMetrics = metrics[counterpartMode];
  const startNeedsInput = board.startTime[currentMode] === '';
  const endNeedsInput = board.endTime[currentMode] === '';
  const summaryLabels =
    currentMode === 'plan'
      ? { start: '開始予定', end: '終了予定' }
      : { start: '開始実績', end: '終了実績' };
  const differenceState = buildDifferenceState(currentMetrics.differenceMinutes);
  const visibleWarnings = warnings.filter((warning) => warning.id !== 'difference').slice(0, 2);
  const previousDifferenceRef = useRef<number | null>(currentMetrics.differenceMinutes);
  const [differenceReaction, setDifferenceReaction] = useState<'idle' | 'pulse' | 'resolved'>('idle');
  const differenceValue =
    currentMetrics.differenceMinutes === null
      ? '未計算'
      : currentMetrics.differenceMinutes === 0
        ? 'ぴったり'
        : formatSignedHoursDecimal(-currentMetrics.differenceMinutes);

  useEffect(() => {
    const previousDifference = previousDifferenceRef.current;
    const nextDifference = currentMetrics.differenceMinutes;

    if (previousDifference === nextDifference) {
      return;
    }

    previousDifferenceRef.current = nextDifference;
    setDifferenceReaction(nextDifference === 0 ? 'resolved' : 'pulse');
    const timeoutId = window.setTimeout(() => setDifferenceReaction('idle'), 760);
    return () => window.clearTimeout(timeoutId);
  }, [currentMetrics.differenceMinutes]);

  return (
    <section className="summary-strip" data-entry-mode={currentMode}>
      <SummaryBarField
        label={summaryLabels.start}
        detail={`${modeLabels[counterpartMode]} ${board.startTime[counterpartMode] || '--:--'}`}
        highlighted={highlightedStep === 'summary'}
        guided={guidedStep === 'summary' && startNeedsInput}
        control={
          readOnly ? (
            <div className="summary-time-readonly">{board.startTime[currentMode] || '--:--'}</div>
          ) : (
            <SummaryTimeControl
              value={board.startTime[currentMode]}
              quickValues={['09:00', '09:30', '10:00', '13:00']}
              onChange={(value) => onTimeChange('startTime', value)}
              onStep={(deltaMinutes) => onTimeStep('startTime', deltaMinutes)}
            />
          )
        }
      />
      <SummaryBarField
        label={summaryLabels.end}
        detail={`${modeLabels[counterpartMode]} ${board.endTime[counterpartMode] || '--:--'}`}
        highlighted={highlightedStep === 'summary'}
        guided={guidedStep === 'summary' && endNeedsInput}
        control={
          readOnly ? (
            <div className="summary-time-readonly">{board.endTime[currentMode] || '--:--'}</div>
          ) : (
            <SummaryTimeControl
              value={board.endTime[currentMode]}
              quickValues={['17:30', '18:00', '18:30', '20:00', '22:00']}
              onChange={(value) => onTimeChange('endTime', value)}
              onStep={(deltaMinutes) => onTimeStep('endTime', deltaMinutes)}
            />
          )
        }
      />
      <SummaryBarMetric
        label="稼働時間"
        value={formatHoursDecimal(currentMetrics.workTargetMinutes)}
        detail={`昼休み固定 ${formatMinutesDetailed(currentMetrics.lunchDeductionMinutes)}`}
      />
      <SummaryBarMetric
        label="PJ合計"
        value={formatHoursDecimal(currentMetrics.allocationTotalMinutes)}
        detail={`${modeLabels[counterpartMode]} ${formatMinutesDetailed(counterpartMetrics.allocationTotalMinutes)}`}
      />
      <SummaryBarMetric
        label="年休／分断"
        value={formatHoursDecimal(currentMetrics.splitMinutes + currentMetrics.annualHourMinutes)}
        detail={buildModeAuxDetail(currentMetrics)}
      />
      <SummaryBarMetric
        label="差分"
        value={differenceValue}
        tone={differenceState.tone}
        highlighted={highlightedStep === 'difference'}
        guided={guidedStep === 'difference'}
        reaction={differenceReaction}
      >
        {visibleWarnings.length > 0 && (
          <div className="summary-bar__alerts">
            {visibleWarnings.map((warning) => (
              <span
                key={warning.id}
                className={`warning-pill is-${warning.tone}`}
                title={warning.detail}
              >
                {formatWarningBadge(warning)}
              </span>
            ))}
          </div>
        )}
      </SummaryBarMetric>
    </section>
  );
}

interface SummaryBarFieldProps {
  label: string;
  control: ReactNode;
  detail: string;
  highlighted?: boolean;
  guided?: boolean;
}

function SummaryBarField({
  label,
  control,
  detail,
  highlighted = false,
  guided = false,
}: SummaryBarFieldProps) {
  const className = [
    'summary-bar__item',
    'summary-bar__item--input',
    highlighted ? 'is-next-step' : '',
    guided ? 'is-guide-target' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={className}>
      <span className="summary-bar__label">{label}</span>
      {control}
      <small className="summary-bar__detail">{detail}</small>
    </div>
  );
}

interface SummaryBarMetricProps {
  label: string;
  value: string;
  detail?: string;
  tone?: 'danger' | 'caution' | 'neutral' | 'info';
  children?: ReactNode;
  highlighted?: boolean;
  guided?: boolean;
  reaction?: 'idle' | 'pulse' | 'resolved';
}

function SummaryBarMetric({
  label,
  value,
  detail,
  tone,
  children,
  highlighted = false,
  guided = false,
  reaction = 'idle',
}: SummaryBarMetricProps) {
  const className = [
    'summary-bar__item',
    tone ? `is-${tone}` : '',
    highlighted ? 'is-next-step' : '',
    guided ? 'is-guide-target' : '',
    reaction !== 'idle' ? `is-${reaction}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={className}>
      <span className="summary-bar__label">{label}</span>
      <strong className={reaction !== 'idle' ? `summary-bar__value is-${reaction}` : 'summary-bar__value'}>{value}</strong>
      {detail ? <small className="summary-bar__detail">{detail}</small> : null}
      {children}
    </div>
  );
}

interface SummaryMetricProps {
  label: string;
  value: string;
  detail: string;
  tone?: SummaryTone;
}

function SummaryMetric({ label, value, detail, tone }: SummaryMetricProps) {
  return (
    <div className={tone ? `summary-card is-${tone}` : 'summary-card'}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

interface MonthlyOverviewCardProps {
  label: string;
  value: string;
  minutesLabel?: string;
  detail: string;
  tone?: SummaryTone;
  metaItems?: MonthlyOverviewCardMetaItem[];
}

export function MonthlyOverviewCard({
  label,
  value,
  minutesLabel,
  detail,
  tone,
  metaItems = [],
}: MonthlyOverviewCardProps) {
  return (
    <div className={tone ? `monthly-overview-card is-${tone}` : 'monthly-overview-card'}>
      <span className="monthly-overview-card__label">{label}</span>
      <div className="monthly-overview-card__metric">
        <strong>{value}</strong>
        {minutesLabel ? <small className="monthly-overview-card__minutes">{minutesLabel}</small> : null}
      </div>
      <p className="monthly-overview-card__detail">{detail}</p>
      {metaItems.length > 0 && (
        <div className="monthly-overview-card__meta">
          {metaItems.map((item) => (
            <span key={`${item.label}-${item.value}`} className="monthly-overview-card__meta-item">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function getProjectRowBadge(entry: ProjectEntry, currentMode: EntryMode, isSelected: boolean) {
  const hasAnyInput =
    entry.projectSearch.trim() !== '' ||
    entry.projectCode.trim() !== '' ||
    entry.taskName[currentMode].trim() !== '' ||
    entry.note[currentMode].trim() !== '' ||
    entry.minutes[currentMode] > 0 ||
    entry.rangeStart[currentMode].trim() !== '' ||
    entry.rangeEnd[currentMode].trim() !== '';

  if (!hasAnyInput) {
    return isSelected ? '要入力' : null;
  }

  if (entry.minutes[currentMode] <= 0) {
    return '要時間';
  }

  if (!entry.projectCode.trim()) {
    return '要PJ入力';
  }

  if (!entry.taskName[currentMode].trim()) {
    return '要タスク';
  }

  return null;
}

interface SelectableProjectRowProps {
  rowNumber: number;
  entry: ProjectEntry;
  currentMode: EntryMode;
  readOnly?: boolean;
  isSelected: boolean;
  isDragging: boolean;
  isNextStep: boolean;
  isGuided: boolean;
  onDragStart: () => void;
  onDrop: () => void;
  onSelect: () => void;
  onMoveSelection: (delta: 1 | -1) => void;
}

function SelectableProjectRow({
  rowNumber,
  entry,
  currentMode,
  readOnly = false,
  isSelected,
  isDragging,
  isNextStep,
  isGuided,
  onDragStart,
  onDrop,
  onSelect,
  onMoveSelection,
}: SelectableProjectRowProps) {
  const counterpartMode: EntryMode = currentMode === 'plan' ? 'actual' : 'plan';
  const badge = getProjectRowBadge(entry, currentMode, isSelected);
  const currentPlaceLabel = getEntryPlaceDisplayLabel(entry, currentMode);
  const currentPlace = entry.place[currentMode];
  const rangeLabel =
    entry.timeInputMode[currentMode] === 'range'
      ? `${entry.rangeStart[currentMode] || '--:--'} - ${entry.rangeEnd[currentMode] || '--:--'}`
      : null;

  return (
    <div
      className={['selectable-row-wrap', isDragging ? 'is-dragging' : '', isNextStep ? 'is-next-step' : '', isGuided ? 'is-guide-target' : '']
        .filter(Boolean)
        .join(' ')}
      draggable={!readOnly}
      onDragStart={readOnly ? undefined : onDragStart}
      onDragOver={(event) => event.preventDefault()}
      onDrop={readOnly ? undefined : onDrop}
    >
      <button
        type="button"
        tabIndex={isSelected ? 0 : -1}
        className={isSelected ? 'selectable-row selectable-row--project is-selected' : 'selectable-row selectable-row--project'}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            onMoveSelection(1);
            return;
          }

          if (event.key === 'ArrowUp') {
            event.preventDefault();
            onMoveSelection(-1);
          }
        }}
      >
        <span className="row-number">{rowNumber}</span>
        <div className="selectable-row__main">
          <span className="drag-handle" aria-hidden="true">
            ⋮⋮
          </span>
          <div className="selectable-row__project">
            {entry.projectCode ? (
              <>
                <strong className="selectable-row__project-code">{entry.projectCode}</strong>
                <span className="selectable-row__project-name">{entry.projectName || 'PJ名未設定'}</span>
              </>
            ) : (
              <strong>PJ未入力</strong>
            )}
          </div>
        </div>
        <span className="selectable-row__task">{entry.taskName[currentMode] || 'タスク未入力'}</span>
        <span className="selectable-row__place" data-place={currentPlace}>
          {currentPlaceLabel}
        </span>
        <div className="selectable-row__meta">
          {rangeLabel && <small className="selectable-row__time-range">{rangeLabel}</small>}
          <strong>{formatMinutesShort(entry.minutes[currentMode])}</strong>
          <small className="selectable-row__time-other">
            {modeLabels[counterpartMode]} {formatMinutesShort(entry.minutes[counterpartMode])}
          </small>
        </div>
        <div className="selectable-row__warning">
          {badge ? <span className="row-badge">{badge}</span> : null}
        </div>
      </button>
    </div>
  );
}

interface SelectableAuxRowProps {
  entry: AuxTimeEntry;
  lunchMinutes: number;
  isSelected: boolean;
  onSelect: () => void;
  onMoveSelection: (delta: 1 | -1) => void;
}

function SelectableAuxRow({ entry, lunchMinutes, isSelected, onSelect, onMoveSelection }: SelectableAuxRowProps) {
  return (
    <button
      type="button"
      tabIndex={isSelected ? 0 : -1}
      className={isSelected ? 'selectable-row selectable-row--aux is-selected is-aux' : 'selectable-row selectable-row--aux is-aux'}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          onMoveSelection(1);
          return;
        }

        if (event.key === 'ArrowUp') {
          event.preventDefault();
          onMoveSelection(-1);
        }
      }}
    >
      <div>
        <strong>{getAuxTypeLabel(entry.type)}</strong>
        <span>{entry.note || 'メモなし'}</span>
      </div>
      <div className="selectable-row__meta">
        <span>{buildAuxEntryMetaLabel(entry, lunchMinutes)}</span>
      </div>
    </button>
  );
}

interface ProjectDetailPaneProps {
  entry: ProjectEntry;
  detailNumber: number;
  board: InputBoardDraft;
  recentProjectCodes: string[];
  recentTaskNames: string[];
  currentMode: EntryMode;
  autoFocus: boolean;
  highlightedField: 'project' | 'task' | null;
  guidedField: 'project' | 'task' | null;
  readOnly?: boolean;
  onAutoFocusDone: () => void;
  onProjectSearchChange: (entryId: string, value: string) => void;
  onProjectSelect: (entryId: string, project: ProjectCatalogItem) => void;
  onChangeTimeInputMode: (entryId: string, nextMode: ProjectTimeInputMode) => void;
  onChangeRange: (entryId: string, field: 'rangeStart' | 'rangeEnd', value: string) => void;
  onChangeTask: (entryId: string, value: string) => void;
  onChangeMinutes: (entryId: string, nextMinutes: number) => void;
  onStepMinutes: (entryId: string, deltaMinutes: number) => void;
  onChangePlace: (entryId: string, place: WorkPlace) => void;
  onChangePlaceDetail: (entryId: string, value: string) => void;
  onChangeNote: (entryId: string, value: string) => void;
  onRemoveProject: (entryId: string) => void;
}

function buildReadonlyProjectTimeLabel(entry: ProjectEntry, mode: EntryMode) {
  if (entry.timeInputMode[mode] === 'range' && (entry.rangeStart[mode] || entry.rangeEnd[mode])) {
    return `${entry.rangeStart[mode] || '--:--'} - ${entry.rangeEnd[mode] || '--:--'} / ${formatHoursDetailed(entry.minutes[mode])}`;
  }

  return formatHoursDetailed(entry.minutes[mode]);
}

function buildReadonlyProjectMetaLabel(entry: ProjectEntry, mode: EntryMode) {
  const labels = [
    entry.category ? categoryLabels[entry.category] : 'カテゴリ未設定',
    getEntryPlaceDisplayLabel(entry, mode),
  ].filter(Boolean);
  return labels.join(' / ');
}

function buildReadonlyAuxTimeLabel(entry: AuxTimeEntry, lunchMinutes: number) {
  if (isAuxRangeType(entry.type)) {
    const duration = calculateTimeRangeMinutesExcludingLunch(entry.startTime, entry.endTime, lunchMinutes);
    return `${entry.startTime || '--:--'} - ${entry.endTime || '--:--'}${duration === null ? '' : ` / ${formatHoursDetailed(duration)}`}`;
  }

  return '時間帯なし';
}

function ReadonlyDetailItem({ label, value, subtle = false }: { label: string; value: string; subtle?: boolean }) {
  return (
    <div className={subtle ? 'readonly-detail-item is-subtle' : 'readonly-detail-item'}>
      <span>{label}</span>
      <strong>{value || '未入力'}</strong>
    </div>
  );
}

function ReadonlyProjectDetailPane({
  entry,
  detailNumber,
  board,
  currentMode,
}: {
  entry: ProjectEntry;
  detailNumber: number;
  board: InputBoardDraft;
  currentMode: EntryMode;
}) {
  const counterpartMode: EntryMode = currentMode === 'plan' ? 'actual' : 'plan';
  const selectedProject = board.projectCatalog.find((project) => project.projectCode === entry.projectCode) ?? null;
  const detailProjectLabel =
    entry.projectCode.trim() === ''
      ? 'PJ未設定'
      : [entry.projectCode, selectedProject?.projectName ?? entry.projectName].filter(Boolean).join(' ');

  return (
    <section className="detail-pane detail-pane--readonly">
      <div className="detail-pane__header">
        <div>
          <p className="section-label">readonly</p>
          <h3>入力詳細</h3>
          <p>{`行 #${detailNumber} / ${detailProjectLabel}`}</p>
        </div>
        <div className="detail-pane__header-actions">
          <span className="detail-index-badge">{`#${detailNumber}`}</span>
          <span className="status-pill is-partial">照会専用</span>
        </div>
      </div>

      <div className="readonly-detail-grid">
        <ReadonlyDetailItem label="PJ" value={detailProjectLabel} />
        <ReadonlyDetailItem label="場所" value={getEntryPlaceDisplayLabel(entry, currentMode)} />
        <ReadonlyDetailItem label="入力方式" value={entry.timeInputMode[currentMode] === 'range' ? '時間帯' : '時間数'} subtle />
        <ReadonlyDetailItem label="時間" value={buildReadonlyProjectTimeLabel(entry, currentMode)} />
        <ReadonlyDetailItem label="予定/実績差" value={formatSignedMinutesDetailed(entry.minutes[currentMode] - entry.minutes[counterpartMode])} subtle />
        <ReadonlyDetailItem label="比較" value={`${modeLabels[counterpartMode]} ${buildReadonlyProjectTimeLabel(entry, counterpartMode)}`} subtle />
      </div>

      <div className="readonly-detail-stack">
        <ReadonlyDetailItem label="分類" value={buildReadonlyProjectMetaLabel(entry, currentMode)} subtle />
        <ReadonlyDetailItem
          label="タスク"
          value={entry.taskName[currentMode] || '未入力'}
          subtle={!entry.taskName[currentMode]}
        />
        {entry.note[currentMode] ? (
          <div className="readonly-detail-note">
            <span>メモ</span>
            <p>{entry.note[currentMode]}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ReadonlyAuxDetailPane({
  entry,
  detailNumber,
  lunchMinutes,
}: {
  entry: AuxTimeEntry;
  detailNumber: number;
  lunchMinutes: number;
}) {
  return (
    <section className="detail-pane detail-pane--readonly detail-pane--aux">
      <div className="detail-pane__header">
        <div>
          <p className="section-label">readonly</p>
          <h3>補助時間詳細</h3>
          <p>{`行 #${detailNumber} / ${getAuxTypeLabel(entry.type)}`}</p>
        </div>
        <div className="detail-pane__header-actions">
          <span className="detail-index-badge">{`#${detailNumber}`}</span>
          <span className="status-pill is-partial">照会専用</span>
        </div>
      </div>

      <div className="readonly-detail-grid">
        <ReadonlyDetailItem label="種類" value={getAuxTypeLabel(entry.type)} />
        <ReadonlyDetailItem label="時間" value={buildReadonlyAuxTimeLabel(entry, lunchMinutes)} />
      </div>

      {entry.note ? (
        <div className="readonly-detail-note">
          <span>メモ</span>
          <p>{entry.note}</p>
        </div>
      ) : null}
    </section>
  );
}

function ProjectDetailPane({
  entry,
  detailNumber,
  board,
  recentProjectCodes,
  recentTaskNames,
  currentMode,
  autoFocus,
  highlightedField,
  guidedField,
  readOnly = false,
  onAutoFocusDone,
  onProjectSearchChange,
  onProjectSelect,
  onChangeTimeInputMode,
  onChangeRange,
  onChangeTask,
  onChangeMinutes,
  onStepMinutes,
  onChangePlace,
  onChangePlaceDetail,
  onChangeNote,
  onRemoveProject,
}: ProjectDetailPaneProps) {
  const counterpartMode: EntryMode = currentMode === 'plan' ? 'actual' : 'plan';
  const removeButtonLabel = currentMode === 'plan' ? '予定を削除' : '実績を削除';
  const taskSuggestions = buildTaskSuggestions(entry, board.projectCatalog, recentTaskNames);
  const differenceLabel = formatSignedMinutesDetailed(entry.minutes[currentMode] - entry.minutes[counterpartMode]);
  const selectedProject = board.projectCatalog.find((project) => project.projectCode === entry.projectCode) ?? null;
  const detailProjectLabel =
    entry.projectCode.trim() === ''
      ? 'PJを選択'
      : [entry.projectCode, selectedProject?.projectName ?? entry.projectName].filter(Boolean).join(' ');
  const taskInputRef = useRef<HTMLTextAreaElement | null>(null);
  const suggestionsRef = useRef<HTMLDetailsElement | null>(null);
  const [activeTaskSuggestionIndex, setActiveTaskSuggestionIndex] = useState(0);
  const activeTaskSuggestionIndexRef = useRef(0);
  const taskSuggestionChoices = taskSuggestions.slice(0, 4);
  const detailSectionClassName = readOnly ? 'detail-pane detail-pane--read-only-ui' : 'detail-pane';
  const detailSectionLabel = readOnly ? 'readonly' : 'detail';
  const detailHeading = readOnly ? '入力詳細' : '明細編集';

  function updateActiveTaskSuggestionIndex(nextIndex: number | ((current: number) => number)) {
    const resolvedIndex =
      typeof nextIndex === 'function' ? nextIndex(activeTaskSuggestionIndexRef.current) : nextIndex;
    activeTaskSuggestionIndexRef.current = resolvedIndex;
    setActiveTaskSuggestionIndex(resolvedIndex);
  }

  function closeTaskSuggestions() {
    if (suggestionsRef.current) {
      suggestionsRef.current.open = false;
    }
  }

  function openTaskSuggestions(index = 0) {
    if (taskSuggestionChoices.length === 0) {
      return;
    }

    if (suggestionsRef.current) {
      suggestionsRef.current.open = true;
    }
    updateActiveTaskSuggestionIndex(Math.min(index, taskSuggestionChoices.length - 1));
  }

  function applyTaskSuggestion(task: string) {
    onChangeTask(entry.id, task);
    closeTaskSuggestions();
    taskInputRef.current?.focus();
  }

  function handleTaskSuggestionKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (taskSuggestionChoices.length === 0) {
      return;
    }

    const isSuggestionsOpen = suggestionsRef.current?.open === true;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!isSuggestionsOpen) {
        openTaskSuggestions(0);
        return;
      }
      updateActiveTaskSuggestionIndex((current) => (current + 1) % taskSuggestionChoices.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isSuggestionsOpen) {
        openTaskSuggestions(taskSuggestionChoices.length - 1);
        return;
      }
      updateActiveTaskSuggestionIndex((current) => (current - 1 + taskSuggestionChoices.length) % taskSuggestionChoices.length);
      return;
    }

    if (event.key === 'Enter' && isSuggestionsOpen && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      applyTaskSuggestion(taskSuggestionChoices[activeTaskSuggestionIndexRef.current] ?? taskSuggestionChoices[0]);
      return;
    }

    if (event.key === 'Escape' && isSuggestionsOpen) {
      event.preventDefault();
      closeTaskSuggestions();
      return;
    }

    if (
      isSuggestionsOpen &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.shiftKey &&
      /^[1-4]$/.test(event.key)
    ) {
      const nextIndex = Number(event.key) - 1;
      const nextTask = taskSuggestionChoices[nextIndex];
      if (nextTask) {
        event.preventDefault();
        applyTaskSuggestion(nextTask);
      }
    }
  }

  useEffect(() => {
    if (!autoFocus) {
      return;
    }

    if (!entry.projectCode.trim()) {
      onAutoFocusDone();
      return;
    }

    taskInputRef.current?.focus();
    onAutoFocusDone();
  }, [autoFocus, entry.projectCode, onAutoFocusDone]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (suggestionsRef.current?.open && !suggestionsRef.current.contains(event.target as Node)) {
        closeTaskSuggestions();
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  useEffect(() => {
    if (taskSuggestionChoices.length === 0) {
      closeTaskSuggestions();
      updateActiveTaskSuggestionIndex(0);
      return;
    }

    updateActiveTaskSuggestionIndex((current) => Math.min(current, taskSuggestionChoices.length - 1));
  }, [taskSuggestionChoices.length]);

  const currentPlaceDetail = entry.placeDetail?.[currentMode] ?? '';

  return (
    <section className={detailSectionClassName}>
      <div className="detail-pane__header">
        <div>
          <p className="section-label">{detailSectionLabel}</p>
          <h3>{detailHeading}</h3>
          <p>{`明細 #${detailNumber} / ${detailProjectLabel}`}</p>
        </div>
        <div className="detail-pane__header-actions">
          <span className="detail-index-badge">{`#${detailNumber}`}</span>
          {readOnly ? (
            <span className="status-pill is-partial">照会専用</span>
          ) : (
            <button type="button" className="icon-button detail-pane__remove-button" onClick={() => onRemoveProject(entry.id)}>
              {removeButtonLabel}
            </button>
          )}
        </div>
      </div>

      <fieldset className="detail-pane__fieldset" disabled={readOnly}>
        <div className="detail-pane__grid">
          <label
            className={[
              'field-stack',
              'field-stack--project',
              highlightedField === 'project' ? 'is-next-step' : '',
              guidedField === 'project' ? 'is-guide-target' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span>PJ</span>
            <ProjectMasterPicker
              catalog={board.projectCatalog}
              recentProjectCodes={recentProjectCodes}
              value={entry.projectSearch}
              selectedProjectCode={entry.projectCode}
              autoFocus={autoFocus && !entry.projectCode.trim()}
              onValueChange={(value) => onProjectSearchChange(entry.id, value)}
              onSelect={(project) => onProjectSelect(entry.id, project)}
              onSelectComplete={() => taskInputRef.current?.focus()}
            />
            <small>
              {entry.category ? categoryLabels[entry.category] : '未選択'}
              {selectedProject ? ` / 今月計画 ${formatHoursMinutesLabel(selectedProject.monthlyBudgetMinutes ?? 0)}` : ''}
            </small>
          </label>

          <div className="field-stack field-stack--place">
            <span>場所</span>
            <PlaceSwitcher
              value={entry.place[currentMode]}
              otherText={currentPlaceDetail}
              onChange={(place) => onChangePlace(entry.id, place)}
              onChangeOtherText={(value) => onChangePlaceDetail(entry.id, value)}
            />
            <small>
              {modeLabels[counterpartMode]} {getEntryPlaceDisplayLabel(entry, counterpartMode)}
            </small>
          </div>

          <label
            className={[
              'field-stack',
              'field-stack--task',
              highlightedField === 'task' ? 'is-next-step' : '',
              guidedField === 'task' ? 'is-guide-target' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span>タスク</span>
            <textarea
              className="task-field__textarea"
              ref={taskInputRef}
              rows={3}
              value={entry.taskName[currentMode]}
              placeholder="自由入力"
              onKeyDown={handleTaskSuggestionKeyDown}
              onChange={(event) => onChangeTask(entry.id, event.target.value)}
            />
            {!readOnly && taskSuggestions.length > 0 && (
              <details
                ref={suggestionsRef}
                className="compact-suggestions"
              >
                <summary>{`履歴候補 ${taskSuggestions.length}件`}</summary>
                <div className="chip-row">
                  {taskSuggestionChoices.map((task, index) => (
                    <button
                      key={task}
                      type="button"
                      tabIndex={-1}
                      aria-label={`候補${index + 1}: ${task}`}
                      className={index === activeTaskSuggestionIndex ? 'chip-button is-active' : 'chip-button'}
                      onMouseEnter={() => updateActiveTaskSuggestionIndex(index)}
                      onClick={() => applyTaskSuggestion(task)}
                    >
                      {task}
                    </button>
                  ))}
                </div>
              </details>
            )}
          </label>

          <div className="field-stack field-stack--time">
            <span>時間</span>
            <div className="type-switcher">
              {(['duration', 'range'] as ProjectTimeInputMode[]).map((mode, index, items) => (
                <button
                  key={mode}
                  type="button"
                  className={entry.timeInputMode[currentMode] === mode ? 'type-switcher__item is-active' : 'type-switcher__item'}
                  onClick={() => onChangeTimeInputMode(entry.id, mode)}
                  onKeyDown={(event) => {
                    const nextIndex = getNextSegmentIndex(index, items.length, event);
                    if (nextIndex === null) {
                      return;
                    }

                    event.preventDefault();
                    onChangeTimeInputMode(entry.id, items[nextIndex]);
                    focusSegmentButton(event.currentTarget, nextIndex);
                  }}
                >
                  {mode === 'duration' ? '時間数' : '時間帯'}
                </button>
              ))}
            </div>
            {entry.timeInputMode[currentMode] === 'duration' ? (
              <TimeEditor
                value={entry.minutes[currentMode]}
                onChange={(nextMinutes) => onChangeMinutes(entry.id, nextMinutes)}
                onStep={(deltaMinutes) => onStepMinutes(entry.id, deltaMinutes)}
              />
            ) : (
              <div className="range-editor">
                <QuarterHourStepper
                  label="開始"
                  value={entry.rangeStart[currentMode]}
                  fallbackValue={entry.rangeEnd[currentMode] || '09:00'}
                  onChange={(value) => onChangeRange(entry.id, 'rangeStart', value)}
                />
                <QuarterHourStepper
                  label="終了"
                  value={entry.rangeEnd[currentMode]}
                  fallbackValue={entry.rangeStart[currentMode] || '09:15'}
                  onChange={(value) => onChangeRange(entry.id, 'rangeEnd', value)}
                />
              </div>
            )}
            <small>
              {modeLabels[counterpartMode]} {formatMinutesDetailed(entry.minutes[counterpartMode])} / 差 {differenceLabel}
            </small>
          </div>

          <label className="field-stack field-stack--full">
            <span>メモ</span>
            <textarea
              className="detail-note-textarea"
              rows={2}
              value={entry.note[currentMode]}
              placeholder={entry.needsComment ? 'SESコメントや補足メモ' : '任意メモ'}
              onChange={(event) => onChangeNote(entry.id, event.target.value)}
            />
          </label>
        </div>
      </fieldset>
    </section>
  );
}

interface AuxDetailPaneProps {
  entry: AuxTimeEntry;
  detailNumber: number;
  lunchMinutes: number;
  readOnly?: boolean;
  onChangeAux: (entryId: string, field: 'startTime' | 'endTime' | 'note', value: string) => void;
  onChangeAuxType: (entryId: string, type: AuxEntryType) => void;
  onRemoveAux: (entryId: string) => void;
}

function AuxDetailPane({
  entry,
  detailNumber,
  lunchMinutes,
  readOnly = false,
  onChangeAux,
  onChangeAuxType,
  onRemoveAux,
}: AuxDetailPaneProps) {
  const duration = calculateTimeRangeMinutesExcludingLunch(entry.startTime, entry.endTime, lunchMinutes);
  const isRangeType = isAuxRangeType(entry.type);
  const detailSectionClassName = readOnly ? 'detail-pane detail-pane--aux detail-pane--read-only-ui' : 'detail-pane detail-pane--aux';
  const detailSectionLabel = readOnly ? 'readonly' : 'detail';
  const detailHeading = readOnly ? '入力詳細' : '明細編集';
  const annualLeaveGuideText =
    entry.type === 'annual-day'
      ? '1日休は FT清算時間を 0 固定で扱います。開始 / 終了や差分の警告は出しません。'
      : entry.type === 'annual-am'
        ? 'AM休は FT清算時間を 13:00〜17:00 の 4h 基準で計算します。1H休を追加すると、その基準からさらに 1h 引きます。'
        : entry.type === 'annual-pm'
          ? 'PM休は FT清算時間を 8:30〜12:00 の 3.5h 基準で計算します。1H休を追加すると、その基準からさらに 1h 引きます。'
          : entry.type === 'annual-hour'
            ? '1H休は分断と同じ時間帯入力です。FT清算時間の基準も 1h 減ります。'
            : '';

  return (
    <section className={detailSectionClassName}>
      <div className="detail-pane__header">
        <div>
          <p className="section-label">{detailSectionLabel}</p>
          <h3>{detailHeading}</h3>
          <p>{`明細 #${detailNumber} / ${getAuxTypeLabel(entry.type)}`}</p>
        </div>
        <div className="detail-pane__header-actions">
          <span className="detail-index-badge">{`#${detailNumber}`}</span>
          {readOnly ? (
            <span className="status-pill is-partial">照会専用</span>
          ) : (
            <button type="button" className="icon-button" onClick={() => onRemoveAux(entry.id)}>
              削除
            </button>
          )}
        </div>
      </div>

      <fieldset className="detail-pane__fieldset" disabled={readOnly}>
        <div className="detail-pane__grid">
          <div className="field-stack">
            <span>種類</span>
            <div className="type-switcher type-switcher--aux">
              <button
                type="button"
                className={entry.type === 'annual-day' ? 'type-switcher__item is-active' : 'type-switcher__item'}
                onClick={() => onChangeAuxType(entry.id, 'annual-day')}
              >
                1日休
              </button>
              <button
                type="button"
                className={entry.type === 'annual-am' ? 'type-switcher__item is-active' : 'type-switcher__item'}
                onClick={() => onChangeAuxType(entry.id, 'annual-am')}
              >
                AM休
              </button>
              <button
                type="button"
                className={entry.type === 'annual-pm' ? 'type-switcher__item is-active' : 'type-switcher__item'}
                onClick={() => onChangeAuxType(entry.id, 'annual-pm')}
              >
                PM休
              </button>
              <button
                type="button"
                className={entry.type === 'annual-hour' ? 'type-switcher__item is-active' : 'type-switcher__item'}
                onClick={() => onChangeAuxType(entry.id, 'annual-hour')}
              >
                1H休
              </button>
              <button
                type="button"
                className={entry.type === 'split' ? 'type-switcher__item is-active' : 'type-switcher__item'}
                onClick={() => onChangeAuxType(entry.id, 'split')}
              >
                分断
              </button>
              <button
                type="button"
                className={entry.type === 'break' ? 'type-switcher__item is-active' : 'type-switcher__item'}
                onClick={() => onChangeAuxType(entry.id, 'break')}
              >
                休憩
              </button>
            </div>
          </div>

          {isRangeType ? (
            <div className="field-stack field-stack--full">
              <span>時間帯</span>
              <div className="aux-detail-times">
                <QuarterHourStepper
                  label="開始"
                  value={entry.startTime}
                  fallbackValue={entry.endTime || (entry.type === 'split' ? '15:00' : entry.type === 'break' ? '12:30' : '15:00')}
                  onChange={(value) => onChangeAux(entry.id, 'startTime', value)}
                />
                <QuarterHourStepper
                  label="終了"
                  value={entry.endTime}
                  fallbackValue={entry.startTime || (entry.type === 'split' ? '15:15' : entry.type === 'break' ? '12:45' : '16:00')}
                  onChange={(value) => onChangeAux(entry.id, 'endTime', value)}
                />
              </div>
              <small>{duration === null ? '時間帯を確認してください' : `合計 ${formatMinutesDetailed(duration)}`}</small>
            </div>
          ) : (
            <div className="field-stack field-stack--full">
              <span>FT計算</span>
              <div className="aux-detail-note">{annualLeaveGuideText}</div>
            </div>
          )}

          <label className="field-stack field-stack--full">
            <span>メモ</span>
            <textarea
              rows={2}
              value={entry.note}
              placeholder={buildAuxEntryNotePlaceholder(entry.type)}
              onChange={(event) => onChangeAux(entry.id, 'note', event.target.value)}
            />
          </label>
        </div>
      </fieldset>
    </section>
  );
}

interface QuarterHourSelectProps {
  value: string;
  onChange: (value: string) => void;
}

function QuarterHourSelect({ value, onChange }: QuarterHourSelectProps) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">--:--</option>
      {quarterHourOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

interface QuarterHourStepperProps {
  label: string;
  value: string;
  fallbackValue: string;
  onChange: (value: string) => void;
}

function QuarterHourStepper({ label, value, fallbackValue, onChange }: QuarterHourStepperProps) {
  const minusStepMinutes = [30, 15];
  const plusStepMinutes = [15, 30];

  function handleStep(deltaMinutes: number) {
    onChange(stepTimeValue(value, deltaMinutes, fallbackValue));
  }

  return (
    <div className="time-stepper">
      <span className="time-stepper__label">{label}</span>
      <div className="time-stepper__main">
        {minusStepMinutes.map((minutes) => (
          <button
            key={`${label}-minus-${minutes}`}
            type="button"
            tabIndex={-1}
            className="step-button step-button--mini"
            onClick={() => handleStep(-minutes)}
          >
            {`-${minutes}`}
          </button>
        ))}
        <QuarterHourSelect value={value} onChange={onChange} />
        {plusStepMinutes.map((minutes) => (
          <button
            key={`${label}-plus-${minutes}`}
            type="button"
            tabIndex={-1}
            className="step-button step-button--mini"
            onClick={() => handleStep(minutes)}
          >
            {`+${minutes}`}
          </button>
        ))}
      </div>
    </div>
  );
}

interface SummaryTimeControlProps {
  value: string;
  quickValues: string[];
  onChange: (value: string) => void;
  onStep: (deltaMinutes: number) => void;
}

function SummaryTimeControl({ value, quickValues, onChange, onStep }: SummaryTimeControlProps) {
  const minusStepMinutes = [60, 30, 15];
  const plusStepMinutes = [15, 30, 60];

  return (
    <div className="summary-time-control">
      <div className="summary-time-control__main">
        {minusStepMinutes.map((minutes) => (
          <button
            key={`minus-${minutes}`}
            type="button"
            tabIndex={-1}
            className="step-button step-button--mini"
            onClick={() => onStep(-minutes)}
          >
            {`-${minutes}`}
          </button>
        ))}
        <QuarterHourSelect value={value} onChange={onChange} />
        {plusStepMinutes.map((minutes) => (
          <button
            key={`plus-${minutes}`}
            type="button"
            tabIndex={-1}
            className="step-button step-button--mini"
            onClick={() => onStep(minutes)}
          >
            {`+${minutes}`}
          </button>
          ))}
        </div>
      <div className="summary-time-control__quick">
        {quickValues.map((time) => (
          <button
            key={time}
            type="button"
            tabIndex={-1}
            className="chip-button chip-button--mini"
            onClick={() => onChange(time)}
          >
            {time}
          </button>
        ))}
      </div>
    </div>
  );
}

interface TimeEditorProps {
  value: number;
  onChange: (nextMinutes: number) => void;
  onStep: (deltaMinutes: number) => void;
}

function TimeEditor({ value, onChange, onStep }: TimeEditorProps) {
  const quickMinutes = [120, 240, 450];
  const minusStepHours = [1, 0.5, 0.25];
  const plusStepHours = [0.25, 0.5, 1];
  const displayValue = value <= 0 ? '' : String(Number((value / 60).toFixed(2)));

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const nextValue = Number(event.target.value);
    onChange(Number.isNaN(nextValue) ? 0 : roundToQuarter(nextValue * 60));
  }

  return (
    <div className="time-editor">
      <div className="time-editor__step-grid">
        {minusStepHours.map((hours) => (
          <button
            key={`minus-${hours}`}
            type="button"
            tabIndex={-1}
            className="step-button step-button--mini"
            onClick={() => onStep(-hours * 60)}
          >
            {`-${hours}h`}
          </button>
        ))}
        <input type="number" min={0} step={0.25} value={displayValue} onChange={handleChange} />
        {plusStepHours.map((hours) => (
          <button
            key={`plus-${hours}`}
            type="button"
            tabIndex={-1}
            className="step-button step-button--mini"
            onClick={() => onStep(hours * 60)}
          >
            {`+${hours}h`}
          </button>
        ))}
      </div>
      <div className="chip-row time-editor__quick-row">
        {quickMinutes.map((minutes) => (
          <button
            key={minutes}
            type="button"
            tabIndex={-1}
            className="chip-button time-editor__quick-button"
            onClick={() => onChange(minutes)}
          >
            {minutes === 450 ? '7.5h' : `${minutes / 60}h`}
          </button>
        ))}
      </div>
    </div>
  );
}

function getNextSegmentIndex(
  currentIndex: number,
  total: number,
  event: ReactKeyboardEvent<HTMLButtonElement>,
) {
  if (total <= 0) {
    return null;
  }

  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    return (currentIndex + 1) % total;
  }

  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    return (currentIndex - 1 + total) % total;
  }

  return null;
}

function getNextListIndex(
  currentIndex: number,
  total: number,
  event: ReactKeyboardEvent<HTMLElement>,
) {
  if (total <= 0) {
    return null;
  }

  if (event.key === 'ArrowDown') {
    return (currentIndex + 1) % total;
  }

  if (event.key === 'ArrowUp') {
    return (currentIndex - 1 + total) % total;
  }

  return null;
}

function focusSegmentButton(currentButton: HTMLButtonElement, nextIndex: number) {
  const group = currentButton.parentElement;
  if (!group) {
    return;
  }

  window.requestAnimationFrame(() => {
    const buttons = group.querySelectorAll<HTMLButtonElement>('button');
    buttons.item(nextIndex)?.focus();
  });
}

interface PlaceSwitcherProps {
  value: WorkPlace;
  otherText: string;
  onChange: (place: WorkPlace) => void;
  onChangeOtherText: (value: string) => void;
}

function PlaceSwitcher({ value, otherText, onChange, onChangeOtherText }: PlaceSwitcherProps) {
  return (
    <div className="place-switcher">
      {placeOptions.map((place, index) => (
        <button
          key={place}
          type="button"
          className={value === place ? 'place-switcher__item is-active' : 'place-switcher__item'}
          onClick={() => onChange(place)}
          onKeyDown={(event) => {
            const nextIndex = getNextSegmentIndex(index, placeOptions.length, event);
            if (nextIndex === null) {
              return;
            }

            event.preventDefault();
            onChange(placeOptions[nextIndex]);
            focusSegmentButton(event.currentTarget, nextIndex);
          }}
        >
          {placeLabels[place]}
        </button>
      ))}
      {value === 'other' ? (
        <input
          className="place-switcher__detail-input"
          type="text"
          size={4}
          value={otherText}
          onChange={(event) => onChangeOtherText(event.target.value)}
          aria-label="その他の場所"
          autoComplete="off"
          spellCheck={false}
        />
      ) : null}
    </div>
  );
}

interface QuickProjectDialogProps {
  isOpen: boolean;
  catalog: ProjectCatalogItem[];
  recentProjectCodes: string[];
  onQuickAddProject: (project: ProjectCatalogItem) => void;
  onClose: () => void;
}

function QuickProjectDialog({ isOpen, catalog, recentProjectCodes, onQuickAddProject, onClose }: QuickProjectDialogProps) {
  if (!isOpen) {
    return null;
  }

  function handleQuickAdd(project: ProjectCatalogItem) {
    onQuickAddProject(project);
    onClose();
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal-card modal-card--quick-projects"
        role="dialog"
        aria-modal="true"
        aria-label="よく使うPJ"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="section-header">
          <div>
            <p className="section-label">quick add</p>
            <h2>よく使うPJ</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            閉じる
          </button>
        </div>

        <QuickProjectSections
          catalog={catalog}
          recentProjectCodes={recentProjectCodes}
          onQuickAddProject={handleQuickAdd}
          className="quick-project-modal__body"
        />
      </section>
    </div>
  );
}

interface QuickProjectSectionsProps {
  catalog: ProjectCatalogItem[];
  recentProjectCodes: string[];
  onQuickAddProject: (project: ProjectCatalogItem) => void;
  className?: string;
}

function QuickProjectSections({ catalog, recentProjectCodes, onQuickAddProject, className }: QuickProjectSectionsProps) {
  const activeCatalog = catalog.filter((project) => isProjectCatalogItemActive(project));
  const pinnedProjects = activeCatalog.filter((project) => project.pinned);
  const recentProjects = resolveRecentProjects(activeCatalog, recentProjectCodes, { excludePinned: true });

  return (
    <div className={className}>
      <QuickProjectGroup title="ピン留め" projects={pinnedProjects} onQuickAddProject={onQuickAddProject} />
      <QuickProjectGroup title="最近使ったPJ" projects={recentProjects} onQuickAddProject={onQuickAddProject} />
    </div>
  );
}

interface QuickProjectGroupProps {
  title: string;
  projects: ProjectCatalogItem[];
  onQuickAddProject: (project: ProjectCatalogItem) => void;
}

function QuickProjectGroup({ title, projects, onQuickAddProject }: QuickProjectGroupProps) {
  if (projects.length === 0) {
    return null;
  }

  return (
    <section className="quick-group">
      <div className="quick-group__title">{title}</div>
        <div className="quick-group__list">
          {projects.map((project) => (
            <button
              key={project.projectCode}
              type="button"
              className="quick-project-card"
              onClick={() => onQuickAddProject(project)}
              title={formatProjectSearchLabel(project.projectCode, project.projectName)}
            >
              <strong>{formatProjectSearchLabel(project.projectCode, project.projectName)}</strong>
            </button>
          ))}
        </div>
      </section>
  );
}
