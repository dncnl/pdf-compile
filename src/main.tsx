import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Self-hosted so the app makes no third-party requests. League Spartan is
// loaded Bold-only — that's the only weight the wordmark uses.
import '@fontsource/league-spartan/700.css';
import '@fontsource-variable/archivo';
import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';

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
