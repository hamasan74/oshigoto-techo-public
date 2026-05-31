import { useEffect, useMemo, useState } from 'react';
import { formatHoursDecimal, formatMonthLabel } from '../lib/input-board';
import type { ServerReferenceUserRecord } from '../storage/server-user-reference';

interface UserReferencePanelProps {
  users: ServerReferenceUserRecord[];
  selectedUserIds: string[];
  isLoading: boolean;
  isBulkDownloading: boolean;
  openingSnapshotUserId: string | null;
  downloadingUserId: string | null;
  error: string | null;
  downloadError: string | null;
  downloadNotice: { tone: 'info' | 'caution'; message: string } | null;
  restoreSelectionCount: number;
  favoriteUserIds: string[];
  onRefresh: () => void;
  onToggleUserSelection: (userId: string) => void;
  onSelectVisibleUsers: (userIds: string[]) => void;
  onClearSelection: () => void;
  onRestoreSelection: () => void;
  onToggleFavoriteUser: (userId: string) => void;
  onSelectFavoriteUsers: () => void;
  onOpenSnapshot: (userId: string) => void;
  onDownloadUser: (userId: string) => void;
  onDownloadSelected: () => void;
}

function FavoriteStarIcon({ active }: { active: boolean }) {
  return (
    <svg
      className={active ? 'user-reference-star-icon is-active' : 'user-reference-star-icon'}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="user-reference-star-icon__shape"
        d="M12 2.7 14.95 8.67 21.54 9.63 16.77 14.28 17.89 20.84 12 17.74 6.11 20.84 7.23 14.28 2.46 9.63 9.05 8.67 12 2.7Z"
      />
      <path className="user-reference-star-icon__spark" d="M18.25 3.75 18.88 5.12 20.25 5.75 18.88 6.38 18.25 7.75 17.62 6.38 16.25 5.75 17.62 5.12 18.25 3.75Z" />
    </svg>
  );
}

function formatDateTimeLabel(value: string | null, emptyLabel = '未保存') {
  if (!value) {
    return emptyLabel;
  }

  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value;
  }

  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatMonthValue(value: string | null) {
  return value ? formatMonthLabel(value) : '未設定';
}

function buildFilterableText(user: ServerReferenceUserRecord) {
  return [user.userId, user.userName, user.snapshotMonthAnchorDate, user.latestRecordDate].join('\n').toLowerCase();
}

export function UserReferencePanel({
  users,
  selectedUserIds,
  isLoading,
  isBulkDownloading,
  openingSnapshotUserId,
  downloadingUserId,
  error,
  downloadError,
  downloadNotice,
  restoreSelectionCount,
  favoriteUserIds,
  onRefresh,
  onToggleUserSelection,
  onSelectVisibleUsers,
  onClearSelection,
  onRestoreSelection,
  onToggleFavoriteUser,
  onSelectFavoriteUsers,
  onOpenSnapshot,
  onDownloadUser,
  onDownloadSelected,
}: UserReferencePanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [favoriteOnlyEnabled, setFavoriteOnlyEnabled] = useState(false);
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const favoriteUserIdSet = useMemo(() => new Set(favoriteUserIds), [favoriteUserIds]);

  const filteredUsers = useMemo(() => {
    const favoriteScopedUsers =
      favoriteOnlyEnabled && favoriteUserIdSet.size > 0
        ? users.filter((user) => favoriteUserIdSet.has(user.userId))
        : users;

    const matchedUsers = !normalizedSearchQuery
      ? favoriteScopedUsers
      : favoriteScopedUsers.filter((user) => buildFilterableText(user).includes(normalizedSearchQuery));

    return matchedUsers
      .map((user, index) => ({ user, index }))
      .sort((left, right) => {
        const favoriteRankDiff =
          Number(favoriteUserIdSet.has(right.user.userId)) - Number(favoriteUserIdSet.has(left.user.userId));
        return favoriteRankDiff || left.index - right.index;
      })
      .map(({ user }) => user);
  }, [favoriteOnlyEnabled, favoriteUserIdSet, normalizedSearchQuery, users]);

  useEffect(() => {
    if (favoriteOnlyEnabled && favoriteUserIds.length === 0) {
      setFavoriteOnlyEnabled(false);
    }
  }, [favoriteOnlyEnabled, favoriteUserIds.length]);

  const selectedUserIdSet = useMemo(() => new Set(selectedUserIds), [selectedUserIds]);
  const selectedVisibleUsers = filteredUsers.filter((user) => selectedUserIdSet.has(user.userId));
  const selectVisibleLabel = `表示分を選択${filteredUsers.length ? ` (${filteredUsers.length})` : ''}`;
  const restoreSelectionLabel = `前回を復元${restoreSelectionCount ? ` (${restoreSelectionCount})` : ''}`;
  const selectFavoriteLabel = `★付きから選択${favoriteUserIds.length ? ` (${favoriteUserIds.length})` : ''}`;
  const bulkExportLabel = isBulkDownloading ? 'Excel作成中...' : `選択分をExcel出力 (${selectedUserIds.length})`;
  const bulkExportCaption = selectedUserIds.length
    ? `${selectedUserIds.length}人分をまとめて Excel に出力できます。`
    : '対象を選ぶと、まとめて Excel に出力できます。';

  return (
    <section className="user-reference-shell workspace workspace--project-master workspace--user-reference">
      <div className="toolbar-shell toolbar-shell--project-master user-reference-toolbar user-reference-toolbar--compact">
        <div className="user-reference-toolbar__intro">
          <div>
            <p className="section-label">user reference</p>
            <h2>利用者参照</h2>
            <p>利用者一覧から、そのまま照会と Excel 出力ができます。ここでは更新や保存はできません。</p>
          </div>
        </div>
        <div className="user-reference-toolbar__meta">
          <span className="status-pill is-partial">{`表示 ${filteredUsers.length}人`}</span>
          <span className={favoriteUserIds.length ? 'status-pill is-done' : 'status-pill is-empty'}>
            {favoriteUserIds.length ? `★ ${favoriteUserIds.length}人` : '★ なし'}
          </span>
          <span className={selectedUserIds.length ? 'status-pill is-caution' : 'status-pill is-empty'}>
            {selectedUserIds.length ? `一括対象 ${selectedUserIds.length}人` : '一括対象 0人'}
          </span>
        </div>
      </div>

      <div className="workspace__grid workspace__grid--project-master">
        <section className="board-list-shell project-master-list user-reference-list">
          <div className="section-header">
            <div>
              <p className="section-label">catalog</p>
              <h3>利用者一覧</h3>
              <p>{`${filteredUsers.length}人表示 / 一括対象 ${selectedUserIds.length}人`}</p>
            </div>
            <button type="button" className="ghost-button" onClick={onRefresh} disabled={isLoading}>
              {isLoading ? '更新中...' : '読み直し'}
            </button>
          </div>

          <div className="project-master-search">
            <input
              type="search"
              value={searchQuery}
              placeholder="利用者ID / 名前 / 保存月で検索"
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>

          <div className="user-reference-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={() => onSelectVisibleUsers(filteredUsers.map((user) => user.userId))}
              disabled={!filteredUsers.length}
            >
              {selectVisibleLabel}
            </button>
            <button type="button" className="ghost-button" onClick={onClearSelection} disabled={!selectedUserIds.length}>
              選択解除
            </button>
            <button type="button" className="ghost-button" onClick={onRestoreSelection} disabled={!restoreSelectionCount}>
              {restoreSelectionLabel}
            </button>
            <button type="button" className="ghost-button" onClick={onSelectFavoriteUsers} disabled={!favoriteUserIds.length}>
              {selectFavoriteLabel}
            </button>
            <button
              type="button"
              className={favoriteOnlyEnabled ? 'secondary-button secondary-button--compact' : 'ghost-button'}
              onClick={() => setFavoriteOnlyEnabled((current) => !current)}
              disabled={!favoriteUserIds.length}
            >
              {favoriteOnlyEnabled ? '全件表示' : '★付きのみ'}
            </button>
          </div>

          <div className="user-reference-actions__summary">
            <div className="user-reference-actions__meta">
              <p className="user-reference-actions__hint">
                チェックで選択、★を付けると上に表示。行の右端から照会や個別の Excel 出力ができます。
              </p>
              <div className="user-reference-actions__badges">
                <span className={favoriteUserIds.length ? 'status-pill is-done' : 'status-pill is-empty'}>
                  {favoriteUserIds.length ? `★ ${favoriteUserIds.length}人` : '★ なし'}
                </span>
                <span className={selectedUserIds.length ? 'status-pill is-caution' : 'status-pill is-empty'}>
                  {selectedUserIds.length ? `選択 ${selectedUserIds.length}人` : '選択 0人'}
                </span>
              </div>
            </div>
            <div className="user-reference-actions__bulk">
              <div className="user-reference-actions__bulk-copy">
                <p className="user-reference-actions__bulk-label">一括 Excel</p>
                <p className="user-reference-actions__bulk-caption">{bulkExportCaption}</p>
              </div>
              <button
                type="button"
                className="secondary-button secondary-button--compact"
                onClick={onDownloadSelected}
                disabled={!selectedUserIds.length || isBulkDownloading}
              >
                {bulkExportLabel}
              </button>
            </div>
          </div>

          {error ? <p className="user-admin-list__error">{error}</p> : null}
          {downloadError ? <p className="user-admin-list__error">{downloadError}</p> : null}
          {downloadNotice ? (
            <p
              className={
                downloadNotice.tone === 'caution'
                  ? 'user-reference-feedback user-reference-feedback--caution'
                  : 'user-reference-feedback user-reference-feedback--info'
              }
            >
              {downloadNotice.message}
            </p>
          ) : null}

          <div className="detail-list project-master-list__items">
            {filteredUsers.length === 0 ? (
              <div className="detail-list__empty">条件に合う利用者がありません。</div>
            ) : (
              filteredUsers.map((user) => {
                const isChecked = selectedUserIdSet.has(user.userId);
                const isFavorite = favoriteUserIdSet.has(user.userId);
                const canDownloadSingle = Boolean(user.lastSavedAt);

                return (
                  <div
                    key={user.userId}
                    className={[
                      'user-reference-row',
                      isChecked ? 'user-reference-row--checked' : '',
                      isFavorite ? 'user-reference-row--favorited' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <label className="user-reference-row__checkbox">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => onToggleUserSelection(user.userId)}
                        aria-label={`${user.userId} を一括ダウンロード対象にする`}
                      />
                    </label>
                    <div className="user-reference-row__summary">
                      <div className="user-reference-row__identity">
                        <strong>{user.userId}</strong>
                        <span>{user.userName || '表示名未設定'}</span>
                      </div>
                      <div className="user-reference-row__meta">
                        {isFavorite ? <span className="status-pill is-done">★付き</span> : null}
                        {isChecked ? <span className="status-pill is-caution">一括対象</span> : null}
                        {user.isAdmin ? <span className="status-pill is-caution">管理者</span> : null}
                      </div>
                      <div className="user-reference-row__stats">
                        <span className="user-reference-row__metric user-reference-row__metric--month">
                          {formatMonthValue(user.snapshotMonthAnchorDate)}
                        </span>
                        <span className="user-reference-row__metric">{`保存 ${user.monthSavedDayCount}日`}</span>
                        <span className="user-reference-row__metric">{`実績 ${formatHoursDecimal(user.monthActualMinutes)}`}</span>
                        <span className="user-reference-row__metric">
                          {user.lastSavedAt ? `最終保存 ${formatDateTimeLabel(user.lastSavedAt)}` : '保存データなし'}
                        </span>
                      </div>
                    </div>
                    <div className="user-reference-row__actions">
                      <button
                        type="button"
                        className={isFavorite ? 'ghost-button user-reference-row__favorite is-active' : 'ghost-button user-reference-row__favorite'}
                        onClick={() => onToggleFavoriteUser(user.userId)}
                        aria-pressed={isFavorite}
                        aria-label={isFavorite ? `${user.userId} の★を外す` : `${user.userId} に★を付ける`}
                        title={isFavorite ? '★を外す' : '★を付ける'}
                      >
                        <FavoriteStarIcon active={isFavorite} />
                      </button>
                      <button
                        type="button"
                        className="ghost-button user-reference-row__action"
                        onClick={() => onOpenSnapshot(user.userId)}
                        disabled={!canDownloadSingle || openingSnapshotUserId === user.userId}
                      >
                        {openingSnapshotUserId === user.userId ? '読込中...' : '照会'}
                      </button>
                      <button
                        type="button"
                        className="ghost-button user-reference-row__download"
                        onClick={() => onDownloadUser(user.userId)}
                        disabled={!canDownloadSingle || downloadingUserId === user.userId}
                      >
                        {downloadingUserId === user.userId ? '作成中...' : 'Excel'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {selectedVisibleUsers.length > 0 ? (
        <p className="user-reference-selection-note">
          {`現在の表示内で ${selectedVisibleUsers.length} 人を選択中です。`}
        </p>
      ) : null}
    </section>
  );
}
