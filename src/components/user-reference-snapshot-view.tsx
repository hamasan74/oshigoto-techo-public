import { useEffect, useMemo, useState } from 'react';
import {
  calculateMonthlySummary,
  calculateInputBoardMetrics,
  collectInputBoardWarnings,
  formatDateLabel,
  formatMonthLabel,
  getModeInputStatus,
} from '../lib/input-board';
import type { ServerReferenceSession } from '../storage/server-user-reference';
import type { EntryMode } from '../types/input-board';
import { DailyWorkspace, MonthlyDayListView, MonthlySummaryView } from './daily-input-parts';

interface UserReferenceSnapshotViewProps {
  session: ServerReferenceSession;
  onBack: () => void;
}

function formatDateTimeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value;
  }

  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function buildAvailableReferenceDates(session: ServerReferenceSession) {
  const allDates = Object.keys(session.snapshot.recordsByDate)
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort();
  if (allDates.length <= 1) {
    return allDates;
  }

  const monthPrefix = session.snapshot.monthAnchorDate.slice(0, 7);
  const monthDates = allDates.filter((date) => date.startsWith(monthPrefix));
  const currentDate = session.snapshot.currentDate;
  if (monthDates.length >= 2 && monthDates.includes(currentDate)) {
    return monthDates;
  }

  return allDates;
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

function isModalDialogOpen() {
  return document.querySelector('.modal-card[role="dialog"]') !== null;
}

export function UserReferenceSnapshotView({
  session,
  onBack,
}: UserReferenceSnapshotViewProps) {
  const [referenceView, setReferenceView] = useState<'daily' | 'day-list' | 'monthly'>('daily');
  const availableDates = useMemo(() => buildAvailableReferenceDates(session), [session]);
  const [selectedDate, setSelectedDate] = useState(() =>
    availableDates.includes(session.snapshot.currentDate) ? session.snapshot.currentDate : availableDates[0] ?? session.snapshot.currentDate,
  );
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<EntryMode>('actual');
  const [selectedProjectCode, setSelectedProjectCode] = useState<string | null>(null);

  useEffect(() => {
    setSelectedDate(
      availableDates.includes(session.snapshot.currentDate)
        ? session.snapshot.currentDate
        : availableDates[0] ?? session.snapshot.currentDate,
    );
  }, [availableDates, session.snapshot.currentDate]);

  useEffect(() => {
    setReferenceView('daily');
    setSelectedProjectCode(null);
  }, [session.updatedAt, session.userId]);

  const baseBoard = session.snapshot.recordsByDate[selectedDate] ?? null;
  const fullReferenceSummary = useMemo(
    () => calculateMonthlySummary(session.snapshot.recordsByDate, session.snapshot.monthAnchorDate, session.snapshot.currentDate),
    [session.snapshot.currentDate, session.snapshot.monthAnchorDate, session.snapshot.recordsByDate],
  );
  const referenceDayListSummary = useMemo(
    () => ({
      ...fullReferenceSummary,
      days: fullReferenceSummary.days.filter((day) => availableDates.includes(day.date)),
    }),
    [availableDates, fullReferenceSummary],
  );
  const selectedReferenceProject = useMemo(
    () =>
      selectedProjectCode
        ? fullReferenceSummary.projects.find((project) => project.projectCode === selectedProjectCode) ?? null
        : null,
    [fullReferenceSummary.projects, selectedProjectCode],
  );

  useEffect(() => {
    setSelectedItemKey(null);
    setPreviewMode(baseBoard?.currentMode ?? 'actual');
  }, [baseBoard?.currentMode, selectedDate]);

  const board = useMemo(() => {
    if (!baseBoard) {
      return null;
    }

    return {
      ...baseBoard,
      currentMode: previewMode,
    };
  }, [baseBoard, previewMode]);

  const metrics = useMemo(() => (board ? calculateInputBoardMetrics(board) : null), [board]);
  const warnings = useMemo(
    () => (board ? collectInputBoardWarnings(board, board.currentMode) : []),
    [board],
  );
  const dayStatus = useMemo(() => (board ? getModeInputStatus(board, board.currentMode) : 'empty'), [board]);
  const currentAuxEntries = useMemo(
    () => (board ? board.auxEntries.filter((entry) => entry.mode === board.currentMode) : []),
    [board],
  );
  const recentTaskNamesByProject = useMemo(() => new Map<string, string[]>(), []);
  const selectedDateIndex = availableDates.indexOf(selectedDate);
  const previousDate = selectedDateIndex > 0 ? availableDates[selectedDateIndex - 1] : null;
  const nextDate = selectedDateIndex >= 0 && selectedDateIndex < availableDates.length - 1 ? availableDates[selectedDateIndex + 1] : null;
  const selectableItemKeys = useMemo(() => {
    if (!board) {
      return [];
    }

    return [
      ...board.projectEntries.map((entry) => `project:${entry.id}`),
      ...currentAuxEntries.map((entry) => `aux:${entry.id}`),
    ];
  }, [board, currentAuxEntries]);

  useEffect(() => {
    if (!selectedItemKey || selectableItemKeys.includes(selectedItemKey)) {
      return;
    }

    setSelectedItemKey(null);
  }, [selectableItemKeys, selectedItemKey]);

  useEffect(() => {
    if (selectedItemKey || selectableItemKeys.length === 0) {
      return;
    }

    setSelectedItemKey(selectableItemKeys[0]);
  }, [selectableItemKeys, selectedItemKey]);

  function shiftSelectedDate(delta: 1 | -1) {
    if (delta === -1 && previousDate) {
      setSelectedDate(previousDate);
    }

    if (delta === 1 && nextDate) {
      setSelectedDate(nextDate);
    }
  }

  function moveSelectedItem(delta: 1 | -1) {
    if (!selectableItemKeys.length) {
      return;
    }

    if (!selectedItemKey) {
      setSelectedItemKey(delta > 0 ? selectableItemKeys[0] : selectableItemKeys[selectableItemKeys.length - 1]);
      return;
    }

    const currentIndex = selectableItemKeys.indexOf(selectedItemKey);
    const baseIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (baseIndex + delta + selectableItemKeys.length) % selectableItemKeys.length;
    setSelectedItemKey(selectableItemKeys[nextIndex]);
  }

  function openDailyView() {
    setReferenceView('daily');
  }

  function openDayListView() {
    setSelectedProjectCode(null);
    setReferenceView('day-list');
  }

  function openMonthlyView() {
    setReferenceView('monthly');
  }

  useEffect(() => {
    function handleKeyboardShortcut(event: KeyboardEvent) {
      if (referenceView !== 'daily' || event.isComposing || isModalDialogOpen()) {
        return;
      }

      const key = event.key.toLowerCase();

      if (event.ctrlKey || event.metaKey || !event.altKey) {
        return;
      }

      if (key === 'arrowup') {
        event.preventDefault();
        setPreviewMode('plan');
        return;
      }

      if (key === 'arrowdown') {
        event.preventDefault();
        setPreviewMode('actual');
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

      if (key === 'arrowleft' && previousDate) {
        event.preventDefault();
        setSelectedDate(previousDate);
        return;
      }

      if (key === 'arrowright' && nextDate) {
        event.preventDefault();
        setSelectedDate(nextDate);
      }
    }

    window.addEventListener('keydown', handleKeyboardShortcut);
    return () => {
      window.removeEventListener('keydown', handleKeyboardShortcut);
    };
  }, [nextDate, previousDate, referenceView]);

  if (!board || !metrics) {
    return (
      <section className="workspace workspace--project-master workspace--user-reference-preview">
        <div className="toolbar-shell toolbar-shell--project-master user-reference-preview-toolbar user-reference-toolbar--compact">
          <div className="user-reference-preview-toolbar__identity">
            <p className="section-label">照会中</p>
            <h2>照会データを開けませんでした</h2>
            <p>保存済みスナップショットに対象の日付が含まれていません。</p>
          </div>
          <div className="project-master-detail__actions user-reference-preview-toolbar__actions">
            <button type="button" className="ghost-button" onClick={onBack}>
              利用者参照に戻る
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="workspace workspace--project-master workspace--user-reference-preview">
      <div className="toolbar-shell toolbar-shell--project-master user-reference-preview-toolbar user-reference-toolbar--compact">
        <div className="user-reference-preview-toolbar__identity">
          <div>
            <p className="section-label">照会中</p>
            <h2>{`${session.userName || session.userId}`}</h2>
          </div>
          <div className="user-reference-preview-toolbar__meta">
            <span className="user-reference-preview-toolbar__meta-text">{`${formatMonthLabel(session.snapshot.monthAnchorDate)} / ${availableDates.length}日分`}</span>
            <span className="user-reference-preview-toolbar__meta-text">{`${formatDateLabel(selectedDate)} を表示中`}</span>
            <small>{`最終保存 ${formatDateTimeLabel(session.updatedAt)}`}</small>
          </div>
        </div>

        <div className="user-reference-preview-toolbar__tools">
          <div className="user-reference-preview-toolbar__nav">
            <div
              className="window-tabset user-reference-preview-tabset"
              role="tablist"
              aria-label="照会表示切り替え"
            >
              <button
                type="button"
                className={referenceView === 'daily' ? 'window-tabset__item is-active' : 'window-tabset__item'}
                onClick={openDailyView}
              >
                日入力
              </button>
              <button
                type="button"
                className={referenceView === 'day-list' ? 'window-tabset__item is-active' : 'window-tabset__item'}
                onClick={openDayListView}
              >
                日一覧
              </button>
              <button
                type="button"
                className={referenceView === 'monthly' ? 'window-tabset__item is-active' : 'window-tabset__item'}
                onClick={openMonthlyView}
              >
                月集計
              </button>
            </div>
            <button
              type="button"
              className="ghost-button user-reference-preview-toolbar__back"
              onClick={onBack}
            >
              利用者参照に戻る
            </button>
          </div>
        </div>
      </div>

      {referenceView === 'daily' ? (
        <>
          <DailyWorkspace
            board={board}
            recentProjectCodes={[]}
            recentTaskNamesByProject={recentTaskNamesByProject}
            metrics={metrics}
            warnings={warnings}
            readOnly
            compactToolbar
            heroLabel="reference preview"
            guideEnabled={false}
            greetingEnabled={false}
            simpleModeEnabled={false}
            currentUserId={session.userId}
            currentUserName={session.userName}
            selectedItemKey={selectedItemKey}
            currentAuxEntries={currentAuxEntries}
            dayStatus={dayStatus}
            isCalendarOpen={false}
            calendarMonthLabel={formatMonthLabel(session.snapshot.monthAnchorDate)}
            calendarDays={[]}
            canCopyPreviousDay={false}
            canCopyPreviousWeek={false}
            canCopyPlanToActual={false}
            canSendMail={false}
            mailSendDisabledReason="照会モードではメール送信できません。"
            isMailSending={false}
            mailSendError={null}
            mailSendSuccessMessage={null}
            autoFocusProjectId={null}
            draggingProjectId={null}
            isQuickProjectDialogOpen={false}
            onToggleCalendar={() => {}}
            onCloseCalendar={() => {}}
            onOpenQuickProjectDialog={() => {}}
            onCloseQuickProjectDialog={() => {}}
            onShiftCalendarMonth={() => {}}
            onSelectDate={(date) => {
              if (availableDates.includes(date)) {
                setSelectedDate(date);
              }
            }}
            onShiftDate={(deltaDays) => {
              if (deltaDays < 0) {
                shiftSelectedDate(-1);
              }
              if (deltaDays > 0) {
                shiftSelectedDate(1);
              }
            }}
            onCopyPreviousDay={() => {}}
            onCopyPreviousWeek={() => {}}
            onCopyPlanToActual={() => {}}
            onModeChange={setPreviewMode}
            onSendMail={() => {}}
            onAddBlankRow={() => {}}
            onAddAux={() => {}}
            onQuickAddProject={() => {}}
            onSelectProjectEntry={(entryId) => setSelectedItemKey(`project:${entryId}`)}
            onSelectAuxEntry={(entryId) => setSelectedItemKey(`aux:${entryId}`)}
            onProjectDragStart={() => {}}
            onProjectDrop={() => {}}
            onProjectSearchChange={() => {}}
            onProjectSelect={() => {}}
            onChangeProjectTimeInputMode={() => {}}
            onChangeProjectRange={() => {}}
            onChangeTask={() => {}}
            onChangeMinutes={() => {}}
            onStepMinutes={() => {}}
            onChangePlace={() => {}}
            onChangePlaceDetail={() => {}}
            onChangeNote={() => {}}
            onRemoveProject={() => {}}
            onChangeSummaryTime={() => {}}
            onStepSummaryTime={() => {}}
            onChangeAux={() => {}}
            onChangeAuxType={() => {}}
            onRemoveAux={() => {}}
            onMoveSelectedItem={moveSelectedItem}
            onAutoFocusDone={() => {}}
          />
        </>
      ) : referenceView === 'day-list' ? (
        <MonthlyDayListView
          summary={referenceDayListSummary}
          selectedProject={selectedReferenceProject}
          readOnly={false}
          monthlyNavigationEnabled={false}
          backLabel={selectedReferenceProject ? '月集計へ戻る' : '日入力へ戻る'}
          onShiftMonth={() => {}}
          onOpenDate={(date) => {
            if (availableDates.includes(date)) {
              setSelectedDate(date);
              setReferenceView('daily');
            }
          }}
          onOpenMonthly={() => setReferenceView(selectedReferenceProject ? 'monthly' : 'daily')}
          onClearProjectScope={() => setSelectedProjectCode(null)}
        />
      ) : (
        <MonthlySummaryView
          summary={fullReferenceSummary}
          monthAnchorDate={session.snapshot.monthAnchorDate}
          readOnly
          monthlyNavigationEnabled={false}
          onShiftMonth={() => {}}
          onOpenDate={(date) => {
            if (availableDates.includes(date)) {
              setSelectedDate(date);
              setReferenceView('daily');
            }
          }}
          onChangeProjectBudget={() => {}}
          onOpenDayList={(projectCode) => {
            setSelectedProjectCode(projectCode?.trim() ? projectCode : null);
            setReferenceView('day-list');
          }}
          onOpenProjectMaster={() => {}}
        />
      )}
    </section>
  );
}
