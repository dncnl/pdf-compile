# Stackly

Combine images, PDFs, and Word documents into a single PDF.

Stackly runs entirely in the browser. There is no server, no account, and no upload — your files are read, converted, and assembled in the tab, and the result is handed straight back to you.

## What goes in

| Type | Formats | How it lands in the PDF |
| --- | --- | --- |
| Images | JPEG, PNG, WebP, AVIF, GIF, BMP | One page each, sized by your page settings |
| PDF | Any unencrypted PDF | Pages copied intact — text stays selectable, vectors stay sharp |
| Word | `.docx` | Laid out with real pagination, then rendered to page images |
| Text | `.txt`, `.md`, `.csv`, `.log` | Typeset as real, selectable PDF text |

Documents that already have their own page geometry — PDFs and Word files — keep it. The page size, orientation, fit, and margin settings apply to loose images, which are the only sources with no page size of their own.

### The Word tradeoff

Word pages come out as **images**: they look like the original, but the text is not selectable or searchable, and pages run roughly 200–500 KB each.

This is deliberate. No browser-side converter produces faithful Word layout *and* real text objects. The only thing that does is a server-side LibreOffice pass, which would mean uploading your documents — and that would cost the guarantee that nothing leaves your tab. For a merge tool, looking right is the better side of that trade. If a document fails to lay out, Stackly falls back to extracting its text so the file still lands, and says so on the card.

## Privacy

The claim is that nothing leaves your browser, and it is enforced rather than promised:

- No `fetch`, no analytics, no cookies, no third-party CDN. Fonts and libraries are all bundled.
- A strict Content-Security-Policy (`default-src 'none'`, `connect-src 'self' blob: data:`) blocks outbound requests at the browser level.
- Only your page settings are saved to `localStorage`. File contents never are.
- Word documents are sanitized before rendering — scripts, embedded frames, and any non-inline URL are stripped from the rendered DOM.
- Files are identified by their magic bytes, not their extension. A `.png` that is really a PDF is treated as a PDF; a `.docx` that is really something else is rejected.

There is an automated test that asserts the app makes zero external requests through a full build. To check it yourself: open DevTools → Network, run a build, and watch nothing happen.

## Limits

60 files · 100 MB per file · 400 MB total · 1500 pages. `pdf-lib` assembles the output in memory, so these caps are what keep a large drop from exhausting the tab. Every limit surfaces as a specific message.

Encrypted PDFs are refused with an explanation rather than failing silently. HEIC, TIFF, `.doc`, `.xlsx`, and `.pptx` are detected and rejected with a note on what to do instead.

## Development

```bash
npm install
npm run dev      # http://localhost:5173
```

```bash
npm run build    # typecheck, then production build
npm test         # unit tests (Vitest)
npm run e2e      # end-to-end tests (Playwright, needs `npx playwright install chromium`)
```

The end-to-end tests drive the real app and then re-open the PDF it produced with `pdf-lib`, asserting page counts and page dimensions — not merely that a file downloaded.

## How it fits together

```
src/
  components/   Header · DropZone · Board · ScrapCard · OutputPanel · BuildOverlay
  hooks/
    useSources  add / remove / reorder / rotate, plus the probe queue
  lib/
    detect      magic-byte identification
    probe       page count + thumbnail, run on drop so errors surface early
    compile     the orchestrator: ordered sources -> one PDFDocument
    geometry    page sizes, fit maths, margins
    convert/    image · pdf · docx · text
    sanitize    scrubs the rendered DOCX DOM before rasterizing
```

Work happens in two stages. **Probe** runs when files are added: identify the type, count the pages, render a thumbnail, and surface any problem immediately — catching a password-protected PDF at drop time is far better than catching it thirty seconds into a build. **Compile** runs on the button press, walking the ordered sources and appending each to a single document.

## Stack

React 19 · TypeScript · Vite · plain CSS. `pdf-lib` builds the output, `pdfjs-dist` reads and previews PDFs, `docx-preview` plus `html2canvas-pro` handle Word, `@dnd-kit` provides drag-and-keyboard reordering.

## Licence

MIT.
