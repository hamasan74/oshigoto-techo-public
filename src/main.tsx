import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

function applyDisplayModeClass() {
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in window.navigator &&
      Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));

  document.body.classList.toggle('is-standalone', isStandalone);
}

applyDisplayModeClass();
window.matchMedia('(display-mode: standalone)').addEventListener('change', applyDisplayModeClass);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      return undefined;
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
