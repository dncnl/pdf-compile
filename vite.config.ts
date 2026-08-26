import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Stackly never talks to the network after load. This policy is what makes that
// claim checkable rather than just stated. blob: is required by the pdf.js
// worker; 'unsafe-inline' styles are required by docx-preview, which injects a
// <style> block per document to reproduce Word's layout.
//
// frame-ancestors is deliberately absent: browsers ignore it in a <meta> tag
// and log a warning for every visitor. It ships as a real header instead, via
// public/_headers on hosts that support one.
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' blob: data:",
  "connect-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

// Injected on build only — the dev server needs inline scripts and eval for HMR,
// and enforcing the production policy there would just break the reload loop.
function cspPlugin(): Plugin {
  return {
    name: 'stackly-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

// The repo is published at github.com/dncnl/pdf-compile, so GitHub Pages serves
// it from /pdf-compile/. Preview counts too: it reports command 'serve' but
// serves the already-built HTML, whose asset URLs carry the build-time base.
// Vercel serves from the domain root regardless, and sets VERCEL=1 during its
// build, so that overrides the subpath. Only the dev server stays at / so
// localhost URLs are plain.
export default defineConfig(({ command, isPreview }) => ({
  base: process.env.VERCEL ? '/' : command === 'build' || isPreview ? '/pdf-compile/' : '/',
  plugins: [react(), cspPlugin()],
  build: {
    target: 'es2022',
    // pdf.js and pdf-lib are both large; splitting them keeps the initial
    // paint fast and lets the browser cache them across releases.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/pdfjs-dist')) return 'pdfjs';
          if (id.includes('node_modules/pdf-lib')) return 'pdflib';
          if (
            id.includes('node_modules/docx-preview') ||
            id.includes('node_modules/mammoth') ||
            id.includes('node_modules/html2canvas-pro')
          ) {
            return 'docx';
          }
          return undefined;
        },
      },
    },
  },
  worker: { format: 'es' },
}));
