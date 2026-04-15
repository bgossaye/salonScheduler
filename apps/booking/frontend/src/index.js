// apps/booking/frontend/src/index.js
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

const pathname =
  (typeof window !== 'undefined' && window.location && window.location.pathname) || '/';

const BASENAME =
  (window.__ENV && window.__ENV.BASENAME) ||
  (pathname.startsWith('/booking') ? '/booking' : '/');
const future = { v7_startTransition: true, v7_relativeSplatPath: true };

createRoot(document.getElementById('root')).render(
  <BrowserRouter basename={BASENAME} future={future}>
    <App />
  </BrowserRouter>
);
