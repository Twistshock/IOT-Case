import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { API_BASE_URL, AUTH_ENDPOINTS, STORAGE_KEYS } from '../constants/api';

// A plain client for the two auth calls. It deliberately does not reuse
// src/http/http.js, because that one adds a token we do not have yet.
const authClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

/** Turns whatever axios threw into one sentence we can show the user. */
function readableError(error, fallback) {
  const message = error?.response?.data?.message || error?.response?.data?.error;
  if (message) return String(message);

  if (error?.response) return `${fallback} (status ${error.response.status}).`;
  if (error?.request) return 'Could not reach the server. Check your connection.';

  return fallback;
}

async function saveSession({ token, user }) {
  const writes = [];
  if (token) writes.push([STORAGE_KEYS.token, token]);
  if (user) writes.push([STORAGE_KEYS.user, JSON.stringify(user)]);

  if (writes.length) await AsyncStorage.multiSet(writes);
}

/**
 * Signs in and stores the session.
 * Resolves with { token, user }; throws an Error with a readable message.
 */
export async function login({ username, password }) {
  try {
    const res = await authClient.post(AUTH_ENDPOINTS.login, {
      username: username.trim(),
      password,
    });
    const session = { token: res?.data?.access_token, user: res?.data?.data ?? { username } };
    await saveSession(session);
    return session;
  } catch (error) {
    throw new Error(readableError(error, 'Could not sign you in.'));
  }
}

/**
 * Creates an account. Some backends sign the user in straight away and return
 * a token; if this one does not, the caller is expected to send them to login.
 */
export async function signup({ name, username, password }) {
  try {
    const { data } = await authClient.post(AUTH_ENDPOINTS.signup, {
      name: name.trim(),
      username: username.trim(),
      password,
    });

    const session = {
      token: data?.token,
      user: data?.user ?? { name, username },
    };
    if (session.token) await saveSession(session);

    return session;
  } catch (error) {
    throw new Error(readableError(error, 'Could not create your account.'));
  }
}

/** Clears the stored session. */
export async function logout() {
  await AsyncStorage.multiRemove([STORAGE_KEYS.token, STORAGE_KEYS.user]);
}

/** Reads a session saved by an earlier run, or null if there is none. */
export async function restoreSession() {
  const entries = await AsyncStorage.multiGet([
    STORAGE_KEYS.token,
    STORAGE_KEYS.user,
  ]);

  const stored = Object.fromEntries(entries);
  const token = stored[STORAGE_KEYS.token];
  if (!token) return null;

  try {
    return { token, user: JSON.parse(stored[STORAGE_KEYS.user] ?? 'null') };
  } catch {
    // A half-written user object should not lock anyone out.
    return { token, user: null };
  }
}
