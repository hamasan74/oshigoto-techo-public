import { useEffect, useMemo, useState } from 'react';
import { formatHoursDecimal, formatMonthLabel } from '../lib/input-board';
import type {
  ServerAdminDashboardAnalysis,
  ServerAdminMonitoring,
  ServerAdminMonitoringUser,
  ServerAdminRankings,
  ServerAdminUserListSummary,
  ServerAdminUserRecord,
} from '../storage/server-user-admin';
import { MonthlyOverviewCard } from './daily-input-parts';

type MailFilter = 'all' | 'with-mail' | 'without-mail';
type UserScopeFilter = 'real' | 'test' | 'all';

interface UserAdminPanelProps {
  currentUserId: string;
  users: ServerAdminUserRecord[];
  summary: ServerAdminUserListSummary | null;
  monitoring: ServerAdminMonitoring | null;
  rankings: ServerAdminRankings | null;
  dashboardAnalysis: ServerAdminDashboardAnalysis | null;
  selectedUserId: string | null;
  isLoading: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  error: string | null;
  onRefresh: () => void;
  onSelectUser: (userId: string | null) => void;
  onSaveUser: (user: Pick<ServerAdminUserRecord, 'userId' | 'userName' | 'mailTo' | 'mailCc' | 'adminNote'>) => void;
  onDeleteUser: (userId: string) => void;
}

interface UserAdminFormState {
  userName: string;
  mailTo: string;
  mailCc: string;
  adminNote: string;
}

const mailFilterLabels: Record<MailFilter, string> = {
  all: 'すべて',
  'with-mail': 'メールあり',
  'without-mail': 'メールなし',
};

const userScopeFilterLabels: Record<UserScopeFilter, string> = {
  real: '実利用',
  test: 'テスト',
  all: 'すべて',
};

function createFormState(user: ServerAdminUserRecord | null): UserAdminFormState {
  return {
    userName: user?.userName ?? '',
    mailTo: user?.mailTo ?? '',
    mailCc: user?.mailCc ?? '',
    adminNote: user?.adminNote ?? '',
  };
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

function formatDateLabel(value: string | null) {
  if (!value) {
    return '未入力';
  }

  return value.replace(/-/g, '/');
}

function formatMonthValue(value: string | null) {
  return value ? formatMonthLabel(value) : '未設定';
}

function formatCountLabel(value: number, suffix: string) {
  return `${value}${suffix}`;
}

function buildFilterableText(user: ServerAdminUserRecord) {
  return [user.userId, user.userName, user.mailTo, user.mailCc, user.adminNote].join('\n').toLowerCase();
}

function buildRecentActivityLabel(user: ServerAdminUserRecord) {
  if (user.lastSeenAt) {
    return `最終アクセス ${formatDateTimeLabel(user.lastSeenAt, '未検知')}`;
  }

  return `最終保存 ${formatDateTimeLabel(user.lastSavedAt)}`;
}

function isRecentlySeen(value: string | null) {
  if (!value) {
    return false;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && Date.now() - timestamp <= 3 * 60 * 1000;
}

function calcBarWidth(value: number, maxValue: number) {
  if (maxValue <= 0 || value <= 0) {
    return '0%';
  }

  return `${Math.max(12, Math.round((value / maxValue) * 100))}%`;
}

function MonitoringList({
  title,
  description,
  users,
  emptyLabel,
}: {
  title: string;
  description: string;
  users: ServerAdminMonitoringUser[];
  emptyLabel: string;
}) {
  return (
    <section className="project-master-reference-card user-admin-overview-card">
      <div className="project-master-reference-card__head">
        <div>
          <p className="section-label">monitoring</p>
          <h4>{title}</h4>
        </div>
        <small>{formatCountLabel(users.length, '件')}</small>
      </div>
      <p className="user-admin-overview-card__lead">{description}</p>
      {users.length === 0 ? (
        <p className="user-admin-overview-card__empty">{emptyLabel}</p>
      ) : (
        <div className="user-admin-mini-list">
          {users.slice(0, 5).map((user) => (
            <div key={user.userId} className="user-admin-mini-list__row">
              <div>
                <strong>{user.userName || user.userId}</strong>
                <span>{user.userId}</span>
              </div>
              <small>{user.hint}</small>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function RankingList({
  title,
  description,
  entries,
  emptyLabel,
}: {
  title: string;
  description: string;
  entries: ServerAdminRankings[keyof ServerAdminRankings];
  emptyLabel: string;
}) {
  return (
    <section className="project-master-reference-card user-admin-overview-card">
      <div className="project-master-reference-card__head">
        <div>
          <p className="section-label">ranking</p>
          <h4>{title}</h4>
        </div>
      </div>
      <p className="user-admin-overview-card__lead">{description}</p>
      {entries.length === 0 ? (
        <p className="user-admin-overview-card__empty">{emptyLabel}</p>
      ) : (
        <ol className="user-admin-ranking-list">
          {entries.map((entry) => (
            <li key={`${title}-${entry.userId}`} className="user-admin-ranking-list__row">
              <div>
                <strong>{entry.userName || entry.userId}</strong>
                <span>{entry.userId}</span>
              </div>
              <div>
                <strong>{entry.valueLabel}</strong>
                <small>{entry.detail}</small>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function DashboardAnalysisCard({
  points,
}: {
  points: ServerAdminDashboardAnalysis['recentDailyActivity'];
}) {
  const maxActiveUsers = Math.max(1, ...points.map((point) => point.activeUsers));
  const maxSaveCount = Math.max(1, ...points.map((point) => point.saveCount));

  return (
    <section className="project-master-reference-card user-admin-overview-card user-admin-overview-card--wide">
      <div className="project-master-reference-card__head">
        <div>
          <p className="section-label">analysis</p>
          <h4>直近14日の利用分析</h4>
        </div>
      </div>
      <p className="user-admin-overview-card__lead">
        実利用者だけを対象にした、利用者数と保存回数の推移です。履歴は保存ベースで蓄積されます。
      </p>
      {points.length === 0 ? (
        <p className="user-admin-overview-card__empty">まだ分析できる履歴はありません。</p>
      ) : (
        <div className="user-admin-activity-list">
          {points.map((point) => (
            <div key={point.date} className="user-admin-activity-list__row">
              <div className="user-admin-activity-list__label">
                <strong>{formatDateLabel(point.date)}</strong>
                <span>{`保存 ${point.saveCount}回 / 利用 ${point.activeUsers}人`}</span>
              </div>
              <div className="user-admin-activity-list__bars">
                <span
                  className="user-admin-activity-list__bar user-admin-activity-list__bar--primary"
                  style={{ width: calcBarWidth(point.activeUsers, maxActiveUsers) }}
                />
                <span
                  className="user-admin-activity-list__bar user-admin-activity-list__bar--secondary"
                  style={{ width: calcBarWidth(point.saveCount, maxSaveCount) }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function UserAdminPanel({
  currentUserId,
  users,
  summary,
  monitoring,
  rankings,
  dashboardAnalysis,
  selectedUserId,
  isLoading,
  isSaving,
  isDeleting,
  error,
  onRefresh,
  onSelectUser,
  onSaveUser,
  onDeleteUser,
}: UserAdminPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [mailFilter, setMailFilter] = useState<MailFilter>('all');
  const [userScopeFilter, setUserScopeFilter] = useState<UserScopeFilter>('real');
  const [form, setForm] = useState<UserAdminFormState>(() => createFormState(users[0] ?? null));
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');

  const realUsersCount = useMemo(() => users.filter((user) => !user.isTestUser).length, [users]);
  const testUsersCount = users.length - realUsersCount;

  const filteredUsers = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return users.filter((user) => {
      if (userScopeFilter === 'real' && user.isTestUser) {
        return false;
      }

      if (userScopeFilter === 'test' && !user.isTestUser) {
        return false;
      }

      if (mailFilter === 'with-mail' && !user.hasMailSettings) {
        return false;
      }

      if (mailFilter === 'without-mail' && user.hasMailSettings) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return buildFilterableText(user).includes(normalizedQuery);
    });
  }, [mailFilter, searchQuery, userScopeFilter, users]);

  const selectedUser =
    (selectedUserId ? filteredUsers.find((user) => user.userId === selectedUserId) : null) ??
    filteredUsers[0] ??
    null;

  useEffect(() => {
    if (!selectedUser) {
      onSelectUser(null);
      setForm(createFormState(null));
      return;
    }

    if (selectedUser.userId !== selectedUserId) {
      onSelectUser(selectedUser.userId);
    }
  }, [onSelectUser, selectedUser, selectedUserId]);

  useEffect(() => {
    setForm(createFormState(selectedUser));
  }, [selectedUser?.userId, selectedUser?.userName, selectedUser?.mailTo, selectedUser?.mailCc, selectedUser?.adminNote]);

  useEffect(() => {
    setDeleteConfirmInput('');
  }, [selectedUser?.userId]);

  const canSave =
    Boolean(selectedUser) &&
    (form.userName.trim() !== (selectedUser?.userName ?? '') ||
      form.mailTo.trim() !== (selectedUser?.mailTo ?? '') ||
      form.mailCc.trim() !== (selectedUser?.mailCc ?? '') ||
      form.adminNote.trim() !== (selectedUser?.adminNote ?? ''));
  const isCurrentUser = selectedUser?.userId === currentUserId;
  const canDelete = Boolean(selectedUser) && !isCurrentUser && deleteConfirmInput.trim() === (selectedUser?.userId ?? '');

  const monitoringGroups = [
    {
      title: 'アクセス中',
      description: '直近3分で画面から heartbeat を受けた実利用者です。',
      users: monitoring?.openUsers ?? [],
      emptyLabel: 'いま開いている利用者はいません。',
    },
    {
      title: '7日保存なし',
      description: '実利用者のうち、直近7日で保存が止まっている利用者です。',
      users: monitoring?.staleUsers ?? [],
      emptyLabel: '直近7日で止まっている利用者はいません。',
    },
    {
      title: 'メール未設定',
      description: '実利用者のうち、To / CC のどちらも未設定です。',
      users: monitoring?.mailMissingUsers ?? [],
      emptyLabel: 'メール未設定の利用者はいません。',
    },
  ];

  const rankingGroups = [
    {
      title: '最近アクセスした利用者',
      description: 'heartbeat または最終保存から、最近触っている順で見ています。',
      entries: rankings?.recentUsers ?? [],
      emptyLabel: '最近アクセスした利用者はまだ見えていません。',
    },
  ];

  return (
    <section className="user-admin-shell workspace workspace--project-master workspace--user-admin">
      <div className="toolbar-shell toolbar-shell--hero toolbar-shell--project-master user-admin-toolbar">
        <div className="toolbar-shell__intro">
          <div>
            <p className="section-label">user admin</p>
            <h2>利用者管理</h2>
            <p>実利用者とテストユーザーを分けて、止まっている人と最近使っている人を追いやすくしています。</p>
          </div>
        </div>
        <div className="user-admin-toolbar__metrics">
          <MonthlyOverviewCard
            label="実利用者"
            value={formatCountLabel(summary?.realUsers ?? realUsersCount, '件')}
            detail="テストを除いた管理対象"
          />
          <MonthlyOverviewCard
            label="アクセス中"
            value={formatCountLabel(summary?.openUsers ?? 0, '件')}
            detail="直近3分で開いている実利用者"
            tone="info"
          />
          <MonthlyOverviewCard
            label="7日保存なし"
            value={formatCountLabel(summary?.staleUsers ?? 0, '件')}
            detail="実利用者のうち、直近7日で止まっている人数"
            tone="caution"
          />
          <MonthlyOverviewCard
            label="メール未設定"
            value={formatCountLabel(summary?.mailMissingUsers ?? 0, '件')}
            detail="実利用者のうち、宛先設定が未入力の人数"
          />
        </div>
      </div>

      <div className="user-admin-overview-grid">
        {monitoringGroups.map((group) => (
          <MonitoringList
            key={group.title}
            title={group.title}
            description={group.description}
            users={group.users}
            emptyLabel={group.emptyLabel}
          />
        ))}
        {rankingGroups.map((group) => (
          <RankingList
            key={group.title}
            title={group.title}
            description={group.description}
            entries={group.entries}
            emptyLabel={group.emptyLabel}
          />
        ))}
        <DashboardAnalysisCard points={dashboardAnalysis?.recentDailyActivity ?? []} />
      </div>

      <div className="workspace__grid workspace__grid--project-master">
        <section className="board-list-shell project-master-list user-admin-list">
          <div className="section-header">
            <div>
              <p className="section-label">catalog</p>
              <h3>利用者一覧</h3>
              <p>{`${filteredUsers.length}件表示 / 実利用${summary?.realUsers ?? realUsersCount}件 / テスト${summary?.testUsers ?? testUsersCount}件`}</p>
            </div>
            <button type="button" className="ghost-button" onClick={onRefresh} disabled={isLoading}>
              {isLoading ? '更新中...' : '再読込'}
            </button>
          </div>

          <div className="project-master-search">
            <input
              type="search"
              value={searchQuery}
              placeholder="userId / 表示名 / メール / 管理メモで検索"
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <div className="chip-row">
              {(Object.keys(userScopeFilterLabels) as UserScopeFilter[]).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  className={userScopeFilter === filter ? 'chip-button is-active' : 'chip-button'}
                  onClick={() => setUserScopeFilter(filter)}
                >
                  {userScopeFilterLabels[filter]}
                </button>
              ))}
            </div>
            <div className="chip-row">
              {(Object.keys(mailFilterLabels) as MailFilter[]).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  className={mailFilter === filter ? 'chip-button is-active' : 'chip-button'}
                  onClick={() => setMailFilter(filter)}
                >
                  {mailFilterLabels[filter]}
                </button>
              ))}
            </div>
          </div>

          {error ? <p className="user-admin-list__error">{error}</p> : null}

          <div className="detail-list project-master-list__items">
            {filteredUsers.length === 0 ? (
              <div className="detail-list__empty">条件に合う利用者がありません。</div>
            ) : (
              filteredUsers.map((user) => {
                const isSelected = selectedUser?.userId === user.userId;

                return (
                  <button
                    key={user.userId}
                    type="button"
                    className={isSelected ? 'project-master-row user-admin-row is-selected' : 'project-master-row user-admin-row'}
                    onClick={() => onSelectUser(user.userId)}
                  >
                    <div className="project-master-row__main">
                      <div className="project-master-row__title">
                        <strong>{user.userId}</strong>
                        <span>{user.userName || '表示名未設定'}</span>
                      </div>
                      <div className="project-master-row__meta">
                        {user.isAdmin ? <span className="status-pill is-caution">管理者</span> : null}
                        {user.isTestUser ? <span className="status-pill is-partial">{user.testUserLabel ?? 'テスト'}</span> : null}
                        {isRecentlySeen(user.lastSeenAt) ? <span className="status-pill is-done">アクセス中</span> : null}
                        <span className={`status-pill ${user.hasMailSettings ? 'is-done' : 'is-empty'}`}>
                          {user.hasMailSettings ? 'メール設定あり' : 'メール未設定'}
                        </span>
                        <span className="chip-button chip-button--mini">{formatMonthValue(user.snapshotMonthAnchorDate)}</span>
                      </div>
                      <p className="project-master-row__task-preview">{buildRecentActivityLabel(user)}</p>
                    </div>
                    <div className="project-master-row__hours">
                      <span>{`今月入力 ${user.monthSavedDayCount}日`}</span>
                      <span>{`実績 ${formatHoursDecimal(user.monthActualMinutes)}`}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <aside className="detail-pane-shell">
          <div className="detail-pane project-master-detail user-admin-detail">
            {!selectedUser ? (
              <div className="detail-pane__empty">利用者を選ぶと詳細が表示されます。</div>
            ) : (
              <>
                <div className="detail-pane__header">
                  <div className="project-master-detail__header-copy">
                    <p className="section-label">editor</p>
                    <h3>{selectedUser.userName || selectedUser.userId}</h3>
                    <p className="project-master-detail__lead">
                      {`${selectedUser.userId}${selectedUser.userId === currentUserId ? ' ・ 現在の利用者' : ''}`}
                    </p>
                  </div>
                  <div className="user-admin-detail__status">
                    {isRecentlySeen(selectedUser.lastSeenAt) ? <span className="status-pill is-done">アクセス中</span> : null}
                    {selectedUser.isTestUser ? <span className="status-pill is-partial">{selectedUser.testUserLabel ?? 'テスト'}</span> : null}
                    {selectedUser.isAdmin ? <span className="status-pill is-caution">管理者</span> : null}
                  </div>
                </div>

                <div className="detail-pane__grid">
                  <label className="field-stack">
                    <span>user name</span>
                    <input
                      type="text"
                      value={form.userName}
                      onChange={(event) => setForm((current) => ({ ...current, userName: event.target.value }))}
                      placeholder="表示名を入力"
                    />
                  </label>

                  <label className="field-stack">
                    <span>last saved</span>
                    <input type="text" value={formatDateTimeLabel(selectedUser.lastSavedAt)} disabled />
                  </label>

                  <label className="field-stack field-stack--full">
                    <span>to</span>
                    <input
                      type="text"
                      value={form.mailTo}
                      onChange={(event) => setForm((current) => ({ ...current, mailTo: event.target.value }))}
                      placeholder="user@example.com"
                    />
                  </label>

                  <label className="field-stack field-stack--full">
                    <span>cc</span>
                    <input
                      type="text"
                      value={form.mailCc}
                      onChange={(event) => setForm((current) => ({ ...current, mailCc: event.target.value }))}
                      placeholder="member1@example.com; member2@example.com"
                    />
                  </label>

                  <label className="field-stack field-stack--full">
                    <span>管理メモ</span>
                    <textarea
                      value={form.adminNote}
                      onChange={(event) => setForm((current) => ({ ...current, adminNote: event.target.value }))}
                      placeholder="引き継ぎや注意点を残します"
                    />
                  </label>
                </div>

                <section className="project-master-reference-card user-admin-danger-zone">
                  <div className="project-master-reference-card__head">
                    <div>
                      <p className="section-label">danger zone</p>
                      <h4>利用者データを完全削除</h4>
                    </div>
                  </div>
                  <p className="user-admin-overview-card__lead">
                    保存データ、履歴、管理メモをまとめて削除します。元に戻せません。
                  </p>
                  <label className="field-stack field-stack--full">
                    <span>削除する userId を再入力</span>
                    <input
                      type="text"
                      value={deleteConfirmInput}
                      onChange={(event) => setDeleteConfirmInput(event.target.value)}
                      placeholder={selectedUser.userId}
                      disabled={isDeleting || isCurrentUser}
                    />
                  </label>
                  <p className="user-admin-danger-zone__note">
                    {isCurrentUser
                      ? '現在ログイン中の利用者データは削除できません。別の管理者 userId で入り直してください。'
                      : `削除を実行するには ${selectedUser.userId} をそのまま入力してください。`}
                  </p>
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => onDeleteUser(selectedUser.userId)}
                    disabled={!canDelete || isDeleting}
                  >
                    {isDeleting ? '削除中...' : '利用者データを削除'}
                  </button>
                </section>

                <div className="project-master-detail__actions">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => setForm(createFormState(selectedUser))}
                    disabled={isSaving || isDeleting}
                  >
                    変更を戻す
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() =>
                      onSaveUser({
                        userId: selectedUser.userId,
                        userName: form.userName,
                        mailTo: form.mailTo,
                        mailCc: form.mailCc,
                        adminNote: form.adminNote,
                      })
                    }
                    disabled={!canSave || isSaving || isDeleting || !form.userName.trim()}
                  >
                    {isSaving ? '保存中...' : '保存'}
                  </button>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
