// src/config/apiBase.js
export function getApiBase() {
  const w = typeof window !== 'undefined' ? window : {};
  const fromWindow = w.__ENV?.API_BASE || w.API_BASE;
  const fromNode = typeof process !== 'undefined' ? process.env?.REACT_APP_API_BASE : undefined;

  const base = (fromWindow || fromNode || '').trim();
  return base.replace(/\/+$/, ''); // strip trailing slash
}
