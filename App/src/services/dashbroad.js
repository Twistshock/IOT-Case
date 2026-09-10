import { DASHBOARD_ENDPOINTS } from '../constants/api';
import { apiClient } from './httpClient';

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
async function SaveStepGoal(goal, date, steps) {
  const payload = {
    goal,
    date,
    steps,
  };

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

// get steps from database, for the current day. The tracker may not be connected, so this is the fallback.

const getStepsFromDB = async () => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const data = await apiClient.get(DASHBOARD_ENDPOINTS.steps, {
      params: {
        from: today,
        to: today,
      },
    });

    if(data?.status !== 200){
      throw new Error('Server did not return a valid response for steps.');
    }
    return data?.data;
  } catch (error) {
    console.error('Error fetching steps from DB:', error);

    throw new Error(
      readableError(error, 'Could not fetch your step count.')
    );
  }
};



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


const fetchMeasurementsDB = async (payload) => {
  try{
    const { data } = await apiClient.post(DASHBOARD_ENDPOINTS.measurements, payload);
    return data;
  }
  catch(error){
    console.error('Error fetching measurements from DB:', error);
    throw new Error(readableError(error, 'Could not fetch your measurements.'));
  }
}

const getMeasurementsDB = async (date = new Date(), limit = 1) => {
  try {
    const day = date.toISOString().split('T')[0];

    const data = await apiClient.get(
      DASHBOARD_ENDPOINTS.getMeasurements,
      {
        params: {
          from: `${day}T00:00:00Z`,
          to: `${day}T23:59:59Z`,
          limit: limit,
        },
      }
    );

    if(data?.status !== 200){
      throw new Error('Server did not return a valid response for measurements.');
    }
    return data?.data;
  } catch (error) {
    console.error('Error fetching measurements from DB:', error);

    throw new Error(
      readableError(error, 'Could not fetch your measurements.')
    );
  }
};

/**
 * Every reading stored for one calendar day, newest first.
 *
 * The day is taken from the phone's clock, so "today" is the user's today and
 * not UTC's; the two boundaries are sent as instants because that is what the
 * backend filters on. Returns [] when the day has nothing in it.
 */
const getMeasurementsHistory = async (date = new Date(), limit = 200) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);

  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  try {
    const { data } = await apiClient.get(DASHBOARD_ENDPOINTS.getMeasurements, {
      params: {
        from: start.toISOString(),
        to: end.toISOString(),
        limit,
      },
    });

    // The endpoint answers with the plain list; tolerate a wrapped one too.
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.items)) return data.items;

    return [];
  } catch (error) {
    console.error(
      'Error fetching measurement history:',
      error?.response?.status,
      JSON.stringify(error?.response?.data)
    );

    throw new Error(readableError(error, 'Could not load your measurements.'));
  }
};


export { SaveBpm, SaveStepGoal, getStepsFromDB, getStepsFromESP32, fetchStepsDB, fetchMeasurementsDB, getMeasurementsDB, getMeasurementsHistory };
