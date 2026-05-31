export type EntryMode = 'plan' | 'actual';

export type AnnualLeaveBaseType = 'annual-day' | 'annual-am' | 'annual-pm';

export type AuxEntryType = 'split' | 'break' | 'annual-day' | 'annual-am' | 'annual-pm' | 'annual-hour';

export type WorkPlace = 'home' | 'office' | 'client' | 'other';

export type ProjectCategory = 'direct' | 'indirect';

export type ProjectTimeInputMode = 'duration' | 'range';

export interface ModeValue<T> {
  plan: T;
  actual: T;
}

export interface ProjectCatalogItem {
  projectCode: string;
  projectName: string;
  timesheetProjectLabel?: string;
  category: ProjectCategory;
  // TODO: 将来的には月ごとの計画値テーブルへ分離し、PJマスタとは責務を分ける。
  monthlyBudgetMinutes?: number;
  defaultTaskName?: string;
  defaultPlace?: WorkPlace;
  isActive?: boolean;
  pinned?: boolean;
  recent?: boolean;
  needsComment?: boolean;
  aliases?: string[];
  recentTaskNames: string[];
}

export interface ProjectEntry {
  id: string;
  projectSearch: string;
  projectCode: string;
  projectName: string;
  category: ProjectCategory | null;
  needsComment: boolean;
  timeInputMode: ModeValue<ProjectTimeInputMode>;
  rangeStart: ModeValue<string>;
  rangeEnd: ModeValue<string>;
  minutes: ModeValue<number>;
  taskName: ModeValue<string>;
  place: ModeValue<WorkPlace>;
  placeDetail?: ModeValue<string>;
  note: ModeValue<string>;
  recentTaskNames: string[];
}

export interface AuxTimeEntry {
  id: string;
  mode: EntryMode;
  type: AuxEntryType;
  startTime: string;
  endTime: string;
  note: string;
}

export interface InputBoardDraft {
  date: string;
  currentMode: EntryMode;
  lunchMinutes: number;
  startTime: ModeValue<string>;
  endTime: ModeValue<string>;
  projectEntries: ProjectEntry[];
  auxEntries: AuxTimeEntry[];
  projectCatalog: ProjectCatalogItem[];
}
