import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Self-hosted so the app makes no third-party requests. Three voices:
// Cormorant Garamond (serif) for headings, Jost (geometric) for the interface,
// and Pinyon Script for a handful of short decorative accents.
import '@fontsource-variable/cormorant-garamond';
import '@fontsource-variable/cormorant-garamond/wght-italic.css';
import '@fontsource-variable/jost';
import '@fontsource/pinyon-script/400.css';

import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';

import { App } from './App.tsx';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
