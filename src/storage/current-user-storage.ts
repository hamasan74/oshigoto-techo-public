import { readStorageValue, writeStorageValue } from './browser-storage';
import { storageKeys } from './storage-keys';

export const defaultCurrentUserId = 'local-demo-user';
export const defaultCurrentUserName = 'ローカル利用者';

export function normalizeCurrentUserId(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) {
    return defaultCurrentUserId;
  }

  const normalized = trimmed.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  return normalized || defaultCurrentUserId;
}

export function normalizeCurrentUserName(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  return trimmed.replace(/\s+/g, ' ').slice(0, 80);
}

export function readCurrentUserId() {
  const cachedValue = readStorageValue(storageKeys.lastUserId) ?? readStorageValue(storageKeys.currentUserId);
  return normalizeCurrentUserId(cachedValue);
}

export function saveCurrentUserId(userId: string) {
  const normalizedUserId = normalizeCurrentUserId(userId);
  writeStorageValue(storageKeys.currentUserId, normalizedUserId);
  writeStorageValue(storageKeys.lastUserId, normalizedUserId);
}

export function buildUserScopedStorageKey(baseKey: string, userId: string) {
  const normalizedUserId = normalizeCurrentUserId(userId);
  if (normalizedUserId === defaultCurrentUserId) {
    return baseKey;
  }

  return `${baseKey}::${normalizedUserId}`;
}

export function buildUserScopedDatabaseKey(baseKey: string, userId: string) {
  return `user:${normalizeCurrentUserId(userId)}:${baseKey}`;
}
