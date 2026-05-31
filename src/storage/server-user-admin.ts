import { normalizeMailRecipientSettings } from '../lib/mail-settings';
import { normalizeCurrentUserId, normalizeCurrentUserName } from './current-user-storage';

export interface ServerAdminStatus {
  userId: string;
  isAdmin: boolean;
  isReadOnlyAdmin: boolean;
  canManageUsers: boolean;
  canReferenceUsers: boolean;
}

export interface ServerAdminUserRecord {
  userId: string;
  userName: string;
  mailTo: string;
  mailCc: string;
  hasMailSettings: boolean;
  lastSavedAt: string | null;
  lastSeenAt: string | null;
  profileUpdatedAt: string | null;
  sourceEnv: string | null;
  adminNote: string;
  adminUpdatedBy: string;
  adminUpdatedAt: string | null;
  snapshotMonthAnchorDate: string | null;
  snapshotCurrentDate: string | null;
  latestRecordDate: string | null;
  monthSavedDayCount: number;
  monthActualMinutes: number;
  monthPlanMinutes: number;
  activeDaysLast7Days: number;
  savesLast7Days: number;
  savesLast30Days: number;
  activeDaysLast30Days: number;
  isAdmin: boolean;
  isTestUser: boolean;
  testUserLabel: string | null;
}

export interface ServerAdminUserListSummary {
  totalUsers: number;
  realUsers: number;
  testUsers: number;
  openUsers: number;
  mailConfiguredUsers: number;
  recentlySavedUsers: number;
  staleUsers: number;
  followUpUsers: number;
  mailMissingUsers: number;
}

export interface ServerAdminMonitoringUser {
  userId: string;
  userName: string;
  hint: string;
}

export interface ServerAdminMonitoring {
  openUsers: ServerAdminMonitoringUser[];
  staleUsers: ServerAdminMonitoringUser[];
  mailMissingUsers: ServerAdminMonitoringUser[];
  lowCoverageUsers: ServerAdminMonitoringUser[];
  followUpUsers: ServerAdminMonitoringUser[];
}

export interface ServerAdminRankingEntry {
  userId: string;
  userName: string;
  value: number;
  valueLabel: string;
  detail: string;
}

export interface ServerAdminRankings {
  savedDays: ServerAdminRankingEntry[];
  recentActiveDays: ServerAdminRankingEntry[];
  recentUsers: ServerAdminRankingEntry[];
}

export interface ServerAdminDailyActivityPoint {
  date: string;
  activeUsers: number;
  saveCount: number;
}

export interface ServerAdminDashboardAnalysis {
  recentDailyActivity: ServerAdminDailyActivityPoint[];
}

export interface ServerAdminUserDailyActivityPoint {
  date: string;
  saveCount: number;
  monthSavedDayCount: number | null;
  monthActualMinutes: number | null;
  monthPlanMinutes: number | null;
  latestSavedAt: string | null;
}

export interface ServerAdminUserProgressPoint {
  savedAt: string | null;
  snapshotCurrentDate: string | null;
  monthSavedDayCount: number;
  monthActualMinutes: number;
  monthPlanMinutes: number;
  sourceEnv: string | null;
}

export interface ServerAdminUserAnalytics {
  activeDaysLast7Days: number;
  userId: string;
  savesLast7Days: number;
  savesLast30Days: number;
  activeDaysLast30Days: number;
  dailyActivity: ServerAdminUserDailyActivityPoint[];
  progressHistory: ServerAdminUserProgressPoint[];
}

interface ServerAdminStatusResponse {
  ok: boolean;
  userId: string;
  isAdmin: boolean;
  isReadOnlyAdmin?: boolean;
  canManageUsers?: boolean;
  canReferenceUsers?: boolean;
  error?: string;
}

interface ServerAdminUserListResponse {
  ok: boolean;
  users: ServerAdminUserRecord[];
  summary: ServerAdminUserListSummary;
  monitoring: ServerAdminMonitoring;
  rankings: ServerAdminRankings;
  analysis: ServerAdminDashboardAnalysis;
  error?: string;
}

interface ServerAdminUserAnalyticsResponse {
  ok: boolean;
  analytics: ServerAdminUserAnalytics | null;
  error?: string;
}

interface ServerAdminUserUpdateResponse {
  ok: boolean;
  user: ServerAdminUserRecord | null;
  error?: string;
}

interface ServerAdminUserDeleteResponse {
  ok: boolean;
  deletedUserId: string;
  error?: string;
}

function toNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeAdminUserRecord(record: ServerAdminUserRecord): ServerAdminUserRecord {
  const normalizedMail = normalizeMailRecipientSettings({
    to: record.mailTo,
    cc: record.mailCc,
  });

  return {
    ...record,
    userId: normalizeCurrentUserId(record.userId),
    userName: normalizeCurrentUserName(record.userName),
    mailTo: normalizedMail.to,
    mailCc: normalizedMail.cc,
    adminNote: typeof record.adminNote === 'string' ? record.adminNote : '',
    adminUpdatedBy: typeof record.adminUpdatedBy === 'string' ? record.adminUpdatedBy : '',
    hasMailSettings: Boolean(normalizedMail.to || normalizedMail.cc),
    lastSeenAt: typeof record.lastSeenAt === 'string' && record.lastSeenAt.trim() ? record.lastSeenAt : null,
    monthSavedDayCount: toNumber(record.monthSavedDayCount),
    monthActualMinutes: toNumber(record.monthActualMinutes),
    monthPlanMinutes: toNumber(record.monthPlanMinutes),
    activeDaysLast7Days: toNumber(record.activeDaysLast7Days),
    savesLast7Days: toNumber(record.savesLast7Days),
    savesLast30Days: toNumber(record.savesLast30Days),
    activeDaysLast30Days: toNumber(record.activeDaysLast30Days),
    isAdmin: Boolean(record.isAdmin),
    isTestUser: Boolean(record.isTestUser),
    testUserLabel: typeof record.testUserLabel === 'string' && record.testUserLabel.trim() ? record.testUserLabel : null,
  };
}

function normalizeMonitoringGroup(users: ServerAdminMonitoringUser[] | undefined) {
  return Array.isArray(users)
    ? users.map((user) => ({
        userId: normalizeCurrentUserId(user.userId),
        userName: normalizeCurrentUserName(user.userName),
        hint: typeof user.hint === 'string' ? user.hint : '',
      }))
    : [];
}

function normalizeRankingEntries(entries: ServerAdminRankingEntry[] | undefined) {
  return Array.isArray(entries)
    ? entries.map((entry) => ({
        userId: normalizeCurrentUserId(entry.userId),
        userName: normalizeCurrentUserName(entry.userName),
        value: toNumber(entry.value),
        valueLabel: typeof entry.valueLabel === 'string' ? entry.valueLabel : '',
        detail: typeof entry.detail === 'string' ? entry.detail : '',
      }))
    : [];
}

function normalizeUserAnalytics(analytics: ServerAdminUserAnalytics | null | undefined) {
  if (!analytics) {
    return null;
  }

  return {
    userId: normalizeCurrentUserId(analytics.userId),
    activeDaysLast7Days: toNumber(analytics.activeDaysLast7Days),
    savesLast7Days: toNumber(analytics.savesLast7Days),
    savesLast30Days: toNumber(analytics.savesLast30Days),
    activeDaysLast30Days: toNumber(analytics.activeDaysLast30Days),
    dailyActivity: Array.isArray(analytics.dailyActivity)
      ? analytics.dailyActivity.map((point) => ({
          date: typeof point.date === 'string' ? point.date : '',
          saveCount: toNumber(point.saveCount),
          monthSavedDayCount:
            point.monthSavedDayCount === null || point.monthSavedDayCount === undefined
              ? null
              : toNumber(point.monthSavedDayCount),
          monthActualMinutes:
            point.monthActualMinutes === null || point.monthActualMinutes === undefined
              ? null
              : toNumber(point.monthActualMinutes),
          monthPlanMinutes:
            point.monthPlanMinutes === null || point.monthPlanMinutes === undefined
              ? null
              : toNumber(point.monthPlanMinutes),
          latestSavedAt: typeof point.latestSavedAt === 'string' && point.latestSavedAt.trim() ? point.latestSavedAt : null,
        }))
      : [],
    progressHistory: Array.isArray(analytics.progressHistory)
      ? analytics.progressHistory.map((point) => ({
          savedAt: typeof point.savedAt === 'string' && point.savedAt.trim() ? point.savedAt : null,
          snapshotCurrentDate:
            typeof point.snapshotCurrentDate === 'string' && point.snapshotCurrentDate.trim()
              ? point.snapshotCurrentDate
              : null,
          monthSavedDayCount: toNumber(point.monthSavedDayCount),
          monthActualMinutes: toNumber(point.monthActualMinutes),
          monthPlanMinutes: toNumber(point.monthPlanMinutes),
          sourceEnv: typeof point.sourceEnv === 'string' && point.sourceEnv.trim() ? point.sourceEnv : null,
        }))
      : [],
  } satisfies ServerAdminUserAnalytics;
}

function normalizeUserListSummary(summary: ServerAdminUserListSummary | undefined, users: ServerAdminUserRecord[]) {
  const totalUsers = users.length;
  const testUsers = users.filter((user) => user.isTestUser).length;
  const realUsers = totalUsers - testUsers;

  return {
    totalUsers: toNumber(summary?.totalUsers) || totalUsers,
    realUsers: toNumber(summary?.realUsers) || realUsers,
    testUsers: toNumber(summary?.testUsers) || testUsers,
    openUsers: toNumber(summary?.openUsers),
    mailConfiguredUsers: toNumber(summary?.mailConfiguredUsers),
    recentlySavedUsers: toNumber(summary?.recentlySavedUsers),
    staleUsers: toNumber(summary?.staleUsers),
    followUpUsers: toNumber(summary?.followUpUsers),
    mailMissingUsers: toNumber(summary?.mailMissingUsers),
  } satisfies ServerAdminUserListSummary;
}

async function parseJsonResponse<T>(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';
  const rawBody = await response.text();

  if (!rawBody.trim()) {
    throw new Error(
      response.ok
        ? 'サーバー応答が空でした。'
        : `サーバー応答が空でした (${response.status})。`,
    );
  }

  if (!contentType.includes('application/json')) {
    throw new Error(`JSON 応答を受け取れませんでした (${response.status}, ${contentType || 'unknown'})。`);
  }

  const payload = JSON.parse(rawBody) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || `Server request failed: ${response.status}`);
  }

  return payload;
}

function buildAdminHeaders(currentUserId: string) {
  return {
    Accept: 'application/json',
    'X-Oshigoto-User-Id': normalizeCurrentUserId(currentUserId),
  } satisfies Record<string, string>;
}

export async function loadServerAdminStatus(currentUserId: string) {
  const response = await fetch('/api/admin/me', {
    method: 'GET',
    headers: buildAdminHeaders(currentUserId),
  });
  const payload = await parseJsonResponse<ServerAdminStatusResponse>(response);
  return {
    userId: normalizeCurrentUserId(payload.userId),
    isAdmin: Boolean(payload.isAdmin),
    isReadOnlyAdmin: Boolean(payload.isReadOnlyAdmin),
    canManageUsers: payload.canManageUsers === undefined ? Boolean(payload.isAdmin) : Boolean(payload.canManageUsers),
    canReferenceUsers:
      payload.canReferenceUsers === undefined
        ? Boolean(payload.isAdmin) || Boolean(payload.isReadOnlyAdmin)
        : Boolean(payload.canReferenceUsers),
  } satisfies ServerAdminStatus;
}

export async function loadServerAdminUsers(currentUserId: string) {
  const response = await fetch('/api/admin/users', {
    method: 'GET',
    headers: buildAdminHeaders(currentUserId),
  });
  const payload = await parseJsonResponse<ServerAdminUserListResponse>(response);
  const users = payload.users.map((user) => normalizeAdminUserRecord(user));

  return {
    users,
    summary: normalizeUserListSummary(payload.summary, users),
    monitoring: {
      openUsers: normalizeMonitoringGroup(payload.monitoring?.openUsers),
      staleUsers: normalizeMonitoringGroup(payload.monitoring?.staleUsers),
      mailMissingUsers: normalizeMonitoringGroup(payload.monitoring?.mailMissingUsers),
      lowCoverageUsers: normalizeMonitoringGroup(payload.monitoring?.lowCoverageUsers),
      followUpUsers: normalizeMonitoringGroup(payload.monitoring?.followUpUsers),
    } satisfies ServerAdminMonitoring,
    rankings: {
      savedDays: normalizeRankingEntries(payload.rankings?.savedDays),
      recentActiveDays: normalizeRankingEntries(payload.rankings?.recentActiveDays),
      recentUsers: normalizeRankingEntries(payload.rankings?.recentUsers),
    } satisfies ServerAdminRankings,
    analysis: {
      recentDailyActivity: Array.isArray(payload.analysis?.recentDailyActivity)
        ? payload.analysis.recentDailyActivity.map((point) => ({
            date: typeof point.date === 'string' ? point.date : '',
            activeUsers: toNumber(point.activeUsers),
            saveCount: toNumber(point.saveCount),
          }))
        : [],
    } satisfies ServerAdminDashboardAnalysis,
  };
}

export async function loadServerAdminUserAnalytics(currentUserId: string, targetUserId: string) {
  const response = await fetch(`/api/admin/users/${encodeURIComponent(normalizeCurrentUserId(targetUserId))}/analytics`, {
    method: 'GET',
    headers: buildAdminHeaders(currentUserId),
  });
  const payload = await parseJsonResponse<ServerAdminUserAnalyticsResponse>(response);
  return normalizeUserAnalytics(payload.analytics);
}

export async function saveServerAdminUser(
  currentUserId: string,
  user: Pick<ServerAdminUserRecord, 'userId' | 'userName' | 'mailTo' | 'mailCc' | 'adminNote'>,
) {
  const normalizedMail = normalizeMailRecipientSettings({
    to: user.mailTo,
    cc: user.mailCc,
  });
  const response = await fetch(`/api/admin/users/${encodeURIComponent(normalizeCurrentUserId(user.userId))}`, {
    method: 'PATCH',
    headers: {
      ...buildAdminHeaders(currentUserId),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userName: normalizeCurrentUserName(user.userName),
      mailTo: normalizedMail.to,
      mailCc: normalizedMail.cc,
      adminNote: typeof user.adminNote === 'string' ? user.adminNote : '',
    }),
  });
  const payload = await parseJsonResponse<ServerAdminUserUpdateResponse>(response);
  return payload.user ? normalizeAdminUserRecord(payload.user) : null;
}

export async function deleteServerAdminUser(currentUserId: string, targetUserId: string) {
  const response = await fetch(`/api/admin/users/${encodeURIComponent(normalizeCurrentUserId(targetUserId))}`, {
    method: 'DELETE',
    headers: buildAdminHeaders(currentUserId),
  });
  const payload = await parseJsonResponse<ServerAdminUserDeleteResponse>(response);
  return normalizeCurrentUserId(payload.deletedUserId);
}
