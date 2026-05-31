import { useEffect, useState } from 'react';
import { MonthlyOverviewCard } from './daily-input-parts';
import {
  categoryLabels,
  formatHoursDecimal,
  formatMinutesDetailed,
  isProjectCatalogItemActive,
  normalizeProjectCode,
  placeLabels,
  searchProjectCatalog,
} from '../lib/input-board';
import type { MonthlyProjectSummary } from '../lib/input-board';
import type { ProjectCatalogItem, ProjectCategory, WorkPlace } from '../types/input-board';

type ProjectStatusFilter = 'all' | 'active' | 'inactive';

interface ProjectMasterAdminProps {
  catalog: ProjectCatalogItem[];
  monthlyProjects: MonthlyProjectSummary[];
  monthLabel: string;
  onShiftMonth: (deltaMonths: number) => void;
  onSaveProject: (nextProject: ProjectCatalogItem, previousProjectCode?: string) => void;
}

interface ProjectMasterFormState {
  projectCode: string;
  projectName: string;
  timesheetProjectLabel: string;
  category: ProjectCategory;
  defaultTaskName: string;
  defaultPlace: WorkPlace;
  aliasesText: string;
  recentTaskNamesText: string;
  isActive: boolean;
  pinned: boolean;
  needsComment: boolean;
}

const statusFilterLabels: Record<ProjectStatusFilter, string> = {
  all: '全部',
  active: '有効',
  inactive: '無効',
};

function splitTextValues(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\n,、]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function createEmptyFormState(): ProjectMasterFormState {
  return {
    projectCode: '',
    projectName: '',
    timesheetProjectLabel: '',
    category: 'direct',
    defaultTaskName: '',
    defaultPlace: 'office',
    aliasesText: '',
    recentTaskNamesText: '',
    isActive: true,
    pinned: false,
    needsComment: false,
  };
}

function createFormState(project: ProjectCatalogItem): ProjectMasterFormState {
  return {
    projectCode: project.projectCode,
    projectName: project.projectName,
    timesheetProjectLabel: project.timesheetProjectLabel ?? '',
    category: project.category,
    defaultTaskName: project.defaultTaskName ?? '',
    defaultPlace: project.defaultPlace ?? 'office',
    aliasesText: (project.aliases ?? []).join('\n'),
    recentTaskNamesText: project.recentTaskNames.join('\n'),
    isActive: isProjectCatalogItemActive(project),
    pinned: Boolean(project.pinned),
    needsComment: Boolean(project.needsComment),
  };
}

function buildProjectStatusTone(project: ProjectCatalogItem) {
  return isProjectCatalogItemActive(project) ? 'is-done' : 'is-empty';
}

function countProjectTaskCandidates(project: ProjectCatalogItem) {
  return new Set([project.defaultTaskName, ...(project.recentTaskNames ?? [])].filter(Boolean)).size;
}

function buildProjectSavePayload(
  form: ProjectMasterFormState,
  currentProject: ProjectCatalogItem | null,
): ProjectCatalogItem {
  const aliases = splitTextValues(form.aliasesText);
  const taskCandidates = splitTextValues(form.recentTaskNamesText);
  const defaultTaskName = form.defaultTaskName.trim() || taskCandidates[0] || undefined;
  const recentTaskNames = Array.from(new Set([defaultTaskName, ...taskCandidates].filter(Boolean))) as string[];

  return {
    projectCode: form.projectCode.trim(),
    projectName: form.projectName.trim(),
    timesheetProjectLabel: form.timesheetProjectLabel.trim() || undefined,
    category: form.category,
    monthlyBudgetMinutes: currentProject?.monthlyBudgetMinutes ?? 0,
    defaultTaskName,
    defaultPlace: form.defaultPlace,
    isActive: form.isActive,
    pinned: form.pinned,
    needsComment: form.needsComment,
    aliases,
    recentTaskNames,
  };
}

export function ProjectMasterAdmin({
  catalog,
  monthlyProjects,
  monthLabel,
  onShiftMonth,
  onSaveProject,
}: ProjectMasterAdminProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatusFilter>('active');
  const [selectedProjectCode, setSelectedProjectCode] = useState<string | null>(catalog[0]?.projectCode ?? null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [form, setForm] = useState<ProjectMasterFormState>(() =>
    catalog[0] ? createFormState(catalog[0]) : createEmptyFormState(),
  );

  const monthlyProjectMap = new Map(monthlyProjects.map((project) => [normalizeProjectCode(project.projectCode), project]));
  const hasQuery = searchQuery.trim() !== '';
  const filteredCatalogBase = hasQuery
    ? searchProjectCatalog(catalog, searchQuery, { includeInactive: true })
    : [...catalog].sort((left, right) => {
        if (isProjectCatalogItemActive(left) !== isProjectCatalogItemActive(right)) {
          return isProjectCatalogItemActive(left) ? -1 : 1;
        }

        const leftActualMinutes = monthlyProjectMap.get(normalizeProjectCode(left.projectCode))?.actualMinutes ?? 0;
        const rightActualMinutes = monthlyProjectMap.get(normalizeProjectCode(right.projectCode))?.actualMinutes ?? 0;
        if (leftActualMinutes !== rightActualMinutes) {
          return rightActualMinutes - leftActualMinutes;
        }

        if (left.pinned !== right.pinned) {
          return left.pinned ? -1 : 1;
        }

        return left.projectCode.localeCompare(right.projectCode, 'ja');
      });
  const filteredCatalog = filteredCatalogBase.filter((project) => {
      if (statusFilter === 'active') {
        return isProjectCatalogItemActive(project);
      }

      if (statusFilter === 'inactive') {
        return !isProjectCatalogItemActive(project);
      }

      return true;
    });

  const selectedProject = selectedProjectCode
    ? catalog.find((project) => normalizeProjectCode(project.projectCode) === normalizeProjectCode(selectedProjectCode)) ?? null
    : null;
  const selectedMonthlyProject = selectedProject
    ? monthlyProjectMap.get(normalizeProjectCode(selectedProject.projectCode)) ?? null
    : null;
  const activeCount = catalog.filter((project) => isProjectCatalogItemActive(project)).length;
  const pinnedCount = catalog.filter((project) => project.pinned).length;
  const directCount = catalog.filter((project) => project.category === 'direct').length;
  const indirectCount = catalog.filter((project) => project.category === 'indirect').length;
  const commentNeededCount = catalog.filter((project) => project.needsComment).length;
  const aliasReadyCount = catalog.filter((project) => (project.aliases?.length ?? 0) > 0).length;
  const taskCandidateReadyCount = catalog.filter((project) => countProjectTaskCandidates(project) > 0).length;
  const monthlyActualTotal = monthlyProjects.reduce((total, project) => total + project.actualMinutes, 0);

  useEffect(() => {
    if (isCreatingNew) {
      return;
    }

    if (selectedProject) {
      return;
    }

    const fallbackProject = filteredCatalog[0] ?? catalog[0] ?? null;
    if (!fallbackProject) {
      setSelectedProjectCode(null);
      setForm(createEmptyFormState());
      return;
    }

    setSelectedProjectCode(fallbackProject.projectCode);
    setForm(createFormState(fallbackProject));
  }, [catalog, filteredCatalog, isCreatingNew, selectedProject]);

  const normalizedOriginalCode = normalizeProjectCode(selectedProject?.projectCode ?? '');
  const duplicateProject = catalog.find((project) => {
    const normalizedCandidateCode = normalizeProjectCode(project.projectCode);
    return (
      normalizedCandidateCode === normalizeProjectCode(form.projectCode) &&
      normalizedCandidateCode !== normalizedOriginalCode
    );
  });
  const canSave = form.projectCode.trim() !== '' && form.projectName.trim() !== '' && !duplicateProject;

  function handleSelectProject(project: ProjectCatalogItem) {
    setSelectedProjectCode(project.projectCode);
    setIsCreatingNew(false);
    setForm(createFormState(project));
  }

  function handleCreateNewProject() {
    setSelectedProjectCode(null);
    setIsCreatingNew(true);
    setForm(createEmptyFormState());
  }

  function handleSaveProject() {
    if (!canSave) {
      return;
    }

    const nextProject = buildProjectSavePayload(form, selectedProject);
    onSaveProject(nextProject, isCreatingNew ? undefined : selectedProject?.projectCode);
    setSelectedProjectCode(nextProject.projectCode);
    setIsCreatingNew(false);
  }

  return (
    <section className="project-master-shell workspace workspace--project-master">
      <div className="toolbar-shell toolbar-shell--hero toolbar-shell--project-master project-master-toolbar">
        <div className="toolbar-shell__intro">
          <div>
            <p className="section-label">project master</p>
            <h2>PJマスタ管理</h2>
          </div>
          <div className="toolbar-shell__chips">
            <span className="toolbar-shell__chip">直接 {directCount}件</span>
            <span className="toolbar-shell__chip">間接 {indirectCount}件</span>
            {commentNeededCount > 0 && <span className="toolbar-shell__chip is-caution">要コメント {commentNeededCount}件</span>}
          </div>
        </div>
        <div className="project-master-toolbar__actions">
          <div className="month-shift">
            <button type="button" className="ghost-button" onClick={() => onShiftMonth(-1)}>
              前月
            </button>
            <strong>{monthLabel}</strong>
            <button type="button" className="ghost-button" onClick={() => onShiftMonth(1)}>
              次月
            </button>
          </div>
          <button type="button" className="secondary-button" onClick={handleCreateNewProject}>
            新規追加
          </button>
        </div>
      </div>

      <div className="monthly-cards monthly-cards--compact">
        <MonthlyOverviewCard
          label="有効PJ"
          value={`${activeCount}件`}
          detail="日入力で候補に出るPJ"
          tone="neutral"
        />
        <MonthlyOverviewCard
          label="ピン留め"
          value={`${pinnedCount}件`}
          detail="すぐ呼び出せるお気に入り"
          tone="info"
        />
        <MonthlyOverviewCard
          label="今月実績"
          value={formatHoursDecimal(monthlyActualTotal)}
          detail={`${monthLabel}の参照情報`}
          tone="neutral"
          metaItems={[
            { label: '直接', value: `${directCount}件` },
            { label: '間接', value: `${indirectCount}件` },
          ]}
        />
        <MonthlyOverviewCard
          label="作業候補"
          value={`${taskCandidateReadyCount}件`}
          detail="日入力で候補を出せるPJ"
          tone={taskCandidateReadyCount < activeCount ? 'caution' : 'info'}
          metaItems={[
            { label: '別名あり', value: `${aliasReadyCount}件` },
            { label: '要コメント', value: `${commentNeededCount}件` },
          ]}
        />
      </div>

      <div className="project-master-layout">
        <section className="board-list-shell project-master-list">
          <div className="section-header">
            <div>
              <p className="section-label">catalog</p>
              <h3>PJ一覧</h3>
              <p>{`${filteredCatalog.length}件表示 / 全${catalog.length}件`}</p>
            </div>
          </div>

          <div className="project-master-search">
            <input
              type="search"
              value={searchQuery}
              placeholder="PJCD / PJ名 / 別名 / 作業候補で検索"
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <div className="chip-row">
              {(Object.keys(statusFilterLabels) as ProjectStatusFilter[]).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  className={statusFilter === filter ? 'chip-button is-active' : 'chip-button'}
                  onClick={() => setStatusFilter(filter)}
                >
                  {statusFilterLabels[filter]}
                </button>
              ))}
            </div>
          </div>

          <div className="detail-list project-master-list__items">
            {filteredCatalog.length === 0 ? (
              <div className="detail-list__empty">条件に合うPJがありません。</div>
            ) : (
              filteredCatalog.map((project) => {
                const monthlyProject = monthlyProjectMap.get(normalizeProjectCode(project.projectCode)) ?? null;
                const isSelected =
                  !isCreatingNew &&
                  selectedProjectCode !== null &&
                  normalizeProjectCode(project.projectCode) === normalizeProjectCode(selectedProjectCode);

                return (
                  <button
                    key={project.projectCode}
                    type="button"
                    className={isSelected ? 'project-master-row is-selected' : 'project-master-row'}
                    onClick={() => handleSelectProject(project)}
                  >
                    <div className="project-master-row__main">
                      <div className="project-master-row__title">
                        <strong>{project.projectCode}</strong>
                        <span>{project.projectName}</span>
                      </div>
                      <div className="project-master-row__meta">
                        <span className={`status-pill ${buildProjectStatusTone(project)}`}>
                          {isProjectCatalogItemActive(project) ? '有効' : '無効'}
                        </span>
                        <span className="chip-button chip-button--mini">{categoryLabels[project.category]}</span>
                        {project.pinned && <span className="chip-button chip-button--mini">ピン留め</span>}
                      </div>
                      <p className="project-master-row__task-preview">
                        {project.defaultTaskName || project.recentTaskNames[0] || '代表作業候補なし'}
                      </p>
                      {project.timesheetProjectLabel ? (
                        <p className="project-master-row__timesheet-label">{`転記名: ${project.timesheetProjectLabel}`}</p>
                      ) : null}
                    </div>
                    <div className="project-master-row__hours">
                      <span>{`実績 ${formatHoursDecimal(monthlyProject?.actualMinutes ?? 0)}`}</span>
                      <span>{`候補 ${countProjectTaskCandidates(project)}件`}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <aside className="detail-pane-shell">
          <div className="detail-pane project-master-detail">
            <div className="detail-pane__header">
              <div className="project-master-detail__header-copy">
                <p className="section-label">editor</p>
                <h3>
                  {isCreatingNew
                    ? '新規PJ'
                    : selectedProject
                      ? `${form.projectName.trim() || form.projectCode.trim() || selectedProject.projectName || selectedProject.projectCode} を編集`
                      : 'PJを選択'}
                </h3>
              </div>
              {!isCreatingNew && selectedProject && (
                <span className={`status-pill ${buildProjectStatusTone(selectedProject)}`}>
                  {isProjectCatalogItemActive(selectedProject) ? '利用中' : '非表示'}
                </span>
              )}
            </div>

            <div className="detail-pane__grid">
              <label className="field-stack">
                <span>PJCD</span>
                <input
                  type="text"
                  value={form.projectCode}
                  placeholder="例: CDH1203F10"
                  onChange={(event) => setForm((current) => ({ ...current, projectCode: event.target.value }))}
                />
              </label>

              <label className="field-stack">
                <span>PJ名</span>
                <input
                  type="text"
                  value={form.projectName}
                  placeholder="PJ名を入力"
                  onChange={(event) => setForm((current) => ({ ...current, projectName: event.target.value }))}
                />
              </label>

              <label className="field-stack field-stack--full">
                <span>就業管理システム表示名</span>
                <input
                  type="text"
                  value={form.timesheetProjectLabel}
                  placeholder="例: ﾏﾈｼﾞﾒﾝﾄ"
                  onChange={(event) =>
                    setForm((current) => ({ ...current, timesheetProjectLabel: event.target.value }))
                  }
                />
                <small>転記確認で使う名称です。手帳上の PJ名とは分けて管理できます。</small>
              </label>

              <div className="field-stack field-stack--full">
                <span>分類</span>
                <div className="chip-row project-master-chip-row">
                  {(['direct', 'indirect'] as ProjectCategory[]).map((category) => (
                    <button
                      key={category}
                      type="button"
                      className={form.category === category ? 'chip-button is-active' : 'chip-button'}
                      onClick={() => setForm((current) => ({ ...current, category }))}
                    >
                      {categoryLabels[category]}
                    </button>
                  ))}
                </div>
              </div>

              <label className="field-stack">
                <span>代表作業</span>
                <input
                  type="text"
                  value={form.defaultTaskName}
                  placeholder="候補の先頭に出したい作業名"
                  onChange={(event) => setForm((current) => ({ ...current, defaultTaskName: event.target.value }))}
                />
              </label>

              <label className="field-stack">
                <span>標準場所</span>
                <select
                  value={form.defaultPlace}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, defaultPlace: event.target.value as WorkPlace }))
                  }
                >
                  {(Object.keys(placeLabels) as WorkPlace[]).map((place) => (
                    <option key={place} value={place}>
                      {placeLabels[place]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-stack field-stack--full">
                <span>検索用別名</span>
                <textarea
                  value={form.aliasesText}
                  placeholder="改行または , 区切りで入力"
                  onChange={(event) => setForm((current) => ({ ...current, aliasesText: event.target.value }))}
                />
              </label>

              <label className="field-stack field-stack--full">
                <span>作業候補</span>
                <textarea
                  value={form.recentTaskNamesText}
                  placeholder="1行1候補。日入力では履歴候補として表示します。"
                  onChange={(event) =>
                    setForm((current) => ({ ...current, recentTaskNamesText: event.target.value }))
                  }
                />
              </label>

              <div className="field-stack field-stack--full">
                <span>表示設定</span>
                <div className="project-master-toggle-grid">
                  <label className="project-master-toggle">
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
                    />
                    有効
                  </label>
                  <label className="project-master-toggle">
                    <input
                      type="checkbox"
                      checked={form.pinned}
                      onChange={(event) => setForm((current) => ({ ...current, pinned: event.target.checked }))}
                    />
                    ピン留め
                  </label>
                  <label className="project-master-toggle">
                    <input
                      type="checkbox"
                      checked={form.needsComment}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, needsComment: event.target.checked }))
                      }
                    />
                    コメント推奨
                  </label>
                </div>
              </div>
            </div>

            <section className="project-master-reference-card">
              <div className="project-master-reference-card__head">
                <div>
                  <p className="section-label">monthly reference</p>
                  <h4>{`${monthLabel} の参照値`}</h4>
                </div>
                <small>月次計画の編集は月集計画面から行います。ここでは参照のみです。</small>
              </div>
              <div className="project-master-reference-card__grid">
                <div>
                  <span>月次計画</span>
                  <strong>{formatMinutesDetailed(selectedProject?.monthlyBudgetMinutes ?? 0)}</strong>
                </div>
                <div>
                  <span>今月実績</span>
                  <strong>{formatMinutesDetailed(selectedMonthlyProject?.actualMinutes ?? 0)}</strong>
                </div>
                <div>
                  <span>差分</span>
                  <strong>{formatMinutesDetailed(selectedMonthlyProject?.differenceMinutes ?? 0)}</strong>
                </div>
                <div>
                  <span>稼働日数</span>
                  <strong>{selectedMonthlyProject?.activeDays ?? 0}日</strong>
                </div>
              </div>
            </section>

            {duplicateProject && (
              <div className="detail-pane__empty">
                {`PJCD ${duplicateProject.projectCode} はすでに登録済みです。別のコードにしてください。`}
              </div>
            )}

            <div className="project-master-detail__actions">
              {!isCreatingNew && selectedProject && (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setForm(createFormState(selectedProject))}
                >
                  変更を戻す
                </button>
              )}
              <button type="button" className="primary-button" onClick={handleSaveProject} disabled={!canSave}>
                保存
              </button>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
