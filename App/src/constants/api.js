// Where the backend lives - set EXPO_PUBLIC_SERVER_IP in App/.env, not here.
//
// Expo replaces process.env.EXPO_PUBLIC_* with its value while bundling, so
// the name has to be written out in full (destructuring it or building the
// name at runtime leaves it undefined) and the prefix is what makes it reach
// the app at all. The value is read once, when the bundle starts: after
// editing .env, restart the dev server with `npx expo start -c`.
const SERVER_IP = process.env.EXPO_PUBLIC_SERVER_IP;

// A trailing slash would turn every endpoint below into a double slash.
export const API_BASE_URL = (SERVER_IP ?? '').trim().replace(/\/+$/, '');

if (!API_BASE_URL) {
  console.error(
    'EXPO_PUBLIC_SERVER_IP is missing - every request will fail. Set it in ' +
      'App/.env (see .env.example) and restart with `npx expo start -c`.'
  );
}

export const AUTH_ENDPOINTS = {
  login: '/auth/login',
  signup: '/auth/register',
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
  getMeasurements: "/me/measurements",
};

// Keys used with AsyncStorage. `token` is the same key
// src/services/httpClient.js reads when it attaches the Authorization header.
export const STORAGE_KEYS = {
  token: 'token',
  refreshToken: 'refresh_token',
  user: 'user',
};
