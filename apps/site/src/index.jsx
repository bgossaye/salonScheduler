// index.jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import '@rakie/tokens/css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// SW: prod only; clean in dev
if ('serviceWorker' in navigator) {
  if (process.env.NODE_ENV === 'production') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(console.error);
    });
  } else {
    navigator.serviceWorker.getRegistrations?.().then(r => r.forEach(sw => sw.unregister()));
    caches?.keys().then(keys => keys.forEach(k => caches.delete(k)));
  }
}
