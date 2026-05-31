import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { helpTopicsByView, helpViewOrder, type HelpView } from '../lib/page-help';

interface PageHelpDialogProps {
  isOpen: boolean;
  activeView: HelpView;
  onClose: () => void;
}

export function PageHelpDialog({ isOpen, activeView, onClose }: PageHelpDialogProps) {
  const [selectedView, setSelectedView] = useState<HelpView>(activeView);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setSelectedView(activeView);
  }, [isOpen, activeView]);

  if (!isOpen) {
    return null;
  }

  const topic = helpTopicsByView[selectedView];
  const appBackground = document.querySelector<HTMLElement>('.app-background');
  const theme = appBackground?.dataset.theme;
  const sectionTitle = selectedView === 'shared' ? '共通ボタンの役割' : '画像の番号に対応する説明';

  return createPortal(
    <div className="modal-backdrop" data-theme={theme} role="presentation" onClick={onClose}>
      <section
        className="modal-card modal-card--help"
        role="dialog"
        aria-modal="true"
        aria-label="画面ヘルプ"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="section-header">
          <div>
            <p className="section-label">help</p>
            <h2>画面ヘルプ</h2>
            <p>{topic.summary}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            閉じる
          </button>
        </div>

        <div className="help-dialog__tabs" role="tablist" aria-label="ヘルプページの切り替え">
          {helpViewOrder.map((view) => {
            const item = helpTopicsByView[view];
            return (
              <button
                key={view}
                type="button"
                role="tab"
                aria-selected={selectedView === view}
                className={selectedView === view ? 'help-dialog__tab is-active' : 'help-dialog__tab'}
                onClick={() => setSelectedView(view)}
              >
                {item.tabLabel}
              </button>
            );
          })}
        </div>

        <div className="help-dialog__body">
          <figure className="help-dialog__figure">
            <img className="help-dialog__image" src={topic.imageSrc} alt={topic.imageAlt} />
            <figcaption className="help-dialog__caption">
              実画面の構成に合わせた簡略図です。番号は右の説明に対応しています。
            </figcaption>
          </figure>

          <div className="help-dialog__content">
            <div className="help-dialog__lead">
              <p className="help-dialog__title">{topic.title}</p>
              <p className="help-dialog__summary">{topic.summary}</p>
            </div>

            <div className="help-dialog__sections">
              <section className="help-dialog__section">
                <h3>{sectionTitle}</h3>
                <ol className="help-dialog__callouts">
                  {topic.callouts.map((callout) => (
                    <li key={`${topic.view}-${callout.number}`} className="help-dialog__callout">
                      <div className="help-dialog__callout-head">
                        <span className="help-dialog__callout-number">{callout.number}</span>
                        <strong>{callout.title}</strong>
                      </div>
                      <p>{callout.description}</p>
                    </li>
                  ))}
                </ol>
              </section>

              {topic.extraSection ? (
                <section className="help-dialog__section">
                  <h3>{topic.extraSection.title}</h3>
                  <ul className="help-dialog__extra-list">
                    {topic.extraSection.items.map((item) => (
                      <li key={`${topic.view}-${item}`} className="help-dialog__extra-item">
                        {item}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>

            <div className="help-dialog__tip">
              <span className="help-dialog__tip-label">使いこなしのコツ</span>
              <p>{topic.tip}</p>
            </div>
          </div>
        </div>

        <div className="header-action-row">
          <button type="button" className="secondary-button" onClick={onClose}>
            閉じる
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
