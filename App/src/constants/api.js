// Where the backend lives. Point this at your server (or your machine's LAN
// IP while developing - "localhost" is the phone itself, not your computer).
export const API_BASE_URL = 'http://192.168.104.10:8080';

export const AUTH_ENDPOINTS = {
  login: '/auth/login',
  signup: '/auth/register',
  // Trades a refresh token for a fresh access token. The backend does not
  // serve this yet - see the note in src/services/httpClient.js.
  refresh: '/auth/refresh',
};

// Profile and account endpoints. Fill these in when the backend is ready -
// src/services/profile.js is where they get used.
export const PROFILE_ENDPOINTS = {
  get: '/me/profile',
  update: '/me/profile',
  deleteAccount: '/me/account',
};

export const DASHBOARD_ENDPOINTS = {
  vitals: '/me/vitals',
  steps: "/me/steps",
  measurements: "/me/measurements/batch",
};

// Keys used with AsyncStorage. `token` is the same key
// src/services/httpClient.js reads when it attaches the Authorization header.
export const STORAGE_KEYS = {
  token: 'token',
  refreshToken: 'refresh_token',
  user: 'user',
};
