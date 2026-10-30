import { useId, useRef } from 'react';
import { IconPlus } from './icons.tsx';

const ACCEPT = '.pdf,.docx,.txt,.md,.markdown,.csv,image/*';

interface Props {
  onFiles: (files: File[]) => void;
  variant: 'tile' | 'empty';
}

export function DropZone({ onFiles, variant }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    onFiles(files);
    // Reset so choosing the same file twice in a row still fires a change.
    event.target.value = '';
  }

  return (
    <div className={variant === 'empty' ? 'dropzone dropzone--empty' : 'dropzone dropzone--tile'}>
      <input
        ref={inputRef}
        id={inputId}
        className="visually-hidden"
        type="file"
        multiple
        accept={ACCEPT}
        onChange={handleChange}
      />

      {variant === 'empty' ? (
        <>
          <p className="dropzone__eyebrow">Begin here</p>
          <h2 className="dropzone__title">
            No files <em className="script">yet</em>
          </h2>
          <p className="dropzone__body">
            Drop files anywhere on this page, or choose them below. Images, PDFs, Word
            documents, and plain text all work.
          </p>
          <label htmlFor={inputId} className="button button--primary button--wide">
            Choose files
          </label>
        </>
      ) : (
        <label htmlFor={inputId} className="dropzone__tile-label">
          <IconPlus />
          <span>Add files</span>
        </label>
      )}
    </div>
  );
}
