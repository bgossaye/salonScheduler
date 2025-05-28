//Don not change same for both local and live environment setting
import axios from 'axios';

const API = axios.create({
  //baseURL: 'https://rakie-backend.onrender.com/api'
  baseURL: 'http://localhost:5000/api'

});
console.log('API URL:', process.env.REACT_APP_API_URL);

export default API;
