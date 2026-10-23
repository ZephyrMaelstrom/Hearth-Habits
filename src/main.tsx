import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './ui/App';
import { getState, onStateChange, replaceFromSync } from './store/store';
import { initSync, pushLater } from './store/sync';
import { captureInstallPrompt } from './store/install';

captureInstallPrompt();
onStateChange(pushLater);
initSync(getState, replaceFromSync);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => undefined));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
