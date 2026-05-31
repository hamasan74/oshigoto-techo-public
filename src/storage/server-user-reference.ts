import { restoreBoardSessionSnapshot, type BoardSessionSnapshot } from './board-storage';
import { normalizeCurrentUserId, normalizeCurrentUserName } from './current-user-storage';

export interface ServerReferenceUserRecord {
  userId: string;
  userName: string;
  lastSavedAt: string | null;
  lastSeenAt: string | null;
  snapshotMonthAnchorDate: string | null;
  snapshotCurrentDate: string | null;
  latestRecordDate: string | null;
  monthSavedDayCount: number;
  monthActualMinutes: number;
  monthPlanMinutes: number;
  isAdmin: boolean;
}

export interface ServerReferenceSession {
  userId: string;
  userName: string;
  updatedAt: string;
  sourceEnv: string;
  snapshot: BoardSessionSnapshot;
}

export interface ServerReferenceExportResult {
  sessions: ServerReferenceSession[];
  skippedUsers: Array<{ userId: string; reason: string }>;
}

interface ServerReferenceUsersResponse {
  ok: boolean;
  users: ServerReferenceUserRecord[];
  favoriteUserIds?: string[];
  error?: string;
}

interface RawReferenceSessionPayload {
  userId: string;
  userName: string;
  snapshotJson: string;
  updatedAt: string;
  sourceEnv: string;
}

interface ServerReferenceSessionResponse {
  ok: boolean;
  session: RawReferenceSessionPayload | null;
  error?: string;
}

interface ServerReferenceExportResponse {
  ok: boolean;
  sessions: RawReferenceSessionPayload[];
  skippedUsers?: Array<{ userId: string; reason: string }>;
  error?: string;
}

interface ServerReferencePreferencesResponse {
  ok: boolean;
  favoriteUserIds?: string[];
  error?: string;
}

function toNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

async function parseJsonResponse<T>(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';
  const rawBody = await response.text();

  if (!rawBody.trim()) {
    throw new Error(
      response.ok
        ? '利用者参照 API の応答が空でした。開発サーバを再起動してください。'
        : `利用者参照 API の応答が空でした。(${response.status})`,
    );
  }

  if (!contentType.includes('application/json')) {
    throw new Error(
      `利用者参照 API から JSON 以外の応答が返りました。(${response.status}, ${contentType || 'unknown'}) ` +
        '開発サーバを再起動して再試行してください。',
    );
  }

  let payload: (T & { error?: string }) | null = null;
  try {
    payload = JSON.parse(rawBody) as T & { error?: string };
  } catch {
    throw new Error(`利用者参照 API の JSON 読み込みに失敗しました。(${response.status}) 開発サーバを再起動してください。`);
  }

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

function createSnapshotFallback(snapshotJson: string): BoardSessionSnapshot {
  let parsedSnapshot: Partial<BoardSessionSnapshot> | null = null;

  try {
    parsedSnapshot = JSON.parse(snapshotJson) as Partial<BoardSessionSnapshot>;
  } catch {
    parsedSnapshot = null;
  }

  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const monthAnchorDate =
    typeof parsedSnapshot?.monthAnchorDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsedSnapshot.monthAnchorDate)
      ? parsedSnapshot.monthAnchorDate
      : `${todayIso.slice(0, 7)}-01`;
  const currentDate =
    typeof parsedSnapshot?.currentDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsedSnapshot.currentDate)
      ? parsedSnapshot.currentDate
      : monthAnchorDate;

  return {
    recordsByDate: {},
    currentDate,
    monthAnchorDate,
  };
}

function normalizeReferenceUserRecord(user: ServerReferenceUserRecord): ServerReferenceUserRecord {
  return {
    userId: normalizeCurrentUserId(user.userId),
    userName: normalizeCurrentUserName(user.userName),
    lastSavedAt: typeof user.lastSavedAt === 'string' && user.lastSavedAt.trim() ? user.lastSavedAt : null,
    lastSeenAt: typeof user.lastSeenAt === 'string' && user.lastSeenAt.trim() ? user.lastSeenAt : null,
    snapshotMonthAnchorDate:
      typeof user.snapshotMonthAnchorDate === 'string' && user.snapshotMonthAnchorDate.trim() ? user.snapshotMonthAnchorDate : null,
    snapshotCurrentDate:
      typeof user.snapshotCurrentDate === 'string' && user.snapshotCurrentDate.trim() ? user.snapshotCurrentDate : null,
    latestRecordDate: typeof user.latestRecordDate === 'string' && user.latestRecordDate.trim() ? user.latestRecordDate : null,
    monthSavedDayCount: toNumber(user.monthSavedDayCount),
    monthActualMinutes: toNumber(user.monthActualMinutes),
    monthPlanMinutes: toNumber(user.monthPlanMinutes),
    isAdmin: Boolean(user.isAdmin),
  };
}

function normalizeReferenceUserIds(userIds: string[] | undefined) {
  return Array.isArray(userIds)
    ? Array.from(new Set(userIds.map((userId) => normalizeCurrentUserId(userId)).filter(Boolean)))
    : [];
}

function normalizeReferenceSession(session: RawReferenceSessionPayload | null): ServerReferenceSession | null {
  if (!session) {
    return null;
  }

  let parsedSnapshot: unknown;
  try {
    parsedSnapshot = JSON.parse(session.snapshotJson);
  } catch {
    throw new Error('保存済みスナップショットの読み込みに失敗しました。');
  }

  const fallback = createSnapshotFallback(session.snapshotJson);
  const restored = restoreBoardSessionSnapshot(parsedSnapshot, fallback);
  if (!restored) {
    throw new Error('保存済みスナップショットを参照用に復元できませんでした。');
  }

  return {
    userId: normalizeCurrentUserId(session.userId),
    userName: normalizeCurrentUserName(session.userName),
    updatedAt: typeof session.updatedAt === 'string' ? session.updatedAt : '',
    sourceEnv: typeof session.sourceEnv === 'string' ? session.sourceEnv : '',
    snapshot: restored,
  };
}

export async function loadServerReferenceUsers(currentUserId: string) {
  const response = await fetch(`/api/admin/reference/users?ts=${Date.now()}`, {
    method: 'GET',
    cache: 'no-store',
    headers: buildAdminHeaders(currentUserId),
  });
  const payload = await parseJsonResponse<ServerReferenceUsersResponse>(response);
  return {
    users: payload.users.map((user) => normalizeReferenceUserRecord(user)),
    favoriteUserIds: normalizeReferenceUserIds(payload.favoriteUserIds),
  };
}

export async function loadServerReferenceSession(currentUserId: string, targetUserId: string) {
  const targetPath = `/api/admin/reference/users/${encodeURIComponent(normalizeCurrentUserId(targetUserId))}/session?ts=${Date.now()}`;
  const response = await fetch(targetPath, {
    method: 'GET',
    cache: 'no-store',
    headers: buildAdminHeaders(currentUserId),
  });
  const payload = await parseJsonResponse<ServerReferenceSessionResponse>(response);
  return normalizeReferenceSession(payload.session);
}

export async function loadServerReferenceExportSessions(currentUserId: string, targetUserIds: string[]) {
  const normalizedUserIds = Array.from(new Set(targetUserIds.map((userId) => normalizeCurrentUserId(userId)).filter(Boolean)));
  const response = await fetch('/api/admin/reference/export-sessions', {
    method: 'POST',
    cache: 'no-store',
    headers: {
      ...buildAdminHeaders(currentUserId),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userIds: normalizedUserIds,
    }),
  });
  const payload = await parseJsonResponse<ServerReferenceExportResponse>(response);
  return {
    sessions: payload.sessions.map((session) => normalizeReferenceSession(session)).filter(Boolean) as ServerReferenceSession[],
    skippedUsers: Array.isArray(payload.skippedUsers)
      ? payload.skippedUsers.map((entry) => ({
          userId: normalizeCurrentUserId(entry.userId),
          reason: typeof entry.reason === 'string' ? entry.reason : '',
        }))
      : [],
  } satisfies ServerReferenceExportResult;
}

export async function saveServerReferenceFavorites(currentUserId: string, favoriteUserIds: string[]) {
  const response = await fetch('/api/admin/reference/preferences', {
    method: 'PATCH',
    cache: 'no-store',
    headers: {
      ...buildAdminHeaders(currentUserId),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      favoriteUserIds: normalizeReferenceUserIds(favoriteUserIds),
    }),
  });
  const payload = await parseJsonResponse<ServerReferencePreferencesResponse>(response);
  return normalizeReferenceUserIds(payload.favoriteUserIds);
}
