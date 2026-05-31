import { cloneInputBoardDraft } from '../lib/input-board';
import type { InputBoardDraft } from '../types/input-board';
import {
  readJsonStorage,
  readStorageValue,
  removeStorageValue,
  writeJsonStorage,
  writeStorageValue,
} from './browser-storage';
import {
  buildUserScopedDatabaseKey,
  buildUserScopedStorageKey,
  defaultCurrentUserId,
  normalizeCurrentUserId,
} from './current-user-storage';
import { readDatabaseValue, writeDatabaseValue } from './indexeddb-storage';
import { indexedDbKeys, storageKeys } from './storage-keys';

export interface BoardSessionSnapshot {
  recordsByDate: Record<string, InputBoardDraft>;
  currentDate: string;
  monthAnchorDate: string;
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function restoreRecords(value: unknown) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const restoredRecords = Object.fromEntries(
    Object.entries(value as Record<string, InputBoardDraft>).flatMap(([date, board]) => {
      if (!board || typeof board !== 'object') {
        return [];
      }

      try {
        return [[date, cloneInputBoardDraft(board as InputBoardDraft)]];
      } catch {
        return [];
      }
    }),
  ) as Record<string, InputBoardDraft>;

  return Object.keys(restoredRecords).length > 0 ? restoredRecords : null;
}

function normalizeDate(raw: string | null, fallback: string) {
  return raw && isIsoDate(raw) ? raw : fallback;
}

export function restoreBoardSessionSnapshot(value: unknown, fallback: BoardSessionSnapshot) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<BoardSessionSnapshot>;
  const restoredRecords = restoreRecords(candidate.recordsByDate);
  if (!restoredRecords || typeof candidate.currentDate !== 'string' || typeof candidate.monthAnchorDate !== 'string') {
    return null;
  }

  return {
    recordsByDate: restoredRecords,
    currentDate: normalizeDate(candidate.currentDate, fallback.currentDate),
    monthAnchorDate: normalizeDate(candidate.monthAnchorDate, fallback.monthAnchorDate),
  } satisfies BoardSessionSnapshot;
}

function getBoardSessionMirrorKeys(userId: string) {
  return {
    recordsByDate: buildUserScopedStorageKey(storageKeys.recordsByDate, userId),
    currentDate: buildUserScopedStorageKey(storageKeys.currentDate, userId),
    monthAnchorDate: buildUserScopedStorageKey(storageKeys.monthAnchorDate, userId),
    boardSessionSnapshot: buildUserScopedStorageKey(storageKeys.boardSessionSnapshot, userId),
  };
}

function hasLocalBoardSessionMirror(userId: string) {
  const mirrorKeys = getBoardSessionMirrorKeys(userId);
  return [
    mirrorKeys.recordsByDate,
    mirrorKeys.currentDate,
    mirrorKeys.monthAnchorDate,
    mirrorKeys.boardSessionSnapshot,
  ].some((key) => readStorageValue(key) !== null);
}

function writeLocalBoardSessionMirror(snapshot: BoardSessionSnapshot, userId: string) {
  const mirrorKeys = getBoardSessionMirrorKeys(userId);

  // IndexedDB is the primary store for business data. The localStorage mirror
  // keeps bootstrap loading fast and preserves compatibility with older saves.
  // recordsByDate still contains daily board data together with project master
  // defaults and monthly planning values until the later split.
  writeJsonStorage(mirrorKeys.recordsByDate, snapshot.recordsByDate);
  writeStorageValue(mirrorKeys.currentDate, snapshot.currentDate);
  writeStorageValue(mirrorKeys.monthAnchorDate, snapshot.monthAnchorDate);
  removeStorageValue(mirrorKeys.boardSessionSnapshot);
}

export function readBoardSession(fallback: BoardSessionSnapshot, userId = defaultCurrentUserId): BoardSessionSnapshot {
  const normalizedUserId = normalizeCurrentUserId(userId);
  const mirrorKeys = getBoardSessionMirrorKeys(normalizedUserId);

  const snapshot = readJsonStorage(mirrorKeys.boardSessionSnapshot, (value) =>
    restoreBoardSessionSnapshot(value, fallback),
  );

  if (snapshot) {
    return snapshot;
  }

  const legacyRecords = readJsonStorage(mirrorKeys.recordsByDate, restoreRecords) ?? fallback.recordsByDate;

  return {
    recordsByDate: legacyRecords,
    currentDate: normalizeDate(readStorageValue(mirrorKeys.currentDate), fallback.currentDate),
    monthAnchorDate: normalizeDate(readStorageValue(mirrorKeys.monthAnchorDate), fallback.monthAnchorDate),
  };
}

async function readBoardSessionFromIndexedDb(fallback: BoardSessionSnapshot, userId: string) {
  return readDatabaseValue(
    indexedDbKeys.stores.snapshots,
    buildUserScopedDatabaseKey(indexedDbKeys.boardSession, userId),
    (value) => restoreBoardSessionSnapshot(value, fallback),
  );
}

async function readLegacyBoardSessionFromIndexedDb(fallback: BoardSessionSnapshot) {
  return readDatabaseValue(indexedDbKeys.stores.snapshots, indexedDbKeys.legacyBoardSession, (value) =>
    restoreBoardSessionSnapshot(value, fallback),
  );
}

async function writeBoardSessionToIndexedDb(snapshot: BoardSessionSnapshot, userId: string) {
  await writeDatabaseValue(
    indexedDbKeys.stores.snapshots,
    buildUserScopedDatabaseKey(indexedDbKeys.boardSession, userId),
    snapshot,
  );
}

export function hasStoredBoardSession(userId = defaultCurrentUserId) {
  return hasLocalBoardSessionMirror(normalizeCurrentUserId(userId));
}

export async function loadBoardSession(fallback: BoardSessionSnapshot, userId = defaultCurrentUserId) {
  const normalizedUserId = normalizeCurrentUserId(userId);
  const indexedDbSnapshot = await readBoardSessionFromIndexedDb(fallback, normalizedUserId);
  if (indexedDbSnapshot) {
    // v20 以降は server-side が正本。ここは旧 browser-side 保存からの移送用 fallback。
    writeLocalBoardSessionMirror(indexedDbSnapshot, normalizedUserId);
    return indexedDbSnapshot;
  }

  if (normalizedUserId === defaultCurrentUserId) {
    const legacyIndexedDbSnapshot = await readLegacyBoardSessionFromIndexedDb(fallback);
    if (legacyIndexedDbSnapshot) {
      writeLocalBoardSessionMirror(legacyIndexedDbSnapshot, normalizedUserId);
      await writeBoardSessionToIndexedDb(legacyIndexedDbSnapshot, normalizedUserId);
      return legacyIndexedDbSnapshot;
    }
  }

  const localSnapshot = readBoardSession(fallback, normalizedUserId);
  if (hasLocalBoardSessionMirror(normalizedUserId)) {
    await writeBoardSessionToIndexedDb(localSnapshot, normalizedUserId);
  }

  return localSnapshot;
}

export function saveBoardSession(snapshot: BoardSessionSnapshot, userId = defaultCurrentUserId) {
  const normalizedUserId = normalizeCurrentUserId(userId);
  writeLocalBoardSessionMirror(snapshot, normalizedUserId);
  void writeBoardSessionToIndexedDb(snapshot, normalizedUserId);
}
