import type { AppTheme, DensityMode } from '../components/daily-input-parts';
import { readJsonStorage, readStorageValue, removeStorageValue, writeStorageValue } from './browser-storage';
import { buildUserScopedStorageKey, defaultCurrentUserId, normalizeCurrentUserId } from './current-user-storage';
import { storageKeys } from './storage-keys';

const allowedThemes = [
  'warm-teal',
  'citrus-pop',
  'berry-pop',
  'glitter-gold',
  'lavender-fog',
  'sage-paper',
  'cedar-moss',
  'electric-pop',
  'plum-smoke',
  'coral-sunset',
  'blue-pearl',
  'neon-splash',
  'hyper-candy',
  'miami-pulse',
  'cobalt-pulse',
  'aqua-yellow',
  'royal-lime',
  'tango-blue',
  'deep-navy',
  'graphite-mint',
  'electric-yellow',
  'paper-ink',
  'black-ruby',
  'garnet-red',
  'midnight-ink',
] as const;
const legacyThemeAliases = {
  'ember-glow': 'coral-sunset',
} as const satisfies Record<string, AppTheme>;
const allowedDensities = ['comfortable', 'compact'] as const;
export interface UiSettingsSnapshot {
  theme: AppTheme;
  density: DensityMode;
  guideEnabled: boolean;
  greetingEnabled: boolean;
  simpleModeEnabled: boolean;
}

export const defaultUiSettings: UiSettingsSnapshot = {
  theme: 'warm-teal',
  density: 'comfortable',
  guideEnabled: true,
  greetingEnabled: true,
  simpleModeEnabled: true,
};

function isTheme(value: unknown): value is AppTheme {
  return typeof value === 'string' && allowedThemes.includes(value as (typeof allowedThemes)[number]);
}

function normalizeTheme(value: unknown): AppTheme | null {
  if (isTheme(value)) {
    return value;
  }

  if (typeof value === 'string' && value in legacyThemeAliases) {
    return legacyThemeAliases[value as keyof typeof legacyThemeAliases];
  }

  return null;
}

function isDensity(value: unknown): value is DensityMode {
  return typeof value === 'string' && allowedDensities.includes(value as (typeof allowedDensities)[number]);
}

function parseLegacyBoolean(raw: string | null, fallback: boolean) {
  if (raw === 'true') {
    return true;
  }

  if (raw === 'false') {
    return false;
  }

  return fallback;
}

function restoreUiSettingsSnapshot(value: unknown, fallback: UiSettingsSnapshot) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<UiSettingsSnapshot>;
  const theme = normalizeTheme(candidate.theme);
  if (!theme || !isDensity(candidate.density) || typeof candidate.guideEnabled !== 'boolean') {
    return null;
  }

  return {
    theme,
    density: candidate.density,
    guideEnabled: candidate.guideEnabled,
    greetingEnabled:
      typeof candidate.greetingEnabled === 'boolean'
        ? candidate.greetingEnabled
        : fallback.greetingEnabled,
    // Keep pre-simple-mode snapshots on the familiar layout unless the user opts in.
    simpleModeEnabled:
      typeof candidate.simpleModeEnabled === 'boolean'
        ? candidate.simpleModeEnabled
        : false,
  } satisfies UiSettingsSnapshot;
}

function getScopedUiSettingsKey(userId: string | null | undefined) {
  return buildUserScopedStorageKey(storageKeys.uiSettingsSnapshot, normalizeCurrentUserId(userId));
}

function readLegacyUiSettings(fallback: UiSettingsSnapshot) {
  const snapshot = readJsonStorage(storageKeys.uiSettingsSnapshot, (value) => restoreUiSettingsSnapshot(value, fallback));

  if (snapshot) {
    return snapshot;
  }

  const legacyTheme = readStorageValue(storageKeys.theme);
  const legacyDensity = readStorageValue(storageKeys.density);
  const legacyGuide = readStorageValue(storageKeys.guideEnabled);
  const legacyGreeting = readStorageValue(storageKeys.greetingEnabled);

  if (legacyTheme === null && legacyDensity === null && legacyGuide === null && legacyGreeting === null) {
    return fallback;
  }

  return {
    theme: normalizeTheme(legacyTheme) ?? fallback.theme,
    density: isDensity(legacyDensity) ? legacyDensity : fallback.density,
    guideEnabled: parseLegacyBoolean(legacyGuide, fallback.guideEnabled),
    greetingEnabled: parseLegacyBoolean(legacyGreeting, fallback.greetingEnabled),
    simpleModeEnabled: false,
  };
}

function clearLegacyUiSettings() {
  removeStorageValue(storageKeys.theme);
  removeStorageValue(storageKeys.density);
  removeStorageValue(storageKeys.mailComposeMode);
  removeStorageValue(storageKeys.guideEnabled);
  removeStorageValue(storageKeys.greetingEnabled);
}

export function readUiSettings(
  userId: string | null | undefined,
  fallback: UiSettingsSnapshot = defaultUiSettings,
): UiSettingsSnapshot {
  const scopedSnapshot = readJsonStorage(getScopedUiSettingsKey(userId), (value) =>
    restoreUiSettingsSnapshot(value, fallback),
  );

  if (scopedSnapshot) {
    return scopedSnapshot;
  }

  const normalizedUserId = normalizeCurrentUserId(userId);
  const legacySnapshot = readLegacyUiSettings(fallback);
  if (normalizedUserId !== defaultCurrentUserId) {
    saveUiSettings(normalizedUserId, legacySnapshot);
    clearLegacyUiSettings();
  }

  return legacySnapshot;
}

export function saveUiSettings(userId: string | null | undefined, settings: UiSettingsSnapshot) {
  writeStorageValue(getScopedUiSettingsKey(userId), JSON.stringify(settings));
  clearLegacyUiSettings();
}
