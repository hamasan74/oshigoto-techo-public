import type {
  TimesheetTransferProjectRow,
  TimesheetTransferSelectableSegment,
  TimesheetTransferViewModel,
} from '../lib/output/view-model';

interface TimesheetTransferSimulationViewProps {
  viewModel: TimesheetTransferViewModel;
  onShiftDate: (deltaDays: number) => void;
  onOpenDaily: () => void;
}

function TransferProjectStepRow({
  row,
  availableSegments,
}: {
  row: TimesheetTransferProjectRow;
  availableSegments: TimesheetTransferSelectableSegment[];
}) {
  return (
    <article className="transfer-sim-step-row">
      <div className="transfer-sim-step-row__head">
        <span className="transfer-sim-step-row__order">{row.order}</span>
        <div className="transfer-sim-step-row__dropdown" aria-label={`PJ選択 ${row.order}`}>
          <span>PJ</span>
          <strong>{row.dropdownLabel}</strong>
        </div>
        <span className="transfer-sim-step-row__duration">{row.durationHoursLabel}</span>
      </div>

      <div className="transfer-sim-step-row__meta">
        {row.projectName !== row.timesheetProjectLabel ? <span>{`手帳名: ${row.projectName}`}</span> : null}
        <span>{row.taskLabel}</span>
        <span>{row.placeLabel}</span>
        <span>{`選択 ${row.timeRangeLabel}`}</span>
      </div>

      <div className="transfer-sim-step-row__track" aria-hidden="true">
        <div className="transfer-sim-step-row__track-base" />
        {availableSegments.map((segment) => (
          <div
            key={`${row.order}-${segment.order}`}
            className="transfer-sim-step-row__track-segment"
            style={{
              left: `${segment.leftPercent}%`,
              width: `${segment.widthPercent}%`,
            }}
          />
        ))}
        {row.selectionWidthPercent > 0 ? (
          <div
            className="transfer-sim-step-row__track-fill"
            style={{
              left: `${row.selectionStartPercent}%`,
              width: `${row.selectionWidthPercent}%`,
            }}
          />
        ) : null}
      </div>

      <div className="transfer-sim-step-row__foot">
        <span>{row.selectionNotice ?? '除外時間を除いた稼働帯で 1 本選択'}</span>
        <span>{row.comment ? `メモ: ${row.comment}` : 'メモなし'}</span>
      </div>
    </article>
  );
}

export function TimesheetTransferSimulationView({
  viewModel,
  onShiftDate,
  onOpenDaily,
}: TimesheetTransferSimulationViewProps) {
  const hasAuxState = Boolean(viewModel.annualLeaveLabel) || viewModel.auxRows.length > 0;

  return (
    <div className="workspace workspace--timesheet-transfer">
      <section className="transfer-sim-shell">
        <div className="section-header">
          <div>
            <p className="section-label">timesheet preview</p>
            <h2>転記シミュレーション</h2>
            <p>{`${viewModel.dateLabel} の就業管理システム転記イメージを確認します。ここでは送信せず、将来の自動転記で使う入力順と整形結果だけを見ます。`}</p>
          </div>
          <div className="header-action-row">
            <button type="button" className="ghost-button" onClick={() => onShiftDate(-1)}>
              前日
            </button>
            <button type="button" className="ghost-button" onClick={() => onShiftDate(1)}>
              翌日
            </button>
            <button type="button" className="secondary-button" onClick={onOpenDaily}>
              日入力へ戻る
            </button>
          </div>
        </div>

        <div className="transfer-sim-banner">
          <strong>POC</strong>
          <span>本番送信は行わず、4桁時刻入力と PJ 切替 + 1本バー選択の流れを検証するための画面です。</span>
        </div>

        <div className="transfer-sim-summary">
          <article className="transfer-sim-summary-card">
            <span>状態</span>
            <strong>{viewModel.statusLabel}</strong>
            <small>{`${viewModel.modeLabel}を転記対象として見ています`}</small>
          </article>
          <article className="transfer-sim-summary-card">
            <span>選択可能帯</span>
            <strong>{viewModel.selectableHoursLabel}</strong>
            <small>{`除外時間 ${viewModel.excludedHoursLabel} / PJ合計 ${viewModel.allocationHoursLabel}`}</small>
          </article>
          <article className="transfer-sim-summary-card">
            <span>勤務</span>
            <strong>{viewModel.workTimeLabel}</strong>
            <small>{`場所 ${viewModel.workplaceLabel} / 差分 ${viewModel.differenceHoursLabel}`}</small>
          </article>
        </div>

        <div className="transfer-sim-grid">
          <section className="transfer-sim-card">
            <div className="transfer-sim-card__head">
              <div>
                <p className="section-label">step 1</p>
                <h3>日付と予定入力</h3>
              </div>
            </div>
            <p className="transfer-sim-inline-note">日付を選んでから、開始と終了を数字4桁で入れる想定です。</p>
            <div className="transfer-sim-plan-grid">
              <div className="transfer-sim-input-chip">
                <span>日付</span>
                <strong>{viewModel.dateLabel}</strong>
              </div>
              <div className="transfer-sim-input-chip">
                <span>開始</span>
                <strong>{viewModel.startTimeInputLabel}</strong>
              </div>
              <div className="transfer-sim-input-chip">
                <span>終了</span>
                <strong>{viewModel.endTimeInputLabel}</strong>
              </div>
              <div className="transfer-sim-input-chip">
                <span>昼休み</span>
                <strong>固定 0100</strong>
              </div>
            </div>
          </section>

          <section className="transfer-sim-card">
            <div className="transfer-sim-card__head">
              <div>
                <p className="section-label">step 3</p>
                <h3>年休 / 分断ダイアログ</h3>
              </div>
            </div>
            <p className="transfer-sim-inline-note">分断や年休は別ボタンのダイアログで設定し、入れた時間はバーの選択可能帯から外します。</p>
            <div className="transfer-sim-dialog-buttons" aria-label="補助入力ボタン">
              <span>1日休</span>
              <span>AM休</span>
              <span>PM休</span>
              <span>1H休</span>
              <span>分断</span>
            </div>
            {hasAuxState ? (
              <div className="transfer-sim-aux-list">
                {viewModel.annualLeaveLabel ? (
                  <div className="transfer-sim-aux-list__item">
                    <strong>年休</strong>
                    <span>{viewModel.annualLeaveLabel}</span>
                  </div>
                ) : null}
                {viewModel.auxRows.map((row) => (
                  <div key={`${row.order}-${row.typeLabel}-${row.timeRangeLabel}`} className="transfer-sim-aux-list__item">
                    <strong>{row.typeLabel}</strong>
                    <span>{`${row.timeRangeLabel} / ${row.durationHoursLabel}`}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="detail-pane__empty">この日は補助入力がありません。</div>
            )}
          </section>
        </div>

        <section className="transfer-sim-card">
          <div className="transfer-sim-card__head">
            <div>
              <p className="section-label">step 2</p>
              <h3>PJ切替 + 1本バー選択</h3>
            </div>
          </div>
          <p className="transfer-sim-inline-note">
            PJCD と転記先表示名は基本設定で登録済み前提です。プルダウンでは就業管理システム側の名称を選んで、昼休み・分断・年休時間を除いた稼働帯で 1 本バーを選択ドラッグします。
          </p>

          <div className="transfer-sim-lane-summary">
            <div className="transfer-sim-lane-summary__metric">
              <span>選択可能帯</span>
              <strong>{viewModel.selectableHoursLabel}</strong>
            </div>
            <div className="transfer-sim-lane-summary__metric">
              <span>除外時間</span>
              <strong>{viewModel.excludedHoursLabel}</strong>
            </div>
          </div>

          <div className="transfer-sim-overview-lane" aria-hidden="true">
            <div className="transfer-sim-overview-lane__track" />
            {viewModel.availableSegments.map((segment) => (
              <div
                key={segment.order}
                className="transfer-sim-overview-lane__segment"
                style={{
                  left: `${segment.leftPercent}%`,
                  width: `${segment.widthPercent}%`,
                }}
              />
            ))}
          </div>

          {viewModel.availableSegments.length > 0 ? (
            <div className="transfer-sim-segment-list" aria-label="選択可能帯の区間">
              {viewModel.availableSegments.map((segment) => (
                <span key={segment.order} className="transfer-sim-segment-chip">
                  {`${segment.label} / ${segment.durationHoursLabel}`}
                </span>
              ))}
            </div>
          ) : (
            <div className="detail-pane__empty">この日はバーで選択できる稼働帯がありません。</div>
          )}

          {viewModel.excludedBlocks.length > 0 ? (
            <div className="transfer-sim-exclusion-list" aria-label="除外時間">
              {viewModel.excludedBlocks.map((block) => (
                <span key={`${block.order}-${block.label}`} className="transfer-sim-exclusion-chip">
                  {`${block.label} / ${block.durationHoursLabel}`}
                </span>
              ))}
            </div>
          ) : null}

          {viewModel.projectRows.length > 0 ? (
            <div className="transfer-sim-step-list">
              {viewModel.projectRows.map((row) => (
                <TransferProjectStepRow key={`${row.order}-${row.projectCode}-${row.taskLabel}`} row={row} availableSegments={viewModel.availableSegments} />
              ))}
            </div>
          ) : (
            <div className="detail-pane__empty">この日の PJ 行はまだありません。</div>
          )}
        </section>

        <section className="transfer-sim-card">
          <div className="transfer-sim-card__head">
            <div>
              <p className="section-label">checks</p>
              <h3>確認ポイント</h3>
            </div>
          </div>
          <div className="transfer-sim-warning-box">
            {viewModel.warnings.length > 0 ? (
              <ul className="transfer-sim-warning-list">
                {viewModel.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : (
              <p>この日の実績は、そのまま転記シミュレーションへ流せる状態です。</p>
            )}
          </div>
        </section>
      </section>
    </div>
  );
}
