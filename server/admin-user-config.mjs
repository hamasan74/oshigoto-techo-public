import path from 'node:path';
import { readFile } from 'node:fs/promises';

const DEFAULT_ADMIN_USERS_RELATIVE_PATH = 'data/admin-users.json';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function resolveAdminUsersPath(rootDir, configuredPath = process.env.OSHIGOTO_TECHO_ADMIN_USERS_PATH) {
  const targetPath = normalizeText(configuredPath) || DEFAULT_ADMIN_USERS_RELATIVE_PATH;
  return path.isAbsolute(targetPath) ? targetPath : path.resolve(rootDir, targetPath);
}

function normalizeAdminUserIds(value) {
  const source =
    Array.isArray(value) ? value : value && typeof value === 'object' && Array.isArray(value.userIds) ? value.userIds : [];

  return Array.from(new Set(source.map((item) => normalizeText(item)).filter(Boolean)));
}

function normalizeReadOnlyAdminUserIds(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.readOnlyUserIds)) {
    return [];
  }

  return Array.from(new Set(value.readOnlyUserIds.map((item) => normalizeText(item)).filter(Boolean)));
}

export async function loadAdminUserIds(rootDir, configuredPath = process.env.OSHIGOTO_TECHO_ADMIN_USERS_PATH) {
  const adminUsersPath = resolveAdminUsersPath(rootDir, configuredPath);

  try {
    const raw = await readFile(adminUsersPath, 'utf8');
    const parsed = JSON.parse(raw);
    const adminUserIds = normalizeAdminUserIds(parsed);
    const readOnlyUserIds = normalizeReadOnlyAdminUserIds(parsed).filter((userId) => !adminUserIds.includes(userId));
    return {
      adminUsersPath,
      userIds: adminUserIds,
      readOnlyUserIds,
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return {
        adminUsersPath,
        userIds: [],
        readOnlyUserIds: [],
      };
    }

    throw new Error(
      `管理者 userId ファイルを読み込めませんでした: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function isAdminUser(rootDir, userId, configuredPath = process.env.OSHIGOTO_TECHO_ADMIN_USERS_PATH) {
  const normalizedUserId = normalizeText(userId);
  if (!normalizedUserId) {
    return {
      isAdmin: false,
      isReadOnlyAdmin: false,
      canManageUsers: false,
      canReferenceUsers: false,
      adminUsersPath: resolveAdminUsersPath(rootDir, configuredPath),
      adminUserIds: [],
      readOnlyUserIds: [],
    };
  }

  const config = await loadAdminUserIds(rootDir, configuredPath);
  const isAdmin = config.userIds.includes(normalizedUserId);
  const isReadOnlyAdmin = !isAdmin && config.readOnlyUserIds.includes(normalizedUserId);
  return {
    isAdmin,
    isReadOnlyAdmin,
    canManageUsers: isAdmin,
    canReferenceUsers: isAdmin || isReadOnlyAdmin,
    adminUsersPath: config.adminUsersPath,
    adminUserIds: config.userIds,
    readOnlyUserIds: config.readOnlyUserIds,
  };
}
