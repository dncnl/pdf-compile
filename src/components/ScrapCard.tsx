import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { formatBytes } from '../lib/limits.ts';
import type { Source } from '../lib/types.ts';
import { IconClose, IconGrip, IconKind, IconRotate, IconWarning, TornEdge } from './icons.tsx';

const KIND_LABEL: Record<Source['kind'], string> = {
  image: 'Image',
  pdf: 'PDF',
  docx: 'Word',
  text: 'Text',
};

interface Props {
  source: Source;
  index: number;
  onRemove: (id: string) => void;
  onRotate: (id: string) => void;
}

export function ScrapCard({ source, index, onRemove, onRotate }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: source.id,
  });

  const failed = source.status === 'error';
  const probing = source.status === 'probing';

  // dnd-kit drives `transform` inline, and the resting tilt is also a
  // transform, so the two are composed by hand rather than fighting over the
  // property. A card being dragged squares up; the rest keep their tilt.
  const dragTransform = CSS.Transform.toString(transform);
  const tilt = isDragging ? '' : `rotate(${source.tilt}deg)`;

  const style: React.CSSProperties = {
    transform: [dragTransform, tilt].filter(Boolean).join(' ') || undefined,
    transition,
    ['--kind' as string]: `var(--kind-${source.kind})`,
    zIndex: isDragging ? 20 : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={[
        'scrap',
        failed && 'scrap--error',
        probing && 'scrap--probing',
        isDragging && 'scrap--dragging',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Outside the clipped body so the stamp can overhang the card edge. */}
      <span className="scrap__order" aria-hidden="true">
        {index + 1}
      </span>

      <div className="scrap__body">
        <button
          type="button"
          className="scrap__grip"
          aria-label={`Reorder ${source.file.name}. Press space, then use the arrow keys.`}
          {...attributes}
          {...listeners}
        >
          <IconGrip />
        </button>

        <div className="scrap__preview">
          {source.thumbUrl ? (
            <img
              className="scrap__thumb"
              src={source.thumbUrl}
              alt=""
              style={{ transform: `rotate(${source.rotation}deg)` }}
            />
          ) : (
            <div className="scrap__placeholder">
              {failed ? <IconWarning size={26} /> : <IconKind kind={source.kind} />}
            </div>
          )}
          {probing && <span className="scrap__spinner" aria-hidden="true" />}
        </div>

        <div className="scrap__meta">
          <p className="scrap__name" title={source.file.name}>
            {source.file.name}
          </p>
          <p className="scrap__stats">
            <span className="chip chip--kind">{KIND_LABEL[source.kind]}</span>
            <span className="chip">{formatBytes(source.file.size)}</span>
            {source.status === 'ready' && (
              <span className="chip">
                {source.pageCount} {source.pageCount === 1 ? 'page' : 'pages'}
              </span>
            )}
          </p>
        </div>

        {failed && source.error && <p className="scrap__error">{source.error}</p>}
        {probing && (
          <p className="scrap__status" role="status">
            Reading…
          </p>
        )}

        <div className="scrap__actions">
          <button
            type="button"
            className="icon-button"
            onClick={() => onRotate(source.id)}
            disabled={failed || probing}
            aria-label={`Rotate ${source.file.name}`}
          >
            <IconRotate />
          </button>
          <button
            type="button"
            className="icon-button icon-button--danger"
            onClick={() => onRemove(source.id)}
            aria-label={`Remove ${source.file.name}`}
          >
            <IconClose />
          </button>
        </div>

        <TornEdge />
      </div>
    </li>
  );
}
