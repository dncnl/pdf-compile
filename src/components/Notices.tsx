import { IconClose, IconWarning } from './icons.tsx';

interface Props {
  notices: string[];
  onDismiss: () => void;
}

export function Notices({ notices, onDismiss }: Props) {
  if (notices.length === 0) return null;

  return (
    <div className="notices" role="alert">
      <span className="notices__icon" aria-hidden="true">
        <IconWarning size={20} />
      </span>
      <ul className="notices__list">
        {notices.map((notice, index) => (
          <li key={`${index}-${notice}`}>{notice}</li>
        ))}
      </ul>
      <button type="button" className="icon-button" onClick={onDismiss} aria-label="Dismiss notices">
        <IconClose />
      </button>
    </div>
  );
}
