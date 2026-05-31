import { normalizeProjectCode, updateProjectCatalogBudget } from '../lib/input-board';
import type { InputBoardDraft, ProjectCatalogItem } from '../types/input-board';
import { getLatestProjectCatalog } from './project-master-storage';

export type MonthlyPlanningSnapshot = Record<string, Record<string, number>>;

// `monthlyBudgetMinutes` still lives inside `projectCatalog` for now, but
// conceptually this module owns the "monthly planning" responsibility.

export function collectMonthlyPlanning(records: Record<string, InputBoardDraft>) {
  return Object.values(records).reduce<MonthlyPlanningSnapshot>((snapshot, draft) => {
    const monthKey = draft.date.slice(0, 7);
    const monthlyPlanning = snapshot[monthKey] ?? {};

    for (const project of draft.projectCatalog) {
      const normalizedProjectCode = normalizeProjectCode(project.projectCode);
      if (!normalizedProjectCode || project.monthlyBudgetMinutes === undefined) {
        continue;
      }

      monthlyPlanning[normalizedProjectCode] = project.monthlyBudgetMinutes;
    }

    snapshot[monthKey] = monthlyPlanning;
    return snapshot;
  }, {});
}

interface SetMonthlyBudgetForRecordsOptions {
  monthKey: string;
  fallbackCatalog: ProjectCatalogItem[];
  createBoardForDate: (date: string, projectCatalog: ProjectCatalogItem[]) => InputBoardDraft;
}

export function setMonthlyBudgetForRecords(
  records: Record<string, InputBoardDraft>,
  projectCode: string,
  nextBudgetMinutes: number,
  options: SetMonthlyBudgetForRecordsOptions,
) {
  const normalizedProjectCode = normalizeProjectCode(projectCode);
  let updated = false;
  const nextRecords: Record<string, InputBoardDraft> = {};

  for (const [date, draft] of Object.entries(records)) {
    if (!date.startsWith(options.monthKey)) {
      nextRecords[date] = draft;
      continue;
    }

    const hasProject = draft.projectCatalog.some(
      (project) => normalizeProjectCode(project.projectCode) === normalizedProjectCode,
    );

    nextRecords[date] = hasProject
      ? {
          ...draft,
          projectCatalog: updateProjectCatalogBudget(
            draft.projectCatalog,
            normalizedProjectCode,
            nextBudgetMinutes,
          ),
        }
      : draft;
    updated ||= hasProject;
  }

  if (updated) {
    return nextRecords;
  }

  const templateDate = `${options.monthKey}-01`;
  const templateDraft = options.createBoardForDate(
    templateDate,
    getLatestProjectCatalog(records, options.fallbackCatalog),
  );
  const hasProjectInTemplate = templateDraft.projectCatalog.some(
    (project) => normalizeProjectCode(project.projectCode) === normalizedProjectCode,
  );

  if (!hasProjectInTemplate) {
    return records;
  }

  return {
    ...records,
    [templateDate]: {
      ...templateDraft,
      projectCatalog: updateProjectCatalogBudget(
        templateDraft.projectCatalog,
        normalizedProjectCode,
        nextBudgetMinutes,
      ),
    },
  };
}
