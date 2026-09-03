import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {SERVER_IP} from "@env";

const http = axios.create({
  baseURL: SERVER_IP,
});

http.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

export default http;
