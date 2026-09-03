import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { API_BASE_URL, STORAGE_KEYS, DASHBOARD_ENDPOINTS } from '../constants/api';

// Dashboard calls are all authenticated, so this client attaches the token that
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

/** Turns whatever axios threw into one sentence we can show the user. */
function readableError(error, fallback) {
  if (error?.response?.status === 401) {
    return 'Your session has expired. Please sign in again.';
  }

  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string') return detail;

  if (Array.isArray(detail)) {
    // FastAPI sends a 422 as a list of { loc, msg }, one per field it refused.
    const parts = detail.map((item) => {
      const field = Array.isArray(item?.loc) ? item.loc[item.loc.length - 1] : null;
      const msg = item?.msg ?? 'is not valid';
      return field ? `${field}: ${msg}` : msg;
    });

    if (parts.length) return parts.join('\n');
  }

  if (error?.response) return `${fallback} (status ${error.response.status}).`;
  if (error?.request) return 'Could not reach the server. Check your connection.';

  return fallback;
}


function numericFields(source, keys) {
  const payload = {};

  keys.forEach((key) => {
    const value = source?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) payload[key] = value;
  });

  return payload;
}


function readingTimestamp() {
  return new Date().toISOString();
}


async function SaveBpm(stats) {
  const payload = numericFields(stats, ['bpm', 'spo2', 'temp']);
  if (!Object.keys(payload).length) return null;
  payload.timestamp = readingTimestamp();

  try {
    const { data } = await apiClient.post(DASHBOARD_ENDPOINTS.vitals, payload);
    if(data?.ok){
        console.log('Saved vitals successfully', readingTimestamp());
        return data;
    }
    throw new Error('Server did not accept the vitals reading.');
  } catch (error) {
    console.error(
      'Saving vitals failed:',
      error?.response?.status,
      JSON.stringify(error?.response?.data),
      'sent:',
      JSON.stringify(payload)
    );

    throw new Error(readableError(error, 'Could not save your reading.'));
  }
}

/** Stores a step count, the same way SaveBpm stores a heart-rate reading. */
async function SaveSteps(stats) {
  const payload = numericFields(stats, ['steps', 'kcal']);
  if (payload.steps == null) return null;

  payload.timestamp = readingTimestamp();

  try {
    const { data } = await apiClient.post(DASHBOARD_ENDPOINTS.steps, payload);
    return data;
  } catch (error) {
    console.error(
      'Saving steps failed:',
      error?.response?.status,
      JSON.stringify(error?.response?.data),
      'sent:',
      JSON.stringify(payload)
    );

    throw new Error(readableError(error, 'Could not save your step count.'));
  }
}


async function fetchStepsDB() {
  try {
    const now = new Date();

    const today = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');

    const { data } = await apiClient.get(DASHBOARD_ENDPOINTS.steps, {
      params: {
        from: today,
        to: today,
      },
    });

    return data;
  } catch (error) {
    console.error(
      'Get today steps failed:',
      error?.response?.status,
      JSON.stringify(error?.response?.data)
    );

    throw new Error(
      readableError(error, "Could not load today's step count.")
    );
  }
}


/**
 * Asks the tracker for its current step count.
 *
 * `send` is the writer from the BLE context (`send` out of useBleSender, or
 * `sendTrackerValue` straight off useBle) - this module has no hooks of its
 * own, so the screen hands it in.
 *
 * The write only carries the request: the ESP32 answers on the TX
 * characteristic, so the reading itself lands in the useBleMessage handler,
 * not in the value returned here. Resolves true when the request was
 * acknowledged, false when there is no connection to take it.
 */
const getStepsFromESP32 = async (send) => {
  if (typeof send !== 'function') {
    console.warn('getSteps needs the BLE sender - nothing was requested.');
    return false;
  }

  try {
    const sent = await send(JSON.stringify({ type: 'fetch_dashbroad' }));

    if (!sent) {
      console.warn('Tracker not connected - step request skipped.');
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error requesting steps:', error);
    throw new Error(readableError(error, 'Could not fetch your step count.'));
  }
};

export { SaveBpm, SaveSteps, getStepsFromESP32, fetchStepsDB };
