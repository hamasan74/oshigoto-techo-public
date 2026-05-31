import {
  formatProjectSearchLabel,
  normalizeProjectCode,
  upsertProjectCatalogItem,
} from '../lib/input-board';
import type { InputBoardDraft, ProjectCatalogItem, ProjectEntry } from '../types/input-board';

function mergeProjectCatalogForDraft(draftCatalog: ProjectCatalogItem[], masterCatalog: ProjectCatalogItem[]) {
  return masterCatalog.map((project) => {
    const currentProject = draftCatalog.find(
      (item) => normalizeProjectCode(item.projectCode) === normalizeProjectCode(project.projectCode),
    );

    return currentProject
      ? {
          ...project,
          monthlyBudgetMinutes: currentProject.monthlyBudgetMinutes ?? project.monthlyBudgetMinutes,
        }
      : project;
  });
}

function syncProjectEntriesWithCatalogUpdate(
  projectEntries: ProjectEntry[],
  nextProject: ProjectCatalogItem,
  previousProjectCode?: string,
) {
  const normalizedPreviousCode = normalizeProjectCode(previousProjectCode ?? nextProject.projectCode);

  return projectEntries.map((entry) =>
    normalizeProjectCode(entry.projectCode) !== normalizedPreviousCode
      ? entry
      : {
          ...entry,
          projectSearch: formatProjectSearchLabel(nextProject.projectCode, nextProject.projectName),
          projectCode: nextProject.projectCode,
          projectName: nextProject.projectName,
          category: nextProject.category,
          needsComment: Boolean(nextProject.needsComment),
          recentTaskNames: Array.from(new Set([...nextProject.recentTaskNames, ...entry.recentTaskNames].filter(Boolean))),
        },
  );
}

export function getLatestProjectCatalog(
  records: Record<string, InputBoardDraft>,
  fallbackCatalog: ProjectCatalogItem[],
) {
  const latestBoard = [...Object.values(records)].sort((left, right) => right.date.localeCompare(left.date))[0];
  return latestBoard?.projectCatalog ?? fallbackCatalog;
}

interface SaveProjectMasterToRecordsOptions {
  previousProjectCode?: string;
  templateDate: string;
  fallbackCatalog: ProjectCatalogItem[];
  createBoardForDate: (date: string, projectCatalog: ProjectCatalogItem[]) => InputBoardDraft;
}

export function saveProjectMasterToRecords(
  records: Record<string, InputBoardDraft>,
  nextProject: ProjectCatalogItem,
  options: SaveProjectMasterToRecordsOptions,
) {
  const masterCatalog = upsertProjectCatalogItem(
    getLatestProjectCatalog(records, options.fallbackCatalog),
    nextProject,
    options.previousProjectCode,
  );

  if (Object.keys(records).length === 0) {
    return {
      [options.templateDate]: options.createBoardForDate(options.templateDate, masterCatalog),
    };
  }

  return Object.fromEntries(
    Object.entries(records).map(([date, draft]) => [
      date,
      {
        ...draft,
        projectCatalog: mergeProjectCatalogForDraft(draft.projectCatalog, masterCatalog),
        projectEntries: syncProjectEntriesWithCatalogUpdate(
          draft.projectEntries,
          nextProject,
          options.previousProjectCode,
        ),
      },
    ]),
  ) as Record<string, InputBoardDraft>;
}
