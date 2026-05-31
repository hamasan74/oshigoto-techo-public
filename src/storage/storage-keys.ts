export const storageKeys = {
  currentUserId: 'oshigoto-techo-current-user-id',
  lastUserId: 'oshigoto-techo-last-user-id',
  lastUserName: 'oshigoto-techo-last-user-name',
  theme: 'oshigoto-techo-theme',
  density: 'oshigoto-techo-density',
  mailComposeMode: 'oshigoto-techo-mail-compose-mode',
  guideEnabled: 'oshigoto-techo-guide',
  greetingEnabled: 'oshigoto-techo-greeting',
  greetingSeenSnapshot: 'oshigoto-techo-greeting-seen-v1',
  recordsByDate: 'oshigoto-techo-records-v1',
  currentDate: 'oshigoto-techo-current-date-v1',
  monthAnchorDate: 'oshigoto-techo-month-anchor-date-v1',
  uiSettingsSnapshot: 'oshigoto-techo-settings-v1',
  boardSessionSnapshot: 'oshigoto-techo-board-session-v1',
  boardSessionCache: 'oshigoto-techo-board-session-cache-v1',
  boardCurrentDateCache: 'oshigoto-techo-board-current-date-cache-v1',
  boardMonthAnchorDateCache: 'oshigoto-techo-board-month-anchor-date-cache-v1',
} as const;

export const indexedDbKeys = {
  databaseName: 'oshigoto-techo-business-data-v1',
  version: 1,
  stores: {
    snapshots: 'app-snapshots',
  },
  boardSession: 'board-session',
  legacyBoardSession: 'board-session',
} as const;
