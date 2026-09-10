import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { API_BASE_URL, AUTH_ENDPOINTS, STORAGE_KEYS } from '../constants/api';

/** The settings every client in the app shares. */
function createClient() {
  return axios.create({
    baseURL: API_BASE_URL,
    timeout: 10000,
    headers: { 'Content-Type': 'application/json' },
  });
}

// For the calls made before there is a session - login, signup and the refresh
// call itself. It deliberately skips the interceptors below: it has no token to
// attach, and routing its 401s back into the refresh logic would loop.
export const authClient = createClient();

// For every authenticated call. It attaches the token that login stored under
// STORAGE_KEYS.token, and on a 401 it tries the refresh token once.
export const apiClient = createClient();

apiClient.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem(STORAGE_KEYS.token);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Wipes the stored session. The one place that knows which keys make it up. */
export async function clearSession() {
  await AsyncStorage.multiRemove([
    STORAGE_KEYS.token,
    STORAGE_KEYS.refreshToken,
    STORAGE_KEYS.user,
  ]);
}

// Called once when a refresh fails and the user has to sign in again. The app
// registers a handler (navigate to Login, drop the user context) with
// setSessionExpiredHandler; until it does, a dead session just surfaces as the
// 401 the caller already handles.
let sessionExpiredHandler = null;

export function setSessionExpiredHandler(handler) {
  sessionExpiredHandler = typeof handler === 'function' ? handler : null;
}

/**
 * Trades the stored refresh token for a new access token and saves it.
 * Resolves with the new token, or null when there is nothing to refresh with.
 */
async function requestNewAccessToken() {
  const refreshToken = await AsyncStorage.getItem(STORAGE_KEYS.refreshToken);
  if (!refreshToken) return null;

  const { data } = await authClient.post(AUTH_ENDPOINTS.refresh, {
    refresh_token: refreshToken,
  });

  const accessToken = data?.access_token;
  if (!accessToken) return null;

  const writes = [[STORAGE_KEYS.token, accessToken]];
  // A server that rotates refresh tokens hands back a new one every time; one
  // that does not simply leaves the stored token in place.
  if (data?.refresh_token) writes.push([STORAGE_KEYS.refreshToken, data.refresh_token]);
  await AsyncStorage.multiSet(writes);

  return accessToken;
}

// One refresh at a time. The dashboard fires several calls at once, so without
// this a single expiry would spend the refresh token four or five times over -
// and on a server that rotates them, every call but the first would fail.
let refreshInFlight = null;

function refreshAccessToken() {
  if (!refreshInFlight) {
    refreshInFlight = requestNewAccessToken()
      .catch(() => null) // A failed refresh means "sign in again", not a crash.
      .finally(() => {
        refreshInFlight = null;
      });
  }

  return refreshInFlight;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const request = error?.config;

    // `_retried` stops a request that 401s again on a brand new token from
    // refreshing forever.
    if (error?.response?.status !== 401 || !request || request._retried) {
      throw error;
    }

    request._retried = true;

    const accessToken = await refreshAccessToken();
    if (!accessToken) {
      await clearSession();
      sessionExpiredHandler?.();
      throw error;
    }

    // The request interceptor reads the new token back out of storage, but set
    // it here too so the retry does not depend on that ordering.
    if (request.headers) request.headers.Authorization = `Bearer ${accessToken}`;

    return apiClient(request);
  }
);

export default apiClient;
