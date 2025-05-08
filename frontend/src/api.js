
import axios from 'axios';

const USE_MOCK = true;

const api = axios.create({
  baseURL: USE_MOCK
    ? 'http://localhost:5000/api/mock'
    : 'http://localhost:5000/api',
});

export default api;
