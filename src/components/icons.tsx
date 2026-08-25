import type { SourceKind } from '../lib/types.ts';

/**
 * Hand-drawn-feeling glyphs: open strokes, round caps, no fills. They are
 * decorative — every control that uses one also carries a text label or an
 * accessible name.
 */

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
};

export function IconClose({ size = 18 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function IconRotate({ size = 18 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4v4h-4" />
    </svg>
  );
}

export function IconGrip({ size = 18 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size} strokeWidth={2.6}>
      <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" />
    </svg>
  );
}

export function IconPlus({ size = 22 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconWarning({ size = 18 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M12 4.5 2.8 20h18.4L12 4.5Z" />
      <path d="M12 10v4M12 17h.01" />
    </svg>
  );
}

export function IconKind({ kind, size = 26 }: { kind: SourceKind; size?: number }) {
  switch (kind) {
    case 'pdf':
      return (
        <svg {...base} width={size} height={size}>
          <path d="M6 3h8l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
          <path d="M14 3v5h5" />
          <path d="M8.5 17v-4h1.6a1.3 1.3 0 0 1 0 2.6H8.5" />
        </svg>
      );
    case 'docx':
      return (
        <svg {...base} width={size} height={size}>
          <path d="M6 3h8l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
          <path d="M14 3v5h5" />
          <path d="M8 13l1.4 4.5L11 13l1.6 4.5L14 13" />
        </svg>
      );
    case 'text':
      return (
        <svg {...base} width={size} height={size}>
          <path d="M6 3h8l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
          <path d="M14 3v5h5" />
          <path d="M8.5 13h7M8.5 16.5h7M8.5 10h3" />
        </svg>
      );
    case 'image':
      return (
        <svg {...base} width={size} height={size}>
          <rect x="3.5" y="5" width="17" height="14" rx="1.5" />
          <circle cx="9" cy="10" r="1.6" />
          <path d="m4.5 17 4.2-4.2a1.5 1.5 0 0 1 2.1 0L16 17.5" />
          <path d="m14 15.2 1.6-1.6a1.5 1.5 0 0 1 2.1 0l2 2" />
        </svg>
      );
  }
}

/** A torn-paper edge, tiled along the bottom of a card. */
export function TornEdge() {
  return (
    <svg
      className="scrap__tear"
      viewBox="0 0 120 8"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M0 0h120v3.2l-6 2.1-6-1.6-6 2.4-6-1.2-6 1.9-6-2.3-6 1.5-6-1.8-6 2.6-6-1.4-6 1.1-6-2.2-6 1.7-6-1.5-6 2.1-6-2.4V0Z"
        fill="currentColor"
      />
    </svg>
  );
}
