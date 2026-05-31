import path from 'node:path';
import { mkdir, rename } from 'node:fs/promises';
import { DuckDBInstance } from '@duckdb/node-api';

const DEFAULT_DB_RELATIVE_PATH = 'data/oshigoto_techo.duckdb';

export class DuckDbBoardSessionConflictError extends Error {
  constructor(message, latestSession) {
    super(message);
    this.name = 'DuckDbBoardSessionConflictError';
    this.latestSession = latestSession;
  }
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isWalReplayFailure(error) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('Failure while replaying WAL file');
}

function isDevelopDatabasePath(dbPath) {
  return path.basename(dbPath).toLowerCase().includes('_develop.duckdb');
}

async function moveIfExists(sourcePath, destinationPath) {
  try {
    await rename(sourcePath, destinationPath);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return;
    }

    throw error;
  }
}

async function quarantineBrokenDatabase(dbPath) {
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const recoveryDir = path.resolve(path.dirname(dbPath), `recovery-${timestamp}-auto`);
  await mkdir(recoveryDir, { recursive: true });

  await moveIfExists(dbPath, path.join(recoveryDir, path.basename(dbPath)));
  await moveIfExists(`${dbPath}.wal`, path.join(recoveryDir, `${path.basename(dbPath)}.wal`));

  return recoveryDir;
}

function normalizeSourceEnv(value) {
  // `source_env` is provenance metadata only. The storage key remains `user_id`,
  // so future BXO / SecureFAT clients can add stable labels here without
  // changing the snapshot layout.
  const normalized = normalizeText(value);
  return normalized || 'web';
}

function normalizeUserIdList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.map((item) => normalizeText(item)).filter(Boolean)));
}

function parseStoredUserIdList(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return [];
  }

  try {
    return normalizeUserIdList(JSON.parse(normalized));
  } catch {
    return [];
  }
}

function normalizeIsoDate(value) {
  const normalized = normalizeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : '';
}

function normalizeTimestampForClient(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return '';
  }

  const utcWithoutOffsetMatch = normalized.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/);
  if (utcWithoutOffsetMatch) {
    return `${utcWithoutOffsetMatch[1]}T${utcWithoutOffsetMatch[2]}Z`;
  }

  const offsetMatch = normalized.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?)([+-]\d{2})(?::?(\d{2}))?$/);
  if (offsetMatch) {
    const [, datePart, timePart, hourOffset, minuteOffset = '00'] = offsetMatch;
    return `${datePart}T${timePart}${hourOffset}:${minuteOffset}`;
  }

  return normalized;
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

function toMinuteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function hasProjectEntryActivity(entry) {
  if (!entry || typeof entry !== 'object') {
    return false;
  }

  return Boolean(
    normalizeText(entry.projectCode) ||
      normalizeText(entry.projectName) ||
      normalizeText(entry.projectSearch) ||
      normalizeText(entry.taskName?.plan) ||
      normalizeText(entry.taskName?.actual) ||
      normalizeText(entry.note?.plan) ||
      normalizeText(entry.note?.actual) ||
      normalizeText(entry.rangeStart?.plan) ||
      normalizeText(entry.rangeStart?.actual) ||
      normalizeText(entry.rangeEnd?.plan) ||
      normalizeText(entry.rangeEnd?.actual) ||
      normalizeText(entry.placeDetail?.plan) ||
      normalizeText(entry.placeDetail?.actual) ||
      toMinuteNumber(entry.minutes?.plan) > 0 ||
      toMinuteNumber(entry.minutes?.actual) > 0,
  );
}

function hasAuxEntryActivity(entry) {
  if (!entry || typeof entry !== 'object') {
    return false;
  }

  return Boolean(
    normalizeText(entry.type) ||
      normalizeText(entry.startTime) ||
      normalizeText(entry.endTime) ||
      normalizeText(entry.note),
  );
}

function hasBoardActivity(board) {
  if (!board || typeof board !== 'object') {
    return false;
  }

  if (
    normalizeText(board.startTime?.plan) ||
    normalizeText(board.startTime?.actual) ||
    normalizeText(board.endTime?.plan) ||
    normalizeText(board.endTime?.actual)
  ) {
    return true;
  }

  if (Array.isArray(board.auxEntries) && board.auxEntries.some((entry) => hasAuxEntryActivity(entry))) {
    return true;
  }

  return Array.isArray(board.projectEntries) && board.projectEntries.some((entry) => hasProjectEntryActivity(entry));
}

function summarizeSnapshot(snapshotJson) {
  if (!snapshotJson) {
    return {
      snapshotMonthAnchorDate: null,
      snapshotCurrentDate: null,
      latestRecordDate: null,
      monthSavedDayCount: 0,
      monthActualMinutes: 0,
      monthPlanMinutes: 0,
    };
  }

  let snapshot;
  try {
    snapshot = typeof snapshotJson === 'string' ? JSON.parse(snapshotJson) : snapshotJson;
  } catch {
    return {
      snapshotMonthAnchorDate: null,
      snapshotCurrentDate: null,
      latestRecordDate: null,
      monthSavedDayCount: 0,
      monthActualMinutes: 0,
      monthPlanMinutes: 0,
    };
  }

  const monthAnchorDate = normalizeIsoDate(snapshot?.monthAnchorDate);
  const currentDate = normalizeIsoDate(snapshot?.currentDate);
  const monthKey = monthAnchorDate ? monthAnchorDate.slice(0, 7) : '';
  const records = snapshot?.recordsByDate && typeof snapshot.recordsByDate === 'object' ? snapshot.recordsByDate : {};
  let latestRecordDate = '';
  let monthSavedDayCount = 0;
  let monthActualMinutes = 0;
  let monthPlanMinutes = 0;

  for (const [rawDate, board] of Object.entries(records)) {
    const date = normalizeIsoDate(rawDate);
    if (!date || !board || typeof board !== 'object') {
      continue;
    }

    const boardIsActive = hasBoardActivity(board);
    if (boardIsActive && (!latestRecordDate || date > latestRecordDate)) {
      latestRecordDate = date;
    }

    if (!monthKey || !date.startsWith(monthKey)) {
      continue;
    }

    if (boardIsActive) {
      monthSavedDayCount += 1;
    }

    if (!Array.isArray(board.projectEntries)) {
      continue;
    }

    for (const entry of board.projectEntries) {
      monthActualMinutes += toMinuteNumber(entry?.minutes?.actual);
      monthPlanMinutes += toMinuteNumber(entry?.minutes?.plan);
    }
  }

  return {
    snapshotMonthAnchorDate: monthAnchorDate || null,
    snapshotCurrentDate: currentDate || null,
    latestRecordDate: latestRecordDate || null,
    monthSavedDayCount,
    monthActualMinutes,
    monthPlanMinutes,
  };
}

function mapAdminUserRow(row) {
  const snapshotSummary = summarizeSnapshot(row.snapshot_json);
  const mailTo = String(row.mail_to ?? '');
  const mailCc = String(row.mail_cc ?? '');

  return {
    userId: String(row.user_id ?? ''),
    userName: String(row.user_name ?? ''),
    mailTo,
    mailCc,
    hasMailSettings: Boolean(normalizeText(mailTo) || normalizeText(mailCc)),
    lastSavedAt: normalizeTimestampForClient(String(row.snapshot_updated_at ?? '')) || null,
    lastSeenAt: normalizeTimestampForClient(String(row.user_last_seen_at ?? '')) || null,
    profileUpdatedAt: normalizeTimestampForClient(String(row.user_updated_at ?? '')) || null,
    sourceEnv: row.source_env ? normalizeSourceEnv(row.source_env) : null,
    adminNote: String(row.admin_note ?? ''),
    adminUpdatedBy: String(row.admin_updated_by ?? ''),
    adminUpdatedAt: normalizeTimestampForClient(String(row.admin_updated_at ?? '')) || null,
    ...snapshotSummary,
  };
}

function mapSnapshotHistoryRow(row) {
  return {
    userId: String(row.user_id ?? ''),
    savedAt: normalizeTimestampForClient(String(row.saved_at ?? '')),
    savedOn: normalizeIsoDate(String(row.saved_on ?? '')) || formatLocalIsoDate(row.saved_at) || null,
    snapshotMonthAnchorDate: normalizeIsoDate(String(row.snapshot_month_anchor_date ?? '')) || null,
    snapshotCurrentDate: normalizeIsoDate(String(row.snapshot_current_date ?? '')) || null,
    latestRecordDate: normalizeIsoDate(String(row.latest_record_date ?? '')) || null,
    monthSavedDayCount: Number(row.month_saved_day_count ?? 0) || 0,
    monthActualMinutes: Number(row.month_actual_minutes ?? 0) || 0,
    monthPlanMinutes: Number(row.month_plan_minutes ?? 0) || 0,
    sourceEnv: normalizeText(String(row.source_env ?? '')) || null,
  };
}

export function resolveDuckDbPath(rootDir, configuredPath = process.env.OSHIGOTO_TECHO_DB_PATH) {
  const targetPath = normalizeText(configuredPath) || DEFAULT_DB_RELATIVE_PATH;
  return path.isAbsolute(targetPath) ? targetPath : path.resolve(rootDir, targetPath);
}

export class DuckDbBoardSessionRepository {
  constructor(options) {
    this.rootDir = options.rootDir;
    this.dbPath = resolveDuckDbPath(options.rootDir, options.dbPath);
    this.instance = null;
    this.connection = null;
    this.connectionPromise = null;
    this.writeQueue = Promise.resolve();
  }

  async initialize() {
    await this.#getConnection();
    return {
      dbPath: this.dbPath,
      backupTarget: path.resolve(this.rootDir, 'data', 'backup'),
    };
  }

  async getSession(userId) {
    const normalizedUserId = normalizeText(userId);
    if (!normalizedUserId) {
      return null;
    }

    const connection = await this.#getConnection();
    const reader = await connection.runAndReadAll(
      `
        SELECT
          snapshots.user_id AS user_id,
          COALESCE(users.user_name, '') AS user_name,
          COALESCE(users.mail_to, '') AS mail_to,
          COALESCE(users.mail_cc, '') AS mail_cc,
          snapshots.snapshot_json AS snapshot_json,
          CAST(snapshots.updated_at AS VARCHAR) AS updated_at,
          snapshots.source_env AS source_env
        FROM board_snapshots AS snapshots
        LEFT JOIN users ON users.user_id = snapshots.user_id
        WHERE snapshots.user_id = $userId
        LIMIT 1
      `,
      { userId: normalizedUserId },
    );

    const [row] = reader.getRowObjectsJson();
    if (!row) {
      return null;
    }

      return {
        userId: String(row.user_id ?? normalizedUserId),
        userName: String(row.user_name ?? ''),
        mailTo: String(row.mail_to ?? ''),
        mailCc: String(row.mail_cc ?? ''),
        snapshotJson: typeof row.snapshot_json === 'string' ? row.snapshot_json : JSON.stringify(row.snapshot_json ?? null),
        updatedAt: normalizeTimestampForClient(String(row.updated_at ?? '')),
        sourceEnv: normalizeSourceEnv(row.source_env),
      };
  }

  async saveSession({ userId, userName, snapshot, sourceEnv, expectedUpdatedAt, mailSettings }) {
    const normalizedUserId = normalizeText(userId);
    const normalizedUserName = normalizeText(userName);
    const normalizedExpectedUpdatedAt = normalizeText(expectedUpdatedAt);
    const hasMailSettings = mailSettings !== undefined && mailSettings !== null;

    if (!normalizedUserId || !normalizedUserName || snapshot === undefined) {
      throw new Error('userId, userName, and snapshot are required.');
    }

    const snapshotJson = JSON.stringify(snapshot);
    const normalizedSourceEnv = normalizeSourceEnv(sourceEnv);
    const updatedAtDate = new Date();
    const updatedAt = updatedAtDate.toISOString();
    const savedOn = formatLocalIsoDate(updatedAtDate);
    const snapshotSummary = summarizeSnapshot(snapshot);

    return this.#enqueueWrite(async () => {
      const connection = await this.#getConnection();
      const currentSession = await this.getSession(normalizedUserId);
      const normalizedMailTo = hasMailSettings
        ? normalizeText(mailSettings?.to)
        : normalizeText(currentSession?.mailTo);
      const normalizedMailCc = hasMailSettings
        ? normalizeText(mailSettings?.cc)
        : normalizeText(currentSession?.mailCc);

      if (currentSession) {
        const currentUpdatedAt = normalizeText(currentSession.updatedAt);

        if (normalizedExpectedUpdatedAt !== currentUpdatedAt) {
          throw new DuckDbBoardSessionConflictError(
            '他の画面または別環境で更新されたため、上書きを中止しました。最新を読み直してください。',
            currentSession,
          );
        }
      }

      await connection.run(
        `
          INSERT INTO users (user_id, user_name, mail_to, mail_cc, updated_at, last_seen_at)
          VALUES ($userId, $userName, $mailTo, $mailCc, $updatedAt, $lastSeenAt)
          ON CONFLICT (user_id) DO UPDATE
            SET user_name = EXCLUDED.user_name,
                mail_to = EXCLUDED.mail_to,
                mail_cc = EXCLUDED.mail_cc,
                updated_at = $updatedAt,
                last_seen_at = $lastSeenAt
        `,
        {
          userId: normalizedUserId,
          userName: normalizedUserName,
          mailTo: normalizedMailTo,
          mailCc: normalizedMailCc,
          updatedAt,
          lastSeenAt: updatedAt,
        },
      );

      await connection.run(
        `
          INSERT INTO board_snapshots (user_id, snapshot_json, updated_at, source_env)
          VALUES ($userId, $snapshotJson, $updatedAt, $sourceEnv)
          ON CONFLICT (user_id) DO UPDATE
            SET snapshot_json = EXCLUDED.snapshot_json,
                updated_at = $updatedAt,
                source_env = EXCLUDED.source_env
        `,
        {
          userId: normalizedUserId,
          snapshotJson,
          updatedAt,
          sourceEnv: normalizedSourceEnv,
        },
      );

      await connection.run(
        `
          INSERT INTO board_snapshot_history (
            user_id,
            saved_at,
            saved_on,
            snapshot_month_anchor_date,
            snapshot_current_date,
            latest_record_date,
            month_saved_day_count,
            month_actual_minutes,
            month_plan_minutes,
            source_env
          )
          VALUES (
            $userId,
            $savedAt,
            $savedOn,
            $snapshotMonthAnchorDate,
            $snapshotCurrentDate,
            $latestRecordDate,
            $monthSavedDayCount,
            $monthActualMinutes,
            $monthPlanMinutes,
            $sourceEnv
          )
        `,
        {
          userId: normalizedUserId,
          savedAt: updatedAt,
          savedOn,
          snapshotMonthAnchorDate: snapshotSummary.snapshotMonthAnchorDate ?? '',
          snapshotCurrentDate: snapshotSummary.snapshotCurrentDate ?? '',
          latestRecordDate: snapshotSummary.latestRecordDate ?? '',
          monthSavedDayCount: snapshotSummary.monthSavedDayCount,
          monthActualMinutes: snapshotSummary.monthActualMinutes,
          monthPlanMinutes: snapshotSummary.monthPlanMinutes,
          sourceEnv: normalizedSourceEnv,
        },
      );

      return this.getSession(normalizedUserId);
    });
  }

  async listUsersForAdmin() {
    const connection = await this.#getConnection();
    const reader = await connection.runAndReadAll(`
      SELECT
        users.user_id AS user_id,
        users.user_name AS user_name,
        COALESCE(users.mail_to, '') AS mail_to,
        COALESCE(users.mail_cc, '') AS mail_cc,
        CAST(users.updated_at AS VARCHAR) AS user_updated_at,
        CAST(users.last_seen_at AS VARCHAR) AS user_last_seen_at,
        snapshots.snapshot_json AS snapshot_json,
        CAST(snapshots.updated_at AS VARCHAR) AS snapshot_updated_at,
        snapshots.source_env AS source_env,
        COALESCE(admin_meta.admin_note, '') AS admin_note,
        COALESCE(admin_meta.updated_by, '') AS admin_updated_by,
        CAST(admin_meta.updated_at AS VARCHAR) AS admin_updated_at
      FROM users
      LEFT JOIN board_snapshots AS snapshots ON snapshots.user_id = users.user_id
      LEFT JOIN user_admin_meta AS admin_meta ON admin_meta.user_id = users.user_id
      ORDER BY snapshots.updated_at DESC NULLS LAST, users.updated_at DESC, users.user_id ASC
    `);

    return reader.getRowObjectsJson().map((row) => mapAdminUserRow(row));
  }

  async getReferenceFavoriteUserIds(viewerUserId) {
    const normalizedViewerUserId = normalizeText(viewerUserId);
    if (!normalizedViewerUserId) {
      return [];
    }

    const connection = await this.#getConnection();
    const reader = await connection.runAndReadAll(
      `
        SELECT favorite_user_ids_json
        FROM user_reference_preferences
        WHERE viewer_user_id = $viewerUserId
        LIMIT 1
      `,
      {
        viewerUserId: normalizedViewerUserId,
      },
    );

    const [row] = reader.getRowObjectsJson();
    return parseStoredUserIdList(row?.favorite_user_ids_json);
  }

  async saveReferenceFavoriteUserIds({ viewerUserId, favoriteUserIds }) {
    const normalizedViewerUserId = normalizeText(viewerUserId);
    const normalizedFavoriteUserIds = normalizeUserIdList(favoriteUserIds);

    if (!normalizedViewerUserId) {
      throw new Error('viewerUserId is required.');
    }

    return this.#enqueueWrite(async () => {
      const connection = await this.#getConnection();
      const updatedAt = new Date().toISOString();

      await connection.run(
        `
          INSERT INTO user_reference_preferences (viewer_user_id, favorite_user_ids_json, updated_at)
          VALUES ($viewerUserId, $favoriteUserIdsJson, $updatedAt)
          ON CONFLICT (viewer_user_id) DO UPDATE
            SET favorite_user_ids_json = EXCLUDED.favorite_user_ids_json,
                updated_at = $updatedAt
        `,
        {
          viewerUserId: normalizedViewerUserId,
          favoriteUserIdsJson: JSON.stringify(normalizedFavoriteUserIds),
          updatedAt,
        },
      );

      return normalizedFavoriteUserIds;
    });
  }

  async touchUserLastSeen({ userId, userName }) {
    const normalizedUserId = normalizeText(userId);
    const normalizedUserName = normalizeText(userName);

    if (!normalizedUserId) {
      throw new Error('userId is required.');
    }

    return this.#enqueueWrite(async () => {
      const connection = await this.#getConnection();
      const lastSeenAt = new Date().toISOString();

      await connection.run(
        `
          INSERT INTO users (user_id, user_name, last_seen_at)
          VALUES ($userId, $userName, $lastSeenAt)
          ON CONFLICT (user_id) DO UPDATE
            SET last_seen_at = $lastSeenAt
        `,
        {
          userId: normalizedUserId,
          userName: normalizedUserName || normalizedUserId,
          lastSeenAt,
        },
      );

      const users = await this.listUsersForAdmin();
      return users.find((user) => user.userId === normalizedUserId) ?? null;
    });
  }

  async updateUserForAdmin({ userId, userName, mailTo, mailCc, adminNote, updatedBy }) {
    const normalizedUserId = normalizeText(userId);
    const normalizedUserName = normalizeText(userName);
    const normalizedMailTo = normalizeText(mailTo);
    const normalizedMailCc = normalizeText(mailCc);
    const normalizedAdminNote = typeof adminNote === 'string' ? adminNote.trim() : '';
    const normalizedUpdatedBy = normalizeText(updatedBy);

    if (!normalizedUserId || !normalizedUserName) {
      throw new Error('userId and userName are required.');
    }

    return this.#enqueueWrite(async () => {
      const connection = await this.#getConnection();
      const updatedAt = new Date().toISOString();

      await connection.run(
        `
          INSERT INTO users (user_id, user_name, mail_to, mail_cc, updated_at)
          VALUES ($userId, $userName, $mailTo, $mailCc, $updatedAt)
          ON CONFLICT (user_id) DO UPDATE
            SET user_name = EXCLUDED.user_name,
                mail_to = EXCLUDED.mail_to,
                mail_cc = EXCLUDED.mail_cc,
                updated_at = $updatedAt
        `,
        {
          userId: normalizedUserId,
          userName: normalizedUserName,
          mailTo: normalizedMailTo,
          mailCc: normalizedMailCc,
          updatedAt,
        },
      );

      await connection.run(
        `
          INSERT INTO user_admin_meta (user_id, admin_note, updated_by, updated_at)
          VALUES ($userId, $adminNote, $updatedBy, $updatedAt)
          ON CONFLICT (user_id) DO UPDATE
            SET admin_note = EXCLUDED.admin_note,
                updated_by = EXCLUDED.updated_by,
                updated_at = $updatedAt
        `,
        {
          userId: normalizedUserId,
          adminNote: normalizedAdminNote,
          updatedBy: normalizedUpdatedBy,
          updatedAt,
        },
      );

      const users = await this.listUsersForAdmin();
      return users.find((user) => user.userId === normalizedUserId) ?? null;
    });
  }

  async deleteUserForAdmin(userId) {
    const normalizedUserId = normalizeText(userId);
    if (!normalizedUserId) {
      throw new Error('userId is required.');
    }

    return this.#enqueueWrite(async () => {
      const connection = await this.#getConnection();

      await connection.run(`DELETE FROM board_snapshot_history WHERE user_id = $userId`, {
        userId: normalizedUserId,
      });
      await connection.run(`DELETE FROM board_snapshots WHERE user_id = $userId`, {
        userId: normalizedUserId,
      });
      await connection.run(`DELETE FROM user_admin_meta WHERE user_id = $userId`, {
        userId: normalizedUserId,
      });
      await connection.run(`DELETE FROM users WHERE user_id = $userId`, {
        userId: normalizedUserId,
      });

      return {
        userId: normalizedUserId,
      };
    });
  }

  async listSnapshotHistory({ userId, sinceDate, limit } = {}) {
    const connection = await this.#getConnection();
    const normalizedUserId = normalizeText(userId);
    const normalizedSinceDate = normalizeIsoDate(sinceDate);
    const normalizedLimit = Number.isInteger(limit) && limit > 0 ? limit : null;
    const whereClauses = [];
    const parameters = {};

    if (normalizedUserId) {
      whereClauses.push('user_id = $userId');
      parameters.userId = normalizedUserId;
    }

    if (normalizedSinceDate) {
      whereClauses.push('saved_on >= $sinceDate');
      parameters.sinceDate = normalizedSinceDate;
    }

    const whereClause = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const limitClause = normalizedLimit ? `LIMIT ${normalizedLimit}` : '';

    const reader = await connection.runAndReadAll(
      `
        SELECT
          user_id,
          saved_at,
          saved_on,
          snapshot_month_anchor_date,
          snapshot_current_date,
          latest_record_date,
          month_saved_day_count,
          month_actual_minutes,
          month_plan_minutes,
          source_env
        FROM board_snapshot_history
        ${whereClause}
        ORDER BY saved_at DESC
        ${limitClause}
      `,
      parameters,
    );

    return reader.getRowObjectsJson().map((row) => mapSnapshotHistoryRow(row));
  }

  async #getConnection() {
    if (!this.connectionPromise) {
      this.connectionPromise = this.#openConnection();
    }

    return this.connectionPromise;
  }

  async #openConnection(allowAutoRecovery = true) {
    await mkdir(path.dirname(this.dbPath), { recursive: true });
    let connection;

    try {
      this.instance = await DuckDBInstance.fromCache(this.dbPath);
      connection = await this.instance.connect();
      this.connection = connection;
    } catch (error) {
      if (allowAutoRecovery && isDevelopDatabasePath(this.dbPath) && isWalReplayFailure(error)) {
        await this.close();
        const recoveryDir = await quarantineBrokenDatabase(this.dbPath);
        console.warn(
          `[oshigoto-techo] develop database WAL recovery failed. Moved files to ${recoveryDir} and recreated a fresh DB.`,
        );
        return this.#openConnection(false);
      }

      throw error;
    }

    await connection.run(`
      CREATE TABLE IF NOT EXISTS users (
        user_id VARCHAR PRIMARY KEY,
        user_name VARCHAR NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_seen_at TIMESTAMP
      )
    `);

    await connection.run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS mail_to VARCHAR DEFAULT ''`);
    await connection.run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS mail_cc VARCHAR DEFAULT ''`);
    await connection.run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP`);

    await connection.run(`
      CREATE TABLE IF NOT EXISTS board_snapshots (
        user_id VARCHAR PRIMARY KEY,
        snapshot_json VARCHAR NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        source_env VARCHAR NOT NULL DEFAULT 'web'
      )
    `);

    await connection.run(`
      CREATE TABLE IF NOT EXISTS board_snapshot_history (
        user_id VARCHAR NOT NULL,
        saved_at VARCHAR NOT NULL,
        saved_on VARCHAR NOT NULL,
        snapshot_month_anchor_date VARCHAR DEFAULT '',
        snapshot_current_date VARCHAR DEFAULT '',
        latest_record_date VARCHAR DEFAULT '',
        month_saved_day_count INTEGER DEFAULT 0,
        month_actual_minutes INTEGER DEFAULT 0,
        month_plan_minutes INTEGER DEFAULT 0,
        source_env VARCHAR NOT NULL DEFAULT 'web'
      )
    `);

    await connection.run(`ALTER TABLE board_snapshot_history ADD COLUMN IF NOT EXISTS saved_at VARCHAR DEFAULT ''`);
    await connection.run(`ALTER TABLE board_snapshot_history ADD COLUMN IF NOT EXISTS saved_on VARCHAR DEFAULT ''`);
    await connection.run(`ALTER TABLE board_snapshot_history ADD COLUMN IF NOT EXISTS snapshot_month_anchor_date VARCHAR DEFAULT ''`);
    await connection.run(`ALTER TABLE board_snapshot_history ADD COLUMN IF NOT EXISTS snapshot_current_date VARCHAR DEFAULT ''`);
    await connection.run(`ALTER TABLE board_snapshot_history ADD COLUMN IF NOT EXISTS latest_record_date VARCHAR DEFAULT ''`);
    await connection.run(`ALTER TABLE board_snapshot_history ADD COLUMN IF NOT EXISTS month_saved_day_count INTEGER DEFAULT 0`);
    await connection.run(`ALTER TABLE board_snapshot_history ADD COLUMN IF NOT EXISTS month_actual_minutes INTEGER DEFAULT 0`);
    await connection.run(`ALTER TABLE board_snapshot_history ADD COLUMN IF NOT EXISTS month_plan_minutes INTEGER DEFAULT 0`);
    await connection.run(`ALTER TABLE board_snapshot_history ADD COLUMN IF NOT EXISTS source_env VARCHAR DEFAULT 'web'`);

    await connection.run(`
      CREATE TABLE IF NOT EXISTS user_admin_meta (
        user_id VARCHAR PRIMARY KEY,
        admin_note VARCHAR DEFAULT '',
        updated_by VARCHAR DEFAULT '',
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await connection.run(`ALTER TABLE user_admin_meta ADD COLUMN IF NOT EXISTS admin_note VARCHAR DEFAULT ''`);
    await connection.run(`ALTER TABLE user_admin_meta ADD COLUMN IF NOT EXISTS updated_by VARCHAR DEFAULT ''`);
    await connection.run(`ALTER TABLE user_admin_meta ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);

    await connection.run(`
      CREATE TABLE IF NOT EXISTS user_reference_preferences (
        viewer_user_id VARCHAR PRIMARY KEY,
        favorite_user_ids_json VARCHAR NOT NULL DEFAULT '[]',
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await connection.run(`ALTER TABLE user_reference_preferences ADD COLUMN IF NOT EXISTS favorite_user_ids_json VARCHAR DEFAULT '[]'`);
    await connection.run(`ALTER TABLE user_reference_preferences ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);

    return connection;
  }

  async close() {
    try {
      await this.writeQueue;
    } catch {}

    try {
      await this.connection?.run('CHECKPOINT');
    } catch {}

    try {
      this.connection?.closeSync();
    } catch {}

    this.connection = null;
    this.connectionPromise = null;

    try {
      this.instance?.closeSync();
    } catch {}

    this.instance = null;
  }

  async #enqueueWrite(operation) {
    const runOperation = async () => {
      const result = await operation();

      try {
        const connection = await this.#getConnection();
        await connection.run('CHECKPOINT');
      } catch {}

      return result;
    };

    const nextWrite = this.writeQueue.then(runOperation, runOperation);
    this.writeQueue = nextWrite.then(
      () => undefined,
      () => undefined,
    );
    return nextWrite;
  }
}
