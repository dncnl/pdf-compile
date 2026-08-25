import { useEffect, useRef } from 'react';
import { formatBytes } from '../lib/limits.ts';
import type { CompileResult } from '../lib/compile.ts';
import type { CompileProgress } from '../lib/types.ts';
import { withPdfExtension } from '../lib/download.ts';

export type BuildPhase = 'idle' | 'building' | 'done' | 'error';

interface Props {
  phase: BuildPhase;
  progress: CompileProgress;
  result: CompileResult | null;
  error: string | null;
  filename: string;
  onDownload: () => void;
  onClose: () => void;
}

/** Sheets drawn in the stack animation. Enough to read as a pile, few enough to stay cheap. */
const SHEETS = 10;

export function BuildOverlay({
  phase,
  progress,
  result,
  error,
  filename,
  onDownload,
  onClose,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeable = phase === 'done' || phase === 'error';

  useEffect(() => {
    if (phase === 'idle') return;
    panelRef.current?.focus();
  }, [phase]);

  useEffect(() => {
    if (!closeable) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeable, onClose]);

  if (phase === 'idle') return null;

  const ratio = progress.total > 0 ? progress.done / progress.total : 0;
  const settled = phase === 'done' ? SHEETS : Math.round(ratio * SHEETS);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Creating your PDF">
      <div className="overlay__panel" ref={panelRef} tabIndex={-1}>
        {phase !== 'error' && (
          <div className="stack" aria-hidden="true">
            {Array.from({ length: SHEETS }, (_, i) => (
              <span
                key={i}
                className={`stack__sheet${i < settled ? ' is-settled' : ''}`}
                style={{ ['--i' as string]: String(i) }}
              />
            ))}
          </div>
        )}

        {phase === 'building' && (
          <>
            <h2 className="overlay__title">Creating PDF…</h2>
            <p className="overlay__label" role="status" aria-live="polite">
              {progress.label}
            </p>
            <div
              className="progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.done}
            >
              <span className="progress__fill" style={{ width: `${Math.round(ratio * 100)}%` }} />
            </div>
          </>
        )}

        {phase === 'done' && result && (
          <>
            <h2 className="overlay__title">PDF ready</h2>
            <p className="overlay__label">
              {result.pageCount} {result.pageCount === 1 ? 'page' : 'pages'} ·{' '}
              {formatBytes(result.bytes.byteLength)}
            </p>

            {result.warnings.length > 0 && (
              <ul className="overlay__warnings">
                {result.warnings.map((warning) => (
                  <li key={warning.filename}>
                    <strong>{warning.filename}</strong> {warning.message}
                  </li>
                ))}
              </ul>
            )}

            <div className="overlay__actions">
              <button type="button" className="button button--primary button--big" onClick={onDownload}>
                Download {withPdfExtension(filename)}
              </button>
              <button type="button" className="button button--quiet" onClick={onClose}>
                Back to files
              </button>
            </div>
          </>
        )}

        {phase === 'error' && (
          <>
            <h2 className="overlay__title overlay__title--error">Couldn’t create the PDF</h2>
            <p className="overlay__label">{error}</p>
            <div className="overlay__actions">
              <button type="button" className="button button--primary" onClick={onClose}>
                Back to files
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
