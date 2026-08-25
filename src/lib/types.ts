export type SourceKind = 'image' | 'pdf' | 'docx' | 'text';

export type SourceStatus = 'probing' | 'ready' | 'error';

export type Rotation = 0 | 90 | 180 | 270;

export interface Source {
  id: string;
  file: File;
  kind: SourceKind;
  status: SourceStatus;
  /** Pages this source contributes to the output. 0 until probing finishes. */
  pageCount: number;
  /** Natural pixel size, images only. */
  width?: number;
  height?: number;
  /** Object URL for the card thumbnail. Revoked when the source is removed. */
  thumbUrl?: string;
  rotation: Rotation;
  /** Set when the source cannot be used at all. */
  error?: string;
  /** Set when the source will be used, but not as well as it could be. */
  warning?: string;
  /** Stable per-card tilt in degrees, derived from the id. */
  tilt: number;
}

export type PageSizeId = 'a4' | 'letter' | 'legal' | 'original';
export type OrientationId = 'auto' | 'portrait' | 'landscape';
export type FitId = 'contain' | 'fill';
export type MarginId = 'none' | 'small' | 'medium' | 'large';

export interface OutputSettings {
  pageSize: PageSizeId;
  orientation: OrientationId;
  fit: FitId;
  margin: MarginId;
  filename: string;
}

export const DEFAULT_SETTINGS: OutputSettings = {
  pageSize: 'a4',
  orientation: 'auto',
  fit: 'contain',
  margin: 'small',
  filename: 'stackly',
};

export interface CompileProgress {
  done: number;
  total: number;
  label: string;
}

/**
 * An error whose message is written for the person using the app, not for a
 * log. Anything thrown as an AppError gets shown verbatim in the UI.
 */
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppError';
  }
}

export function messageFor(err: unknown): string {
  if (err instanceof AppError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong with this file.';
}
