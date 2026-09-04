import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { API_BASE_URL, PROFILE_ENDPOINTS, STORAGE_KEYS } from '../constants/api';

// Profile calls are all authenticated, so this client attaches the token that
// login stored under STORAGE_KEYS.token.
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem(STORAGE_KEYS.token);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** The values the profile screen edits, with sensible empty defaults. */
export const EMPTY_PROFILE = {
  displayname: '',
  sex: '',
  height_cm: null,
  weight_kg: null,
};

export const SEX_OPTIONS = ['female', 'male', 'other'];

/** Picks the profile fields out of whatever the user object happens to hold. */
export function toProfile(user) {
  return {
    displayname: user?.profile?.displayname ?? user?.username ?? '',
    sex: user?.profile?.sex ?? '',
    height_cm:
      typeof user?.profile?.height_cm === 'number' ? user.profile.height_cm : null,
    weight_kg:
      typeof user?.profile?.weight_kg === 'number' ? user.profile.weight_kg : null,
  };
}

/** Reads the stored user, or null if nobody is signed in. */
export async function readStoredUser() {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.user);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    // A half-written user object should not break the profile screen.
    return null;
  }
}


/**
 * Turns a FastAPI error body into one sentence. A 422 sends `detail` as a list
 * of { loc, msg } entries, one per field it did not accept, so those get named.
 */
function readableDetail(detail, fallback) {
  if (typeof detail === 'string') return detail;

  if (Array.isArray(detail)) {
    const parts = detail.map((item) => {
      // loc is like ["body", "sex"]; the last entry is the field itself.
      const field = Array.isArray(item?.loc) ? item.loc[item.loc.length - 1] : null;
      const msg = item?.msg ?? 'is not valid';
      return field ? `${field}: ${msg}` : msg;
    });

    if (parts.length) return parts.join('\n');
  }

  return fallback;
}

export async function updateProfile(profile) {
  let data;
  try {
    ({ data } = await apiClient.put(PROFILE_ENDPOINTS.update, profile));
  } catch (error) {
    console.error(
      'Profile update failed:',
      error?.response?.status,
      // The body is where the server says what it disliked; the AxiosError
      // on its own only tells us the status code.
      JSON.stringify(error?.response?.data),
      'sent:',
      JSON.stringify(profile)
    );

    if (error?.response?.status === 401) {
      throw new Error('Your session has expired. Please sign in again.');
    }

    throw new Error(
      readableDetail(error?.response?.data?.detail, 'Could not save your profile.')
    );
  }

  // Keep the cached user in step with what the server just accepted, so the
  // profile screen still shows the new values after a restart.
  const current = (await readStoredUser()) ?? {};
  const next = { ...current, ...profile, ...(data?.data ?? data ?? {}) };

  await AsyncStorage.setItem(STORAGE_KEYS.user, JSON.stringify(next));
  return next;
}

/**
 * Deletes the account.
 *
 * The server call is left out for the same reason as updateProfile; right now
 * this only clears the session so the app returns to the login screen.
 */
export async function deleteAccount() {
  // TODO: call the backend here, e.g.
  // await http.delete(PROFILE_ENDPOINTS.deleteAccount);

  await AsyncStorage.multiRemove([STORAGE_KEYS.token, STORAGE_KEYS.user]);
}
