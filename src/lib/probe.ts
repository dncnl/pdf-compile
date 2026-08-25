import { probeDocx } from './convert/docx.ts';
import { detectFile } from './detect.ts';
import { AppError, type SourceKind } from './types.ts';
import { downscale, probeImage, probePdf } from './thumbs.ts';

export interface ProbeResult {
  kind: SourceKind;
  pageCount: number;
  width?: number;
  height?: number;
  thumb?: Blob;
}

/** Rough lines-per-page for a plain text file at 11pt on A4. */
const TEXT_LINES_PER_PAGE = 48;

/**
 * Identify a file, count the pages it will contribute, and render a
 * thumbnail — all before the user commits to building anything. Catching a
 * password-protected PDF at drop time is far better than catching it thirty
 * seconds into a build.
 */
export async function probe(file: File): Promise<ProbeResult> {
  const detection = await detectFile(file);
  if (!detection.ok) {
    throw new AppError(detection.reason);
  }

  switch (detection.kind) {
    case 'pdf': {
      const { thumb, pageCount } = await probePdf(file);
      return { kind: 'pdf', pageCount, thumb };
    }

    case 'image': {
      const { thumb, width, height } = await probeImage(file);
      return { kind: 'image', pageCount: 1, width, height, thumb };
    }

    case 'docx': {
      const { pageCount, thumb } = await probeDocx(file);
      return { kind: 'docx', pageCount, thumb: await downscale(thumb) };
    }

    case 'text': {
      const text = await file.text();
      const lines = text.split(/\r\n?|\n/).length;
      return { kind: 'text', pageCount: Math.max(1, Math.ceil(lines / TEXT_LINES_PER_PAGE)) };
    }
  }
}
