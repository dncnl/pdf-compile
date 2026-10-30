import { useCallback, useEffect, useRef, useState } from 'react';
import { Board } from './components/Board.tsx';
import { BuildOverlay, type BuildPhase } from './components/BuildOverlay.tsx';
import { Footer } from './components/Footer.tsx';
import { Header } from './components/Header.tsx';
import { Notices } from './components/Notices.tsx';
import { OutputPanel } from './components/OutputPanel.tsx';
import { useSources } from './hooks/useSources.ts';
import { compile, type CompileResult } from './lib/compile.ts';
import { downloadPdf, outputFilename } from './lib/download.ts';
import {
  DEFAULT_SETTINGS,
  messageFor,
  type CompileProgress,
  type OutputSettings,
} from './lib/types.ts';

const STORAGE_KEY = 'stackly.settings.v1';

const ALLOWED: Record<string, ReadonlyArray<string>> = {
  pageSize: ['a4', 'letter', 'legal', 'original'],
  orientation: ['auto', 'portrait', 'landscape'],
  fit: ['contain', 'fill'],
  margin: ['none', 'small', 'medium', 'large'],
};

/**
 * Page settings are the only thing that persists. File contents never touch
 * storage — they live in memory for as long as the tab is open and no longer.
 * The file name doesn't persist either: it belongs to this batch of files, and
 * a stale one would override naming the PDF after the first file.
 */
function loadSettings(): OutputSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<OutputSettings>;
    const next = { ...DEFAULT_SETTINGS };

    for (const [key, values] of Object.entries(ALLOWED)) {
      const value = parsed[key as keyof OutputSettings];
      if (typeof value === 'string' && values.includes(value)) {
        (next as Record<string, string>)[key] = value;
      }
    }
    return next;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function App() {
  const {
    sources,
    notices,
    totalPages,
    isProbing,
    readyCount,
    addFiles,
    remove,
    rotate,
    move,
    clear,
    dismissNotices,
  } = useSources();

  const [settings, setSettings] = useState<OutputSettings>(loadSettings);
  const [phase, setPhase] = useState<BuildPhase>('idle');
  const [progress, setProgress] = useState<CompileProgress>({ done: 0, total: 0, label: '' });
  const [result, setResult] = useState<CompileResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDropping, setIsDropping] = useState(false);

  useEffect(() => {
    try {
      const { filename: _filename, ...persisted } = settings;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    } catch {
      // Private browsing or blocked storage. Settings just won't persist.
    }
  }, [settings]);

  const updateSettings = useCallback((patch: Partial<OutputSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  // ---- Drag and drop anywhere on the page ----
  // dragenter/dragleave fire for every child element, so nesting is tracked
  // with a counter rather than a boolean.
  const dragDepth = useRef(0);

  useEffect(() => {
    function hasFiles(event: DragEvent): boolean {
      return Array.from(event.dataTransfer?.types ?? []).includes('Files');
    }

    function onDragEnter(event: DragEvent) {
      if (!hasFiles(event)) return;
      dragDepth.current += 1;
      setIsDropping(true);
    }
    function onDragOver(event: DragEvent) {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    }
    function onDragLeave(event: DragEvent) {
      if (!hasFiles(event)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setIsDropping(false);
    }
    function onDrop(event: DragEvent) {
      dragDepth.current = 0;
      setIsDropping(false);
      if (!hasFiles(event)) return;
      event.preventDefault();
      addFiles(Array.from(event.dataTransfer?.files ?? []));
    }

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [addFiles]);

  // Losing a half-built PDF to an accidental reload is worth a confirmation.
  useEffect(() => {
    if (phase !== 'building') return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [phase]);

  // Error cards never reach the output, so they don't get to name it either.
  const firstFileName = sources.find((source) => source.status !== 'error')?.file.name;
  const filename = outputFilename(settings.filename, firstFileName);

  const handleBuild = useCallback(async () => {
    setPhase('building');
    setResult(null);
    setError(null);
    setProgress({ done: 0, total: readyCount, label: 'Getting started' });

    try {
      const built = await compile(sources, { ...settings, filename }, setProgress);
      setResult(built);
      setPhase('done');
    } catch (err) {
      setError(messageFor(err));
      setPhase('error');
    }
  }, [filename, readyCount, settings, sources]);

  const handleDownload = useCallback(() => {
    if (result) downloadPdf(result.bytes, filename);
  }, [result, filename]);

  return (
    <div className="app">
      <Header />

      <main className="layout">
        <section className="layout__board" aria-label="Files to combine">
          <Notices notices={notices} onDismiss={dismissNotices} />
          <Board
            sources={sources}
            isDropping={isDropping}
            onFiles={addFiles}
            onRemove={remove}
            onRotate={rotate}
            onMove={move}
          />
        </section>

        <OutputPanel
          settings={settings}
          filenamePlaceholder={outputFilename('', firstFileName) || 'stackly'}
          onChange={updateSettings}
          totalPages={totalPages}
          readyCount={readyCount}
          isProbing={isProbing}
          busy={phase === 'building'}
          onBuild={handleBuild}
          onClear={clear}
        />
      </main>

      <Footer />

      <BuildOverlay
        phase={phase}
        progress={progress}
        result={result}
        error={error}
        filename={filename}
        onDownload={handleDownload}
        onClose={() => setPhase('idle')}
      />
    </div>
  );
}
