import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { isAdminUser } from './admin-user-config.mjs';
import { DuckDbBoardSessionConflictError, DuckDbBoardSessionRepository } from './duckdb-repository.mjs';
import { loadTodayFact } from './today-fact-service.mjs';

const rootDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const distDir = path.resolve(rootDir, '.generated', 'dist');

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

const mailHelperDrafts = new Map();
const mailHelperDraftTtlMs = 15 * 60 * 1000;
const userPresenceWindowMs = 3 * 60 * 1000;
const exactTestUserIds = new Set(['admin-e2e-user', 'debug-user']);
const generatedTestUserPrefixes = [
  'annual-day',
  'annual-half',
  'annual-hour',
  'conflict',
  'daily-row-nav',
  'daily-segment-switch',
  'daily-shortcuts',
  'day-list-reference',
  'day-list-rich',
  'empty-day-default-plan',
  'empty-user',
  'greeting',
  'header-utility',
  'help',
  'mail-empty-guard',
  'mail-open-error',
  'mail-phase-actual',
  'mail-phase-plan',
  'mail-preview',
  'mail-send-success',
  'mail-subject-place',
  'mail-template-preview',
  'mail-warning-guard',
  'managed-user',
  'mode-row-delete-actual',
  'mode-row-delete-plan',
  'mode-summary-separation',
  'monthly-cleanup',
  'monthly-shortcuts',
  'monthly-tab-order',
  'night-greeting',
  'non-admin',
  'other-place',
  'project-day-list',
  'project-picker-keyboard',
  'project-picker-portal',
  'quiet-guide',
  'reachability',
  'recent-projects',
  'recent-tasks',
  'release-notes',
  'server-persist',
  'settings-a',
  'settings-b',
  'simple-mode',
  'switch-a',
  'switch-b',
  'switch-flush-a',
  'switch-flush-b',
  'task-keyboard',
  'task-suggestion',
  'user-a',
  'user-b',
  'utility-guide',
];
const generatedTestUserPatterns = generatedTestUserPrefixes.map(
  (prefix) => new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d{13}-[a-z0-9]{6}$`),
);

function cleanupMailHelperDrafts(now = Date.now()) {
  for (const [token, draft] of mailHelperDrafts.entries()) {
    if (now - draft.createdAt > mailHelperDraftTtlMs) {
      mailHelperDrafts.delete(token);
    }
  }
}

function encodeDraftField(value) {
  return Buffer.from(String(value ?? ''), 'utf8').toString('base64');
}

function buildMailHelperPayloadText(draft) {
  return [
    `to=${encodeDraftField(draft.to)}`,
    `cc=${encodeDraftField(draft.cc)}`,
    `subject=${encodeDraftField(draft.subject)}`,
    `htmlBody=${encodeDraftField(draft.htmlBody)}`,
    `textBody=${encodeDraftField(draft.textBody)}`,
  ].join('\n');
}

function buildRequestOrigin(request) {
  const forwardedProto = request.headers['x-forwarded-proto'];
  const protocol = typeof forwardedProto === 'string' && forwardedProto.trim() ? forwardedProto.trim() : 'http';
  return `${protocol}://${request.headers.host}`;
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function classifyAdminUser(user) {
  const normalizedUserId = normalizeText(user.userId).toLowerCase();
  const isGeneratedTestUser = generatedTestUserPatterns.some((pattern) => pattern.test(normalizedUserId));
  const isTestUser = exactTestUserIds.has(normalizedUserId) || isGeneratedTestUser;

  return {
    ...user,
    isTestUser,
    testUserLabel: isTestUser ? 'テスト' : null,
  };
}

function formatLocalIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatLocalDateTimeLabel(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return '';
  }

  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getUserRecentAccessTimestamp(user) {
  const candidates = [user.lastSeenAt, user.lastSavedAt];
  for (const candidate of candidates) {
    const timestamp = candidate ? Date.parse(candidate) : Number.NaN;
    if (Number.isFinite(timestamp)) {
      return timestamp;
    }
  }

  return Number.NaN;
}

function isUserRecentlySeen(user, now = Date.now()) {
  const timestamp = user.lastSeenAt ? Date.parse(user.lastSeenAt) : Number.NaN;
  return Number.isFinite(timestamp) && now - timestamp <= userPresenceWindowMs;
}

function buildRecentDateRange(days, now = new Date()) {
  const range = [];
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const point = new Date(cursor);
    point.setDate(cursor.getDate() - offset);
    range.push(formatLocalIsoDate(point));
  }

  return range;
}

function startOfRecentWindow(days, now = new Date()) {
  return buildRecentDateRange(days, now)[0] ?? '';
}

function formatHoursDecimalLabel(minutes) {
  const numeric = Number(minutes);
  if (!Number.isFinite(numeric)) {
    return '0h';
  }

  const hours = (Math.abs(numeric) / 60).toFixed(2).replace(/\.?0+$/, '');
  return `${numeric < 0 ? '-' : ''}${hours}h`;
}

function buildSyntheticHistoryRows(users, historyRows) {
  const userIdsWithHistory = new Set(historyRows.map((row) => normalizeText(row.userId)).filter(Boolean));

  return users
    .filter((user) => !userIdsWithHistory.has(user.userId) && normalizeText(user.lastSavedAt))
    .map((user) => ({
      userId: user.userId,
      savedAt: user.lastSavedAt,
      savedOn: formatLocalIsoDate(user.lastSavedAt),
      snapshotMonthAnchorDate: user.snapshotMonthAnchorDate,
      snapshotCurrentDate: user.snapshotCurrentDate,
      latestRecordDate: user.latestRecordDate,
      monthSavedDayCount: user.monthSavedDayCount,
      monthActualMinutes: user.monthActualMinutes,
      monthPlanMinutes: user.monthPlanMinutes,
      sourceEnv: user.sourceEnv,
    }));
}

function buildAdminActivityOverview(users, historyRows) {
  const recent7Start = startOfRecentWindow(7);
  const recent14Range = buildRecentDateRange(14);
  const recent14Start = recent14Range[0] ?? '';
  const recent30Start = startOfRecentWindow(30);
  const usersById = new Map(users.map((user) => [user.userId, user]));
  const statsByUser = new Map();
  const recentDailyActivityMap = new Map(recent14Range.map((date) => [date, { date, activeUsers: 0, saveCount: 0 }]));
  const recentDailyUserSets = new Map(recent14Range.map((date) => [date, new Set()]));
  const combinedRows = [...historyRows, ...buildSyntheticHistoryRows(users, historyRows)];

  for (const row of combinedRows) {
    const userId = normalizeText(row.userId);
    const savedOn = normalizeText(row.savedOn);
    if (!userId || !savedOn) {
      continue;
    }

    let stats = statsByUser.get(userId);
    if (!stats) {
      stats = {
        activeDaysLast7DaysSet: new Set(),
        savesLast7Days: 0,
        savesLast30Days: 0,
        activeDaysLast30DaysSet: new Set(),
      };
      statsByUser.set(userId, stats);
    }

    if (savedOn >= recent30Start) {
      stats.savesLast30Days += 1;
      stats.activeDaysLast30DaysSet.add(savedOn);
    }

    if (savedOn >= recent7Start) {
      stats.savesLast7Days += 1;
      stats.activeDaysLast7DaysSet.add(savedOn);
    }

    if (!(usersById.get(userId)?.isTestUser) && savedOn >= recent14Start && recentDailyActivityMap.has(savedOn)) {
      const point = recentDailyActivityMap.get(savedOn);
      point.saveCount += 1;
      recentDailyUserSets.get(savedOn)?.add(userId);
    }
  }

  const normalizedStatsByUser = new Map();
  for (const [userId, stats] of statsByUser.entries()) {
    normalizedStatsByUser.set(userId, {
      activeDaysLast7Days: stats.activeDaysLast7DaysSet.size,
      savesLast7Days: stats.savesLast7Days,
      savesLast30Days: stats.savesLast30Days,
      activeDaysLast30Days: stats.activeDaysLast30DaysSet.size,
    });
  }

  const recentDailyActivity = recent14Range.map((date) => {
    const point = recentDailyActivityMap.get(date) ?? { date, activeUsers: 0, saveCount: 0 };
    return {
      ...point,
      activeUsers: recentDailyUserSets.get(date)?.size ?? 0,
    };
  });

  return {
    statsByUser: normalizedStatsByUser,
    recentDailyActivity,
  };
}

function decorateAdminUsers(users, statsByUser, adminUserIdSet) {
  return users.map((user) => {
    const recentStats = statsByUser.get(user.userId) ?? {
      activeDaysLast7Days: 0,
      savesLast7Days: 0,
      savesLast30Days: 0,
      activeDaysLast30Days: 0,
    };

    return {
      ...user,
      isAdmin: adminUserIdSet.has(user.userId),
      activeDaysLast7Days: recentStats.activeDaysLast7Days,
      savesLast7Days: recentStats.savesLast7Days,
      savesLast30Days: recentStats.savesLast30Days,
      activeDaysLast30Days: recentStats.activeDaysLast30Days,
    };
  });
}

function buildAdminMonitoring(users) {
  const recentThreshold = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const toUserDigest = (user, hint) => ({
    userId: user.userId,
    userName: user.userName,
    hint,
  });
  const openUsers = users
    .filter((user) => isUserRecentlySeen(user))
    .sort((left, right) => {
      const leftTimestamp = left.lastSeenAt ? Date.parse(left.lastSeenAt) : Number.NEGATIVE_INFINITY;
      const rightTimestamp = right.lastSeenAt ? Date.parse(right.lastSeenAt) : Number.NEGATIVE_INFINITY;
      return rightTimestamp - leftTimestamp || left.userId.localeCompare(right.userId, 'ja');
    })
    .map((user) => toUserDigest(user, `最終アクセス ${formatLocalDateTimeLabel(user.lastSeenAt)}`));

  const staleUsers = users
    .filter((user) => {
      const timestamp = user.lastSavedAt ? Date.parse(user.lastSavedAt) : Number.NaN;
      return !Number.isFinite(timestamp) || timestamp < recentThreshold;
    })
    .sort((left, right) => {
      const leftTimestamp = left.lastSavedAt ? Date.parse(left.lastSavedAt) : Number.NEGATIVE_INFINITY;
      const rightTimestamp = right.lastSavedAt ? Date.parse(right.lastSavedAt) : Number.NEGATIVE_INFINITY;
      return leftTimestamp - rightTimestamp || left.userId.localeCompare(right.userId, 'ja');
    })
    .map((user) => toUserDigest(user, user.lastSavedAt ? `最終保存 ${formatLocalIsoDate(user.lastSavedAt)}` : '保存履歴なし'));

  const mailMissingUsers = users
    .filter((user) => !user.hasMailSettings)
    .sort((left, right) => left.userId.localeCompare(right.userId, 'ja'))
    .map((user) => toUserDigest(user, 'メール未設定'));

  const lowCoverageUsers = users
    .filter((user) => user.monthSavedDayCount <= 2)
    .sort((left, right) => left.monthSavedDayCount - right.monthSavedDayCount || left.userId.localeCompare(right.userId, 'ja'))
    .map((user) => toUserDigest(user, `今月入力 ${user.monthSavedDayCount}日`));

  const followUpUsers = users
    .filter((user) => normalizeText(user.adminNote))
    .sort((left, right) => {
      const leftTimestamp = left.adminUpdatedAt ? Date.parse(left.adminUpdatedAt) : Number.NEGATIVE_INFINITY;
      const rightTimestamp = right.adminUpdatedAt ? Date.parse(right.adminUpdatedAt) : Number.NEGATIVE_INFINITY;
      return rightTimestamp - leftTimestamp || left.userId.localeCompare(right.userId, 'ja');
    })
    .map((user) => toUserDigest(user, normalizeText(user.adminNote)));

  return {
    openUsers,
    staleUsers,
    mailMissingUsers,
    lowCoverageUsers,
    followUpUsers,
  };
}

function buildAdminRankings(users) {
  const rankingLimit = 5;
  const toRankingEntry = (user, value, valueLabel, detail) => ({
    userId: user.userId,
    userName: user.userName,
    value,
    valueLabel,
    detail,
  });
  const sortByValueDesc = (left, right) => right.value - left.value || left.userId.localeCompare(right.userId, 'ja');

  const savedDays = users
    .filter((user) => user.monthSavedDayCount > 0)
    .map((user) =>
      toRankingEntry(
        user,
        user.monthSavedDayCount,
        `${user.monthSavedDayCount}日`,
        `直近30日保存 ${user.savesLast30Days}回`,
      ),
    )
    .sort(sortByValueDesc)
    .slice(0, rankingLimit);

  const recentActiveDays = users
    .filter((user) => user.activeDaysLast7Days > 0)
    .map((user) =>
      toRankingEntry(
        user,
        user.activeDaysLast7Days,
        `${user.activeDaysLast7Days}日`,
        user.lastSavedAt ? `最終保存 ${formatLocalIsoDate(user.lastSavedAt)}` : '保存履歴なし',
      ),
    )
    .sort(sortByValueDesc)
    .slice(0, rankingLimit);

  const recentUsers = users
    .filter((user) => Number.isFinite(getUserRecentAccessTimestamp(user)))
    .map((user) =>
      toRankingEntry(
        user,
        getUserRecentAccessTimestamp(user),
        formatLocalDateTimeLabel(user.lastSeenAt ?? user.lastSavedAt),
        user.lastSeenAt ? `最終保存 ${formatLocalDateTimeLabel(user.lastSavedAt) || '未保存'}` : 'アクセスは最終保存から推定',
      ),
    )
    .sort(sortByValueDesc)
    .slice(0, rankingLimit);

  return {
    savedDays,
    recentActiveDays,
    recentUsers,
  };
}

function parseServerOptions(argv) {
  const args = [...argv];
  const isDev = args.includes('--dev');
  const defaultPort = isDev ? 5173 : 4173;
  let host = '127.0.0.1';
  let port = defaultPort;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === '--host' && args[index + 1]) {
      host = args[index + 1];
      index += 1;
      continue;
    }

    if (argument === '--port' && args[index + 1]) {
      const parsedPort = Number(args[index + 1]);
      if (Number.isInteger(parsedPort) && parsedPort > 0) {
        port = parsedPort;
      }
      index += 1;
    }
  }

  return {
    isDev,
    host,
    port,
  };
}

function getAdminRequesterUserId(request, requestUrl) {
  const headerValue = request.headers['x-oshigoto-user-id'];
  if (typeof headerValue === 'string' && headerValue.trim()) {
    return normalizeText(headerValue);
  }

  if (Array.isArray(headerValue) && headerValue[0]) {
    return normalizeText(headerValue[0]);
  }

  return normalizeText(requestUrl.searchParams.get('userId'));
}

function buildAdminUserListSummary(realUsers, allUsers = realUsers) {
  const recentThreshold = Date.now() - 7 * 24 * 60 * 60 * 1000;

  return {
    totalUsers: allUsers.length,
    realUsers: realUsers.length,
    testUsers: allUsers.length - realUsers.length,
    openUsers: realUsers.filter((user) => isUserRecentlySeen(user)).length,
    mailConfiguredUsers: realUsers.filter((user) => user.hasMailSettings).length,
    recentlySavedUsers: realUsers.filter((user) => {
      const timestamp = user.lastSavedAt ? Date.parse(user.lastSavedAt) : Number.NaN;
      return Number.isFinite(timestamp) && timestamp >= recentThreshold;
    }).length,
    staleUsers: realUsers.filter((user) => {
      const timestamp = user.lastSavedAt ? Date.parse(user.lastSavedAt) : Number.NaN;
      return !Number.isFinite(timestamp) || timestamp < recentThreshold;
    }).length,
    followUpUsers: realUsers.filter((user) => normalizeText(user.adminNote)).length,
    mailMissingUsers: realUsers.filter((user) => !user.hasMailSettings).length,
  };
}

function buildReferenceUsers(users, adminUserIdSet) {
  return users
    .filter((user) => !user.isTestUser)
    .map((user) => ({
      userId: user.userId,
      userName: user.userName,
      lastSavedAt: user.lastSavedAt,
      lastSeenAt: user.lastSeenAt,
      snapshotMonthAnchorDate: user.snapshotMonthAnchorDate,
      snapshotCurrentDate: user.snapshotCurrentDate,
      latestRecordDate: user.latestRecordDate,
      monthSavedDayCount: user.monthSavedDayCount,
      monthActualMinutes: user.monthActualMinutes,
      monthPlanMinutes: user.monthPlanMinutes,
      isAdmin: adminUserIdSet.has(user.userId),
    }))
    .sort((left, right) => {
      const leftTimestamp = left.lastSavedAt ? Date.parse(left.lastSavedAt) : Number.NEGATIVE_INFINITY;
      const rightTimestamp = right.lastSavedAt ? Date.parse(right.lastSavedAt) : Number.NEGATIVE_INFINITY;
      return rightTimestamp - leftTimestamp || left.userId.localeCompare(right.userId, 'ja');
    });
}

function buildAdminUserAnalytics(user, historyRows) {
  if (!user) {
    return null;
  }

  const recent7Start = startOfRecentWindow(7);
  const recent14Range = buildRecentDateRange(14);
  const recent14Start = recent14Range[0] ?? '';
  const recent30Start = startOfRecentWindow(30);
  const normalizedRows = historyRows.length ? historyRows : buildSyntheticHistoryRows([user], []);
  const recentRows = [...normalizedRows].sort((left, right) => normalizeText(right.savedAt).localeCompare(normalizeText(left.savedAt)));
  const dailyMap = new Map();
  const activeDaysLast7DaysSet = new Set();
  const activeDaysLast30DaysSet = new Set();
  let savesLast7Days = 0;
  let savesLast30Days = 0;

  for (const row of recentRows) {
    const savedOn = normalizeText(row.savedOn);
    if (!savedOn) {
      continue;
    }

    if (savedOn >= recent30Start) {
      savesLast30Days += 1;
      activeDaysLast30DaysSet.add(savedOn);
    }

    if (savedOn >= recent7Start) {
      savesLast7Days += 1;
      activeDaysLast7DaysSet.add(savedOn);
    }

    if (savedOn >= recent14Start) {
      const current = dailyMap.get(savedOn) ?? {
        date: savedOn,
        saveCount: 0,
        monthSavedDayCount: 0,
        monthActualMinutes: 0,
        monthPlanMinutes: 0,
        latestSavedAt: null,
      };
      current.saveCount += 1;

      if (!current.latestSavedAt || normalizeText(row.savedAt) > current.latestSavedAt) {
        current.latestSavedAt = normalizeText(row.savedAt) || null;
        current.monthSavedDayCount = Number(row.monthSavedDayCount ?? 0) || 0;
        current.monthActualMinutes = Number(row.monthActualMinutes ?? 0) || 0;
        current.monthPlanMinutes = Number(row.monthPlanMinutes ?? 0) || 0;
      }

      dailyMap.set(savedOn, current);
    }
  }

  return {
    userId: user.userId,
    activeDaysLast7Days: activeDaysLast7DaysSet.size,
    savesLast7Days,
    savesLast30Days,
    activeDaysLast30Days: activeDaysLast30DaysSet.size,
    dailyActivity: recent14Range.map((date) => {
      const point = dailyMap.get(date);
      return {
        date,
        saveCount: point?.saveCount ?? 0,
        monthSavedDayCount: point?.monthSavedDayCount ?? null,
        monthActualMinutes: point?.monthActualMinutes ?? null,
        monthPlanMinutes: point?.monthPlanMinutes ?? null,
        latestSavedAt: point?.latestSavedAt ?? null,
      };
    }),
    progressHistory: recentRows.slice(0, 8).map((row) => ({
      savedAt: normalizeText(row.savedAt) || null,
      snapshotCurrentDate: normalizeText(row.snapshotCurrentDate) || null,
      monthSavedDayCount: Number(row.monthSavedDayCount ?? 0) || 0,
      monthActualMinutes: Number(row.monthActualMinutes ?? 0) || 0,
      monthPlanMinutes: Number(row.monthPlanMinutes ?? 0) || 0,
      sourceEnv: normalizeText(row.sourceEnv) || null,
    })),
  };
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    request.on('data', (chunk) => {
      chunks.push(chunk);

      if (chunks.reduce((total, current) => total + current.length, 0) > 5 * 1024 * 1024) {
        reject(new Error('Request body is too large.'));
        request.destroy();
      }
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(message);
}

function sendServerError(response, error) {
  const message = error instanceof Error ? error.message : 'Unknown server error';
  console.error(formatRuntimeErrorMessage('request handling failed.', error));
  sendJson(response, 500, {
    ok: false,
    error: message,
  });
}

function formatStartupErrorMessage(error, storageInfo = null) {
  const message = error instanceof Error ? error.message : String(error);
  const dbPath = storageInfo?.dbPath ?? process.env.OSHIGOTO_TECHO_DB_PATH ?? path.resolve(rootDir, 'data', 'oshigoto_techo.duckdb');
  const walPath = `${dbPath}.wal`;

  if (message.includes('別のプロセスが使用中')) {
    return [
      '[oshigoto-techo] failed to start.',
      `DuckDB を開けませんでした: ${dbPath}`,
      '原因候補: 同じ DB を使う別の oshigoto-techo プロセスが起動中です。',
      '対処: 既存の dev / preview / start-dev.bat を止めてから、もう一度起動してください。',
      `詳細: ${message}`,
    ].join('\n');
  }

  if (message.includes('Failure while replaying WAL file') || message.includes('GetDefaultDatabase with no default database set')) {
    return [
      '[oshigoto-techo] failed to start.',
      `DuckDB の WAL 復旧に失敗しました: ${dbPath}`,
      '原因候補: 前回の異常終了や同時起動により、`.wal` が壊れたか中途半端に残っています。',
      `対処: まず関連プロセスをすべて止めて、\`${dbPath}\` と \`${walPath}\` を退避してから状態を確認してください。`,
      `詳細: ${message}`,
    ].join('\n');
  }

  return ['[oshigoto-techo] failed to start.', message].join('\n');
}

function formatRuntimeErrorMessage(label, error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  return [`[oshigoto-techo] ${label}`, message].join('\n');
}

async function handleApiRequest(request, response, repository, storageInfo) {
  const requestUrl = new URL(request.url ?? '/', 'http://localhost');

  async function requireAdminAccess() {
    const requesterUserId = getAdminRequesterUserId(request, requestUrl);
    const adminAccess = await isAdminUser(rootDir, requesterUserId);

    if (!adminAccess.canManageUsers) {
      sendJson(response, 403, {
        ok: false,
        error: '管理者権限が必要です。',
      });
      return null;
    }

    return {
      requesterUserId,
      adminAccess,
    };
  }

  async function requireReferenceAccess() {
    const requesterUserId = getAdminRequesterUserId(request, requestUrl);
    const adminAccess = await isAdminUser(rootDir, requesterUserId);

    if (!adminAccess.canReferenceUsers) {
      sendJson(response, 403, {
        ok: false,
        error: '参照権限が必要です。',
      });
      return null;
    }

    return {
      requesterUserId,
      adminAccess,
    };
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/admin/me') {
    try {
      const requesterUserId = getAdminRequesterUserId(request, requestUrl);
      const adminAccess = await isAdminUser(rootDir, requesterUserId);
      sendJson(response, 200, {
        ok: true,
        userId: requesterUserId,
        isAdmin: adminAccess.isAdmin,
        isReadOnlyAdmin: adminAccess.isReadOnlyAdmin,
        canManageUsers: adminAccess.canManageUsers,
        canReferenceUsers: adminAccess.canReferenceUsers,
      });
    } catch (error) {
      sendServerError(response, error);
    }
    return true;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/admin/reference/users') {
    const adminRequest = await requireReferenceAccess();
    if (!adminRequest) {
      return true;
    }

    try {
      const adminUserIdSet = new Set(adminRequest.adminAccess.adminUserIds);
      const rawUsers = (await repository.listUsersForAdmin()).map((user) => classifyAdminUser(user));
      const users = buildReferenceUsers(rawUsers, adminUserIdSet);
      const favoriteUserIds = (await repository.getReferenceFavoriteUserIds(adminRequest.requesterUserId)).filter((userId) =>
        users.some((user) => user.userId === userId),
      );

      sendJson(response, 200, {
        ok: true,
        users,
        favoriteUserIds,
      });
    } catch (error) {
      sendServerError(response, error);
    }

    return true;
  }

  if (request.method === 'GET' && requestUrl.pathname.startsWith('/api/admin/reference/users/') && requestUrl.pathname.endsWith('/session')) {
    const adminRequest = await requireReferenceAccess();
    if (!adminRequest) {
      return true;
    }

    const targetUserId = normalizeText(
      decodeURIComponent(requestUrl.pathname.replace('/api/admin/reference/users/', '').replace('/session', '')),
    );
    if (!targetUserId) {
      sendJson(response, 400, {
        ok: false,
        error: 'target userId is required.',
      });
      return true;
    }

    try {
      const rawUsers = (await repository.listUsersForAdmin()).map((user) => classifyAdminUser(user));
      const targetUser = rawUsers.find((user) => user.userId === targetUserId && !user.isTestUser) ?? null;
      if (!targetUser) {
        sendJson(response, 404, {
          ok: false,
          error: 'target user was not found.',
        });
        return true;
      }

      const session = await repository.getSession(targetUserId);
      if (!session) {
        sendJson(response, 404, {
          ok: false,
          error: 'latest saved session was not found.',
        });
        return true;
      }

      sendJson(response, 200, {
        ok: true,
        session: {
          userId: targetUser.userId,
          userName: targetUser.userName || session.userName,
          snapshotJson: session.snapshotJson,
          updatedAt: session.updatedAt,
          sourceEnv: session.sourceEnv,
        },
      });
    } catch (error) {
      sendServerError(response, error);
    }

    return true;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/admin/reference/export-sessions') {
    const adminRequest = await requireReferenceAccess();
    if (!adminRequest) {
      return true;
    }

    try {
      const rawBody = await readBody(request);
      const payload = JSON.parse(rawBody || '{}');
      const requestedUserIds = Array.isArray(payload.userIds)
        ? Array.from(new Set(payload.userIds.map((userId) => normalizeText(userId)).filter(Boolean)))
        : [];

      if (!requestedUserIds.length) {
        sendJson(response, 400, {
          ok: false,
          error: 'userIds is required.',
        });
        return true;
      }

      const rawUsers = (await repository.listUsersForAdmin()).map((user) => classifyAdminUser(user));
      const allowedUsers = new Map(
        rawUsers.filter((user) => !user.isTestUser).map((user) => [user.userId, user]),
      );
      const sessions = [];
      const skippedUsers = [];

      for (const userId of requestedUserIds) {
        const targetUser = allowedUsers.get(userId);
        if (!targetUser) {
          skippedUsers.push({
            userId,
            reason: '参照対象が見つかりません。',
          });
          continue;
        }

        const session = await repository.getSession(userId);
        if (!session) {
          skippedUsers.push({
            userId,
            reason: '最新保存データがありません。',
          });
          continue;
        }

        sessions.push({
          userId: targetUser.userId,
          userName: targetUser.userName || session.userName,
          snapshotJson: session.snapshotJson,
          updatedAt: session.updatedAt,
          sourceEnv: session.sourceEnv,
        });
      }

      sendJson(response, 200, {
        ok: true,
        sessions,
        skippedUsers,
      });
    } catch (error) {
      sendServerError(response, error);
    }

    return true;
  }

  if (request.method === 'PATCH' && requestUrl.pathname === '/api/admin/reference/preferences') {
    const adminRequest = await requireReferenceAccess();
    if (!adminRequest) {
      return true;
    }

    try {
      const rawBody = await readBody(request);
      const payload = JSON.parse(rawBody || '{}');
      if (!Array.isArray(payload.favoriteUserIds)) {
        sendJson(response, 400, {
          ok: false,
          error: 'favoriteUserIds is required.',
        });
        return true;
      }

      const rawUsers = (await repository.listUsersForAdmin()).map((user) => classifyAdminUser(user));
      const allowedUserIdSet = new Set(rawUsers.filter((user) => !user.isTestUser).map((user) => user.userId));
      const favoriteUserIds = Array.from(
        new Set(payload.favoriteUserIds.map((userId) => normalizeText(userId)).filter((userId) => allowedUserIdSet.has(userId))),
      );
      const savedFavoriteUserIds = await repository.saveReferenceFavoriteUserIds({
        viewerUserId: adminRequest.requesterUserId,
        favoriteUserIds,
      });

      sendJson(response, 200, {
        ok: true,
        favoriteUserIds: savedFavoriteUserIds,
      });
    } catch (error) {
      sendServerError(response, error);
    }

    return true;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/admin/users') {
    const adminRequest = await requireAdminAccess();
    if (!adminRequest) {
      return true;
    }

    try {
      const adminUserIdSet = new Set(adminRequest.adminAccess.adminUserIds);
      const rawUsers = (await repository.listUsersForAdmin()).map((user) => classifyAdminUser(user));
      const recentHistoryRows = await repository.listSnapshotHistory({
        sinceDate: startOfRecentWindow(30),
      });
      const activityOverview = buildAdminActivityOverview(rawUsers, recentHistoryRows);
      const users = decorateAdminUsers(rawUsers, activityOverview.statsByUser, adminUserIdSet);
      const realUsers = users.filter((user) => !user.isTestUser);
      const monitoring = buildAdminMonitoring(realUsers);
      const rankings = buildAdminRankings(realUsers);

      sendJson(response, 200, {
        ok: true,
        users,
        summary: buildAdminUserListSummary(realUsers, users),
        monitoring,
        rankings,
        analysis: {
          recentDailyActivity: activityOverview.recentDailyActivity,
        },
      });
    } catch (error) {
      sendServerError(response, error);
    }

    return true;
  }

  if (request.method === 'GET' && requestUrl.pathname.startsWith('/api/admin/users/') && requestUrl.pathname.endsWith('/analytics')) {
    const adminRequest = await requireAdminAccess();
    if (!adminRequest) {
      return true;
    }

    const targetUserId = normalizeText(
      decodeURIComponent(requestUrl.pathname.replace('/api/admin/users/', '').replace('/analytics', '')),
    );
    if (!targetUserId) {
      sendJson(response, 400, {
        ok: false,
        error: 'target userId is required.',
      });
      return true;
    }

    try {
      const rawUsers = (await repository.listUsersForAdmin()).map((user) => classifyAdminUser(user));
      const targetUser = rawUsers.find((user) => user.userId === targetUserId) ?? null;
      if (!targetUser) {
        sendJson(response, 404, {
          ok: false,
          error: 'target user was not found.',
        });
        return true;
      }

      const recentHistoryRows = await repository.listSnapshotHistory({
        userId: targetUserId,
        sinceDate: startOfRecentWindow(30),
      });
      const activityOverview = buildAdminActivityOverview([targetUser], recentHistoryRows);
      const [decoratedUser] = decorateAdminUsers(
        [targetUser],
        activityOverview.statsByUser,
        new Set(adminRequest.adminAccess.adminUserIds),
      );
      const fullHistoryRows = await repository.listSnapshotHistory({
        userId: targetUserId,
        sinceDate: startOfRecentWindow(30),
      });

      sendJson(response, 200, {
        ok: true,
        analytics: buildAdminUserAnalytics(decoratedUser, fullHistoryRows),
      });
    } catch (error) {
      sendServerError(response, error);
    }

    return true;
  }

  if (request.method === 'DELETE' && requestUrl.pathname.startsWith('/api/admin/users/')) {
    const adminRequest = await requireAdminAccess();
    if (!adminRequest) {
      return true;
    }

    const targetUserId = normalizeText(decodeURIComponent(requestUrl.pathname.replace('/api/admin/users/', '')));
    if (!targetUserId) {
      sendJson(response, 400, {
        ok: false,
        error: 'target userId is required.',
      });
      return true;
    }

    if (targetUserId === adminRequest.requesterUserId) {
      sendJson(response, 400, {
        ok: false,
        error: '現在ログイン中の利用者データは削除できません。別の管理者 userId で入り直してください。',
      });
      return true;
    }

    try {
      const deletedUser = await repository.deleteUserForAdmin(targetUserId);
      sendJson(response, 200, {
        ok: true,
        deletedUserId: deletedUser.userId,
      });
    } catch (error) {
      sendServerError(response, error);
    }

    return true;
  }

  if (request.method === 'PATCH' && requestUrl.pathname.startsWith('/api/admin/users/')) {
    const adminRequest = await requireAdminAccess();
    if (!adminRequest) {
      return true;
    }

    const targetUserId = normalizeText(decodeURIComponent(requestUrl.pathname.replace('/api/admin/users/', '')));
    if (!targetUserId) {
      sendJson(response, 400, {
        ok: false,
        error: 'target userId is required.',
      });
      return true;
    }

    try {
      const rawBody = await readBody(request);
      const payload = JSON.parse(rawBody || '{}');
      const updatedUser = await repository.updateUserForAdmin({
        userId: targetUserId,
        userName: payload.userName,
        mailTo: payload.mailTo,
        mailCc: payload.mailCc,
        adminNote: payload.adminNote,
        updatedBy: adminRequest.requesterUserId,
      });
      const classifiedUpdatedUser = updatedUser ? classifyAdminUser(updatedUser) : null;
      const recentHistoryRows = classifiedUpdatedUser
        ? await repository.listSnapshotHistory({
            userId: classifiedUpdatedUser.userId,
            sinceDate: startOfRecentWindow(30),
          })
        : [];
      const activityOverview = classifiedUpdatedUser ? buildAdminActivityOverview([classifiedUpdatedUser], recentHistoryRows) : null;
      const [decoratedUser] = classifiedUpdatedUser
        ? decorateAdminUsers(
            [classifiedUpdatedUser],
            activityOverview?.statsByUser ?? new Map(),
            new Set(adminRequest.adminAccess.adminUserIds),
          )
        : [null];

      sendJson(response, 200, {
        ok: true,
        user: decoratedUser,
      });
    } catch (error) {
      sendServerError(response, error);
    }

    return true;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/storage/info') {
    sendJson(response, 200, {
      ok: true,
      storage: {
        mode: 'duckdb-server',
        dbPath: storageInfo.dbPath,
        backupTarget: storageInfo.backupTarget,
      },
    });
    return true;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/greeting/today') {
    const date = requestUrl.searchParams.get('date') ?? '';

    if (!date.trim()) {
      sendJson(response, 400, {
        ok: false,
        error: 'date is required.',
      });
      return true;
    }

    try {
      const fact = await loadTodayFact(date);
      sendJson(response, 200, {
        ok: true,
        fact,
      });
    } catch (error) {
      sendJson(response, 502, {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to load today fact.',
      });
    }

    return true;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/mail/helper-draft') {
    try {
      cleanupMailHelperDrafts();
      const rawBody = await readBody(request);
      const payload = JSON.parse(rawBody || '{}');
      const to = typeof payload.to === 'string' ? payload.to : '';
      const cc = typeof payload.cc === 'string' ? payload.cc : '';
      const subject = typeof payload.subject === 'string' ? payload.subject : '';
      const htmlBody = typeof payload.htmlBody === 'string' ? payload.htmlBody : '';
      const textBody = typeof payload.textBody === 'string' ? payload.textBody : '';

      if (!to.trim()) {
        sendJson(response, 400, {
          ok: false,
          error: '宛先(To)が未設定です。',
        });
        return true;
      }

      if (!subject.trim() || !htmlBody.trim()) {
        sendJson(response, 400, {
          ok: false,
          error: 'メール下書きデータが不足しています。',
        });
        return true;
      }

      const token = crypto.randomUUID();
      mailHelperDrafts.set(token, {
        to,
        cc,
        subject,
        htmlBody,
        textBody,
        createdAt: Date.now(),
      });

      sendJson(response, 200, {
        ok: true,
        payloadUrl: `${buildRequestOrigin(request)}/api/mail/helper-draft/${token}`,
      });
    } catch (error) {
      sendJson(response, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'HTMLメール下書きデータを準備できませんでした。',
      });
    }

    return true;
  }

  if (request.method === 'GET' && requestUrl.pathname.startsWith('/api/mail/helper-draft/')) {
    cleanupMailHelperDrafts();
    const token = requestUrl.pathname.replace('/api/mail/helper-draft/', '').trim();
    const draft = mailHelperDrafts.get(token);

    if (!token || !draft) {
      sendText(response, 404, 'error=not_found');
      return true;
    }

    mailHelperDrafts.delete(token);
    sendText(response, 200, buildMailHelperPayloadText(draft));
    return true;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/storage/heartbeat') {
    try {
      const rawBody = await readBody(request);
      const payload = JSON.parse(rawBody || '{}');
      const touchedUser = await repository.touchUserLastSeen({
        userId: normalizeText(payload.userId),
        userName: normalizeText(payload.userName),
      });

      sendJson(response, 200, {
        ok: true,
        userId: touchedUser?.userId ?? normalizeText(payload.userId),
      });
    } catch (error) {
      sendJson(response, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'heartbeat を保存できませんでした。',
      });
    }
    return true;
  }

  if (requestUrl.pathname !== '/api/storage/session') {
    return false;
  }

  if (request.method === 'GET') {
    const userId = requestUrl.searchParams.get('userId') ?? '';
    if (!userId.trim()) {
      sendJson(response, 400, {
        ok: false,
        error: 'userId is required.',
      });
      return true;
    }

    try {
      const session = await repository.getSession(userId);
      sendJson(response, 200, {
        ok: true,
        session,
      });
    } catch (error) {
      sendServerError(response, error);
    }

    return true;
  }

  if (request.method === 'PUT') {
    try {
      const rawBody = await readBody(request);
      const payload = JSON.parse(rawBody || '{}');
      const savedSession = await repository.saveSession({
        userId: payload.userId,
        userName: payload.userName,
        mailSettings: payload.mailSettings,
        snapshot: payload.snapshot,
        sourceEnv: payload.sourceEnv,
        expectedUpdatedAt: payload.expectedUpdatedAt,
      });

      sendJson(response, 200, {
        ok: true,
        session: savedSession,
      });
    } catch (error) {
      if (error instanceof DuckDbBoardSessionConflictError) {
        sendJson(response, 409, {
          ok: false,
          code: 'conflict',
          error: error.message,
          session: error.latestSession ?? null,
        });
        return true;
      }

      sendServerError(response, error);
    }

    return true;
  }

  sendJson(response, 405, {
    ok: false,
    error: 'Method not allowed.',
  });
  return true;
}

function safeAssetPathname(pathname) {
  const normalizedPathname = pathname === '/' ? '/index.html' : pathname;
  const decodedPathname = decodeURIComponent(normalizedPathname);
  const resolvedPath = path.resolve(distDir, `.${decodedPathname}`);

  if (!resolvedPath.startsWith(distDir)) {
    return null;
  }

  return resolvedPath;
}

async function serveProductionRequest(request, response) {
  const requestUrl = new URL(request.url ?? '/', 'http://localhost');
  const targetPath = safeAssetPathname(requestUrl.pathname);

  if (!targetPath) {
    sendText(response, 403, 'Forbidden');
    return;
  }

  const hasExtension = path.extname(requestUrl.pathname) !== '';

  try {
    const targetStat = await stat(targetPath);
    if (targetStat.isFile()) {
      const contentType = mimeTypes[path.extname(targetPath)] ?? 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': contentType });
      createReadStream(targetPath).pipe(response);
      return;
    }
  } catch {
    if (hasExtension) {
      sendText(response, 404, 'Not found');
      return;
    }
  }

  try {
    const indexHtml = await readFile(path.resolve(distDir, 'index.html'), 'utf8');
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(indexHtml);
  } catch (error) {
    sendServerError(response, error);
  }
}

async function createApplicationServer() {
  const options = parseServerOptions(process.argv.slice(2));
  const repository = new DuckDbBoardSessionRepository({
    rootDir,
  });
  const storageInfo = await repository.initialize();

  const vite =
    options.isDev
      ? await createViteServer({
          root: rootDir,
          appType: 'custom',
          server: {
            middlewareMode: true,
          },
        })
      : null;

  const server = http.createServer(async (request, response) => {
    try {
      const apiHandled = await handleApiRequest(request, response, repository, storageInfo);
      if (apiHandled) {
        return;
      }

      if (vite) {
        vite.middlewares(request, response, async () => {
          try {
            const requestUrl = new URL(request.url ?? '/', 'http://localhost');
            const templatePath = path.resolve(rootDir, 'index.html');
            const template = await readFile(templatePath, 'utf8');
            const transformedTemplate = await vite.transformIndexHtml(requestUrl.pathname, template);
            response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            response.end(transformedTemplate);
          } catch (error) {
            vite.ssrFixStacktrace(error);
            sendServerError(response, error);
          }
        });
        return;
      }

      await serveProductionRequest(request, response);
    } catch (error) {
      sendServerError(response, error);
    }
  });

  server.on('error', (error) => {
    console.error(formatRuntimeErrorMessage('server error.', error));
  });

  return {
    repository,
    server,
    options,
    storageInfo,
    vite,
  };
}

let activeServer = null;
let activeRepository = null;
let activeVite = null;
let isShuttingDown = false;

async function shutdownServer(signal, exitCode = 0) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`[oshigoto-techo] received ${signal}. shutting down...`);
  const shutdownTimeout = setTimeout(() => {
    console.error('[oshigoto-techo] forced shutdown after timeout.');
    process.exit(1);
  }, 5000);
  shutdownTimeout.unref();

  try {
    if (activeServer) {
      await new Promise((resolve, reject) => {
        activeServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });

      console.log('[oshigoto-techo] server closed.');
    }

    try {
      await activeVite?.close();
    } catch (error) {
      exitCode = 1;
      console.error(formatRuntimeErrorMessage('vite shutdown failed.', error));
    }

    try {
      await activeRepository?.close();
    } catch (error) {
      exitCode = 1;
      console.error(formatRuntimeErrorMessage('database shutdown failed.', error));
    }

    process.exit(exitCode);
  } catch (error) {
    console.error(formatRuntimeErrorMessage('shutdown failed.', error));
    process.exit(1);
  } finally {
    clearTimeout(shutdownTimeout);
  }
}

process.on('unhandledRejection', (reason) => {
  console.error(formatRuntimeErrorMessage('unhandled rejection.', reason));
});

process.on('uncaughtException', (error) => {
  console.error(formatRuntimeErrorMessage('uncaught exception.', error));
  void shutdownServer('uncaughtException', 1);
});

process.on('SIGINT', () => {
  void shutdownServer('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdownServer('SIGTERM');
});

process.on('SIGBREAK', () => {
  void shutdownServer('SIGBREAK');
});

process.on('SIGHUP', () => {
  void shutdownServer('SIGHUP');
});

try {
  const { repository, server, options, storageInfo, vite } = await createApplicationServer();
  activeRepository = repository;
  activeServer = server;
  activeVite = vite;

  server.listen(options.port, options.host, () => {
    console.log(
      `[oshigoto-techo] server listening on http://${options.host}:${options.port} (DuckDB: ${storageInfo.dbPath})`,
    );
  });
} catch (error) {
  console.error(formatStartupErrorMessage(error));
  process.exitCode = 1;
}
