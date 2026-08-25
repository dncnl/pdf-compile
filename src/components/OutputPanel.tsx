import { useId } from 'react';
import type {
  FitId,
  MarginId,
  OrientationId,
  OutputSettings,
  PageSizeId,
} from '../lib/types.ts';

interface Props {
  settings: OutputSettings;
  onChange: (next: Partial<OutputSettings>) => void;
  totalPages: number;
  readyCount: number;
  isProbing: boolean;
  busy: boolean;
  onBuild: () => void;
  onClear: () => void;
}

const PAGE_SIZES: Array<{ id: PageSizeId; label: string }> = [
  { id: 'a4', label: 'A4' },
  { id: 'letter', label: 'Letter' },
  { id: 'legal', label: 'Legal' },
  { id: 'original', label: 'Match image' },
];

const ORIENTATIONS: Array<{ id: OrientationId; label: string }> = [
  { id: 'auto', label: 'Auto' },
  { id: 'portrait', label: 'Portrait' },
  { id: 'landscape', label: 'Landscape' },
];

const FITS: Array<{ id: FitId; label: string }> = [
  { id: 'contain', label: 'Fit inside' },
  { id: 'fill', label: 'Fill page' },
];

const MARGINS: Array<{ id: MarginId; label: string }> = [
  { id: 'none', label: 'None' },
  { id: 'small', label: 'Small' },
  { id: 'medium', label: 'Medium' },
  { id: 'large', label: 'Large' },
];

export function OutputPanel({
  settings,
  onChange,
  totalPages,
  readyCount,
  isProbing,
  busy,
  onBuild,
  onClear,
}: Props) {
  const filenameId = useId();

  const matchesImage = settings.pageSize === 'original';
  const fillsPage = settings.fit === 'fill';
  const canBuild = readyCount > 0 && !busy && !isProbing;

  return (
    <aside className="panel" aria-label="Output settings">
      <h2 className="panel__heading">Page setup</h2>
      <p className="panel__hint">
        Applies to images. PDFs and Word documents keep their own page size.
      </p>

      <Segmented
        label="Page size"
        options={PAGE_SIZES}
        value={settings.pageSize}
        onSelect={(pageSize) => onChange({ pageSize })}
      />

      <Segmented
        label="Orientation"
        options={ORIENTATIONS}
        value={settings.orientation}
        onSelect={(orientation) => onChange({ orientation })}
        disabled={matchesImage}
        disabledNote="Set by the image."
      />

      <Segmented
        label="Image fit"
        options={FITS}
        value={settings.fit}
        onSelect={(fit) => onChange({ fit })}
        disabled={matchesImage}
        disabledNote="Set by the image."
      />

      <Segmented
        label="Margin"
        options={MARGINS}
        value={settings.margin}
        onSelect={(margin) => onChange({ margin })}
        disabled={fillsPage && !matchesImage}
        disabledNote="Filling the page leaves no margin."
      />

      <div className="field">
        <label className="field__label" htmlFor={filenameId}>
          File name
        </label>
        <div className="field__row">
          <input
            id={filenameId}
            className="input"
            type="text"
            value={settings.filename}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => onChange({ filename: event.target.value })}
          />
          <span className="field__suffix">.pdf</span>
        </div>
      </div>

      <div className="panel__build">
        <button
          type="button"
          className="button button--primary button--big"
          onClick={onBuild}
          disabled={!canBuild}
        >
          {busy ? 'Creating PDF…' : 'Create PDF'}
        </button>

        <p className="panel__summary" role="status">
          {readyCount === 0
            ? 'Add files to get started.'
            : isProbing
              ? 'Reading files…'
              : `${readyCount} ${readyCount === 1 ? 'file' : 'files'} · ${totalPages} ${
                  totalPages === 1 ? 'page' : 'pages'
                }`}
        </p>

        {readyCount > 0 && (
          <button type="button" className="button button--quiet" onClick={onClear} disabled={busy}>
            Remove all files
          </button>
        )}
      </div>
    </aside>
  );
}

interface SegmentedProps<T extends string> {
  label: string;
  options: Array<{ id: T; label: string }>;
  value: T;
  onSelect: (value: T) => void;
  disabled?: boolean;
  disabledNote?: string;
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onSelect,
  disabled = false,
  disabledNote,
}: SegmentedProps<T>) {
  return (
    <fieldset className={`segmented${disabled ? ' segmented--off' : ''}`} disabled={disabled}>
      <legend className="field__label">{label}</legend>
      <div className="segmented__row">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`segmented__option${value === option.id ? ' is-selected' : ''}`}
            aria-pressed={value === option.id}
            onClick={() => onSelect(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {disabled && disabledNote && <p className="segmented__note">{disabledNote}</p>}
    </fieldset>
  );
}
