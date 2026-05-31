import type { BoardSessionSnapshot } from './board-storage';
import { restoreBoardSessionSnapshot } from './board-storage';
import { normalizeCurrentUserId, normalizeCurrentUserName } from './current-user-storage';
import { normalizeMailRecipientSettings } from '../lib/mail-settings';
import type { MailRecipientSettings } from '../types/mail';

export interface ServerUserProfile {
  userId: string;
  userName: string;
}

export interface ServerStorageInfo {
  mode: string;
  dbPath: string;
  backupTarget: string;
}

export const serverSourceEnvs = {
  web: 'web',
  browserMigration: 'browser-migration',
} as const;

/**
 * `sourceEnv` is provenance metadata for server-side snapshots.
 * It is not part of the storage key. Future BXO / SecureFAT clients should
 * add stable labels here while continuing to key business data by `userId`.
 */
export type ServerSourceEnv = (typeof serverSourceEnvs)[keyof typeof serverSourceEnvs] | string;

export interface StoredBoardSession {
  userId: string;
  userName: string;
  mailSettings: MailRecipientSettings;
  snapshot: BoardSessionSnapshot;
  updatedAt: string;
  sourceEnv: string;
}

export interface SaveServerBoardSessionOptions {
  sourceEnv?: ServerSourceEnv;
  expectedUpdatedAt?: string | null;
  mailSettings?: MailRecipientSettings;
}

interface ServerBoardSessionRecord {
  userId: string;
  userName: string;
  mailTo?: string;
  mailCc?: string;
  snapshotJson: string;
  updatedAt: string;
  sourceEnv: string;
}

interface ServerSessionResponse {
  ok: boolean;
  session: ServerBoardSessionRecord | null;
  code?: string;
  error?: string;
}

interface ServerInfoResponse {
  ok: boolean;
  storage: ServerStorageInfo;
}

interface ServerHeartbeatResponse {
  ok: boolean;
  userId?: string;
  error?: string;
}

export class ServerBoardSessionConflictError extends Error {
  latestSession: StoredBoardSession | null;

  constructor(message: string, latestSession: StoredBoardSession | null) {
    super(message);
    this.name = 'ServerBoardSessionConflictError';
    this.latestSession = latestSession;
  }
}

async function parseJsonResponse<T>(response: Response, allowedStatusCodes: number[] = []) {
  const contentType = response.headers.get('content-type') ?? '';
  const rawBody = await response.text();

  if (!rawBody.trim()) {
    throw new Error(
      response.ok
        ? 'サーバ保存 API の応答が空でした。開発サーバを再起動してください。'
        : `サーバ保存 API の応答が空でした (${response.status})。`,
    );
  }

  if (!contentType.includes('application/json')) {
    throw new Error(
      `サーバ保存 API から JSON 以外が返りました (${response.status}, ${contentType || 'unknown'}). ` +
        'Vite 単体ではなく統合アプリサーバで起動しているか確認してください。',
    );
  }

  let payload: (T & { error?: string }) | null = null;

  try {
    payload = JSON.parse(rawBody) as T & { error?: string };
  } catch {
    throw new Error(
      `サーバ保存 API の JSON 解析に失敗しました (${response.status})。` +
        '開発サーバを再起動して再試行してください。',
    );
  }

  if (!response.ok && !allowedStatusCodes.includes(response.status)) {
    throw new Error(payload.error || `Server storage request failed: ${response.status}`);
  }

  return payload;
}

function restoreStoredBoardSession(
  record: ServerBoardSessionRecord | null,
  fallback: BoardSessionSnapshot,
): StoredBoardSession | null {
  if (!record) {
    return null;
  }

  try {
    const parsedSnapshot = JSON.parse(record.snapshotJson);
    const restoredSnapshot = restoreBoardSessionSnapshot(parsedSnapshot, fallback);

    if (!restoredSnapshot) {
      return null;
    }

    return {
      userId: normalizeCurrentUserId(record.userId),
      userName: normalizeCurrentUserName(record.userName),
      mailSettings: normalizeMailRecipientSettings({
        to: record.mailTo,
        cc: record.mailCc,
      }),
      snapshot: restoredSnapshot,
      updatedAt: record.updatedAt,
      sourceEnv: record.sourceEnv,
    } satisfies StoredBoardSession;
  } catch {
    return null;
  }
}

export async function loadServerBoardSession(fallback: BoardSessionSnapshot, profile: ServerUserProfile) {
  const normalizedUserId = normalizeCurrentUserId(profile.userId);
  const response = await fetch(`/api/storage/session?userId=${encodeURIComponent(normalizedUserId)}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });
  const payload = await parseJsonResponse<ServerSessionResponse>(response);
  return restoreStoredBoardSession(payload.session, fallback);
}

export async function saveServerBoardSession(
  snapshot: BoardSessionSnapshot,
  profile: ServerUserProfile,
  options: SaveServerBoardSessionOptions = {},
) {
  const {
    sourceEnv = serverSourceEnvs.web,
    expectedUpdatedAt = null,
    mailSettings = { to: '', cc: '' },
  } = options;
  const response = await fetch('/api/storage/session', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      userId: normalizeCurrentUserId(profile.userId),
      userName: normalizeCurrentUserName(profile.userName),
      mailSettings: normalizeMailRecipientSettings(mailSettings),
      snapshot,
      sourceEnv,
      expectedUpdatedAt,
    }),
  });

  const payload = await parseJsonResponse<ServerSessionResponse>(response, [409]);
  const restoredSession = restoreStoredBoardSession(payload.session, snapshot);

  if (response.status === 409) {
    throw new ServerBoardSessionConflictError(
      payload.error || '他の画面または別環境で更新されたため、上書きを中止しました。',
      restoredSession,
    );
  }

  return restoredSession;
}

export function saveServerBoardSessionKeepalive(
  snapshot: BoardSessionSnapshot,
  profile: ServerUserProfile,
  options: SaveServerBoardSessionOptions = {},
) {
  const {
    sourceEnv = serverSourceEnvs.web,
    expectedUpdatedAt = null,
    mailSettings = { to: '', cc: '' },
  } = options;

  try {
    void fetch('/api/storage/session', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        userId: normalizeCurrentUserId(profile.userId),
        userName: normalizeCurrentUserName(profile.userName),
        mailSettings: normalizeMailRecipientSettings(mailSettings),
        snapshot,
        sourceEnv,
        expectedUpdatedAt,
      }),
      keepalive: true,
    });
    return true;
  } catch {
    return false;
  }
}

export async function sendServerUserHeartbeat(profile: ServerUserProfile) {
  const response = await fetch('/api/storage/heartbeat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      userId: normalizeCurrentUserId(profile.userId),
      userName: normalizeCurrentUserName(profile.userName),
    }),
  });
  await parseJsonResponse<ServerHeartbeatResponse>(response);
}

export async function loadServerStorageInfo() {
  const response = await fetch('/api/storage/info', {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });
  const payload = await parseJsonResponse<ServerInfoResponse>(response);
  return payload.storage;
}
