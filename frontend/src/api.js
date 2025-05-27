// api.js
import axios from 'axios';

console.log('API URL:', process.env.REACT_APP_API_URL); // ✅ Add here

const API = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'https://rakie-backend.onrender.com/api',
});

export default API;