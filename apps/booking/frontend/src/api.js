import axios from 'axios';

function pickApiBase() {
  const win = typeof window !== 'undefined' ? window : {};
  const fromWindow = win.__ENV?.API_URL || win.__ENV?.API_BASE;

  const fromEnv =
    process.env.REACT_APP_API_URL ||
    process.env.REACT_APP_API_BASE ||
    '/api'; // same-origin by default

  const raw = fromWindow || fromEnv;
  const url = raw.replace(/\/*$/, '');
  return url.match(/\/api$/) ? url : `${url}/api`;
}

const baseURL = pickApiBase();
const API = axios.create({ baseURL });

if (process.env.NODE_ENV !== 'production') {
  console.log('API baseURL →', baseURL);
}


API.interceptors.request.use((config) => {
  try {
    const token = typeof window !== 'undefined' ? window.localStorage.getItem('adminToken') : null;
    if (token) {
      config.headers = config.headers || {};
      if (!config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
 } catch (error) { void error; }

  return config;
});

export default API;
