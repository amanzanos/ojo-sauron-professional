import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Registers the PWA service worker so WEROS is installable to a phone's home screen — see
// public/sw.js for why it's a pure pass-through rather than an offline cache.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.error('No se pudo registrar el service worker', err));
  });
}
