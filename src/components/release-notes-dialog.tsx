import { createPortal } from 'react-dom';
import { APP_VERSION_LABEL } from '../lib/app-version';
import { releaseNotes } from '../lib/release-notes';

interface ReleaseNotesDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ReleaseNotesDialog({ isOpen, onClose }: ReleaseNotesDialogProps) {
  if (!isOpen) {
    return null;
  }

  const appBackground = document.querySelector<HTMLElement>('.app-background');
  const theme = appBackground?.dataset.theme;

  return createPortal(
    <div className="modal-backdrop" data-theme={theme} role="presentation" onClick={onClose}>
      <section
        className="modal-card modal-card--release-notes"
        role="dialog"
        aria-modal="true"
        aria-label="変更履歴"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="section-header">
          <div>
            <p className="section-label">release notes</p>
            <h2>変更履歴</h2>
            <p>現在の表示バージョンは {APP_VERSION_LABEL} です。main に反映する内容を新しい順で確認できます。</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            閉じる
          </button>
        </div>

        <div className="release-notes-dialog">
          {releaseNotes.map((entry) => (
            <section key={entry.version} className="release-notes-entry">
              <div className="release-notes-entry__header">
                <div>
                  <p className="release-notes-entry__date">{entry.releasedOn}</p>
                  <h3>{entry.version}</h3>
                </div>
                <span className="release-notes-entry__current">
                  {entry.version === APP_VERSION_LABEL ? 'current' : 'history'}
                </span>
              </div>
              <p className="release-notes-entry__summary">{entry.summary}</p>
              <div className="release-notes-entry__sections">
                {entry.sections.map((section) => (
                  <section key={`${entry.version}-${section.title}`} className="release-notes-entry__section">
                    <h4>{section.title}</h4>
                    <ul className="release-notes-entry__list">
                      {section.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </section>
          ))}
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
