import type { BoardSessionSnapshot } from './board-storage';
import { restoreBoardSessionSnapshot } from './board-storage';
import { readJsonStorage, readStorageValue, writeJsonStorage, writeStorageValue } from './browser-storage';
import {
  buildUserScopedStorageKey,
  normalizeCurrentUserId,
  normalizeCurrentUserName,
  saveCurrentUserId,
} from './current-user-storage';
import { storageKeys } from './storage-keys';

export interface CachedUserProfile {
  userId: string;
  userName: string;
}

export interface CachedBoardViewport {
  currentDate: string;
  monthAnchorDate: string;
}

function normalizeCachedUserProfile(userId: string | null | undefined, userName: string | null | undefined) {
  const normalizedUserId = normalizeCurrentUserId(userId);
  const normalizedUserName = normalizeCurrentUserName(userName);

  return {
    userId: normalizedUserId,
    userName: normalizedUserName,
  } satisfies CachedUserProfile;
}

function getBoardSessionCacheKey(userId: string) {
  return buildUserScopedStorageKey(storageKeys.boardSessionCache, userId);
}

function getBoardCurrentDateCacheKey(userId: string) {
  return buildUserScopedStorageKey(storageKeys.boardCurrentDateCache, userId);
}

function getBoardMonthAnchorDateCacheKey(userId: string) {
  return buildUserScopedStorageKey(storageKeys.boardMonthAnchorDateCache, userId);
}

function isIsoDate(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function readCachedUserProfile() {
  const cachedUserId = readStorageValue(storageKeys.lastUserId) ?? readStorageValue(storageKeys.currentUserId);
  const cachedUserName = readStorageValue(storageKeys.lastUserName);

  if (!cachedUserId?.trim()) {
    return null;
  }

  return normalizeCachedUserProfile(cachedUserId, cachedUserName);
}

export function saveCachedUserProfile(profile: CachedUserProfile) {
  const normalizedProfile = normalizeCachedUserProfile(profile.userId, profile.userName);
  saveCurrentUserId(normalizedProfile.userId);
  writeStorageValue(storageKeys.lastUserId, normalizedProfile.userId);
  writeStorageValue(storageKeys.lastUserName, normalizedProfile.userName);
}

export function readCachedBoardViewport(userId: string) {
  const currentDate = readStorageValue(getBoardCurrentDateCacheKey(userId));
  const monthAnchorDate = readStorageValue(getBoardMonthAnchorDateCacheKey(userId));

  if (!isIsoDate(currentDate) || !isIsoDate(monthAnchorDate)) {
    return null;
  }

  return {
    currentDate,
    monthAnchorDate,
  } satisfies CachedBoardViewport;
}

export function saveCachedBoardViewport(viewport: CachedBoardViewport, userId: string) {
  writeStorageValue(getBoardCurrentDateCacheKey(userId), viewport.currentDate);
  writeStorageValue(getBoardMonthAnchorDateCacheKey(userId), viewport.monthAnchorDate);
}

export function readCachedBoardSession(fallback: BoardSessionSnapshot, userId: string) {
  return (
    readJsonStorage(getBoardSessionCacheKey(userId), (value) => restoreBoardSessionSnapshot(value, fallback)) ?? fallback
  );
}

export function saveCachedBoardSession(snapshot: BoardSessionSnapshot, userId: string) {
  writeJsonStorage(getBoardSessionCacheKey(normalizeCurrentUserId(userId)), snapshot);
}
