import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LIMITS, formatBytes } from '../lib/limits.ts';
import { probe } from '../lib/probe.ts';
import { messageFor, type Rotation, type Source } from '../lib/types.ts';

let idCounter = 0;

function makeId(): string {
  idCounter += 1;
  return `src-${idCounter}-${Date.now().toString(36)}`;
}

/** A stable pseudo-random tilt per card, so re-renders never reshuffle them. */
function tiltFor(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return ((Math.abs(hash) % 201) / 100 - 1) * 1.8;
}

export interface UseSources {
  sources: Source[];
  notices: string[];
  totalPages: number;
  totalBytes: number;
  isProbing: boolean;
  readyCount: number;
  addFiles: (files: File[]) => void;
  remove: (id: string) => void;
  rotate: (id: string) => void;
  move: (id: string, toIndex: number) => void;
  clear: () => void;
  dismissNotices: () => void;
}

export function useSources(): UseSources {
  const [sources, setSources] = useState<Source[]>([]);
  const [notices, setNotices] = useState<string[]>([]);

  // Mirrors `sources` so validation can read the current list without running
  // inside a state updater — queueing probes and notices are side effects, and
  // React may call an updater twice.
  const sourcesRef = useRef<Source[]>([]);
  useEffect(() => {
    sourcesRef.current = sources;
  }, [sources]);

  // Thumbnails are object URLs and have to be revoked by hand.
  const objectUrls = useRef(new Set<string>());

  const releaseUrl = useCallback((url: string | undefined) => {
    if (!url) return;
    URL.revokeObjectURL(url);
    objectUrls.current.delete(url);
  }, []);

  useEffect(() => {
    const urls = objectUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  const runProbe = useCallback(async (id: string, file: File) => {
    try {
      const result = await probe(file);
      const thumbUrl = result.thumb ? URL.createObjectURL(result.thumb) : undefined;
      if (thumbUrl) objectUrls.current.add(thumbUrl);

      setSources((prev) =>
        prev.map((source) =>
          source.id === id
            ? {
                ...source,
                status: 'ready' as const,
                kind: result.kind,
                pageCount: result.pageCount,
                width: result.width,
                height: result.height,
                thumbUrl,
              }
            : source,
        ),
      );
    } catch (err) {
      setSources((prev) =>
        prev.map((source) =>
          source.id === id
            ? { ...source, status: 'error' as const, pageCount: 0, error: messageFor(err) }
            : source,
        ),
      );
    }
  }, []);

  const addFiles = useCallback(
    (incoming: File[]) => {
      if (incoming.length === 0) return;

      const existing = sourcesRef.current;
      const rejected: string[] = [];
      const accepted: Source[] = [];
      let runningBytes = existing.reduce((sum, source) => sum + source.file.size, 0);
      let slots = LIMITS.MAX_FILES - existing.length;

      for (const file of incoming) {
        if (slots <= 0) {
          rejected.push(
            `Stackly holds ${LIMITS.MAX_FILES} files at a time. ${file.name} wasn’t added.`,
          );
          continue;
        }
        if (file.size === 0) {
          rejected.push(`${file.name} is empty.`);
          continue;
        }
        if (file.size > LIMITS.MAX_FILE_BYTES) {
          rejected.push(
            `${file.name} is ${formatBytes(file.size)}. The limit is ${formatBytes(LIMITS.MAX_FILE_BYTES)}.`,
          );
          continue;
        }
        if (runningBytes + file.size > LIMITS.MAX_TOTAL_BYTES) {
          rejected.push(
            `Adding ${file.name} would go over the ${formatBytes(LIMITS.MAX_TOTAL_BYTES)} total, so it wasn’t added.`,
          );
          continue;
        }

        const id = makeId();
        accepted.push({
          id,
          file,
          kind: 'image',
          status: 'probing',
          pageCount: 0,
          rotation: 0,
          tilt: tiltFor(id),
        });
        runningBytes += file.size;
        slots -= 1;
      }

      if (rejected.length > 0) {
        setNotices((current) => [...current, ...rejected]);
      }
      if (accepted.length === 0) return;

      // Keep the ref current so back-to-back drops validate against the real
      // count before React has re-rendered.
      sourcesRef.current = [...existing, ...accepted];
      setSources((prev) => [...prev, ...accepted]);

      // Probing lays out DOCX in the DOM and decodes images on the GPU, so it
      // runs a few at a time rather than all at once.
      void runQueue(accepted, LIMITS.PROBE_CONCURRENCY, (source) =>
        runProbe(source.id, source.file),
      );
    },
    [runProbe],
  );

  const remove = useCallback(
    (id: string) => {
      setSources((prev) => {
        const target = prev.find((source) => source.id === id);
        releaseUrl(target?.thumbUrl);
        return prev.filter((source) => source.id !== id);
      });
    },
    [releaseUrl],
  );

  const rotate = useCallback((id: string) => {
    setSources((prev) =>
      prev.map((source) =>
        source.id === id
          ? { ...source, rotation: ((source.rotation + 90) % 360) as Rotation }
          : source,
      ),
    );
  }, []);

  const move = useCallback((id: string, toIndex: number) => {
    setSources((prev) => {
      const from = prev.findIndex((source) => source.id === id);
      if (from === -1) return prev;
      const to = Math.max(0, Math.min(prev.length - 1, toIndex));
      if (from === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved!);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setSources((prev) => {
      for (const source of prev) releaseUrl(source.thumbUrl);
      return [];
    });
    setNotices([]);
  }, [releaseUrl]);

  const dismissNotices = useCallback(() => setNotices([]), []);

  const totalPages = useMemo(
    () => sources.reduce((sum, source) => sum + (source.error ? 0 : source.pageCount), 0),
    [sources],
  );
  const totalBytes = useMemo(
    () => sources.reduce((sum, source) => sum + source.file.size, 0),
    [sources],
  );
  const isProbing = useMemo(() => sources.some((s) => s.status === 'probing'), [sources]);
  const readyCount = useMemo(
    () => sources.filter((s) => s.status === 'ready').length,
    [sources],
  );

  return {
    sources,
    notices,
    totalPages,
    totalBytes,
    isProbing,
    readyCount,
    addFiles,
    remove,
    rotate,
    move,
    clear,
    dismissNotices,
  };
}

/** Run `task` over `items`, at most `limit` at a time. */
async function runQueue<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await task(items[index]!);
    }
  });
  await Promise.all(workers);
}
