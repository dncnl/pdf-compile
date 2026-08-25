/**
 * pdf-lib assembles the whole output in memory, so these caps are the only
 * thing standing between a large drop and a dead tab. Every one of them
 * surfaces as a specific message — nothing here fails silently.
 */
export const LIMITS = {
  MAX_FILES: 60,
  MAX_FILE_BYTES: 100 * 1024 * 1024,
  MAX_TOTAL_BYTES: 400 * 1024 * 1024,
  /** Longest edge an embedded image is downscaled to. */
  MAX_EDGE_PX: 4000,
  MAX_PAGES: 1500,
  PROBE_CONCURRENCY: 3,
  /** JPEG quality used when re-encoding images and DOCX page snapshots. */
  JPEG_QUALITY: 0.85,
  /** Device-pixel multiplier for DOCX page snapshots. */
  DOCX_SCALE: 2,
  THUMB_EDGE_PX: 320,
} as const;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
}
