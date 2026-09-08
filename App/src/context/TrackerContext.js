import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useBleMessages } from '../hooks/useBleMessage';
import { fetchMeasurementsDB } from '../services/dashbroad';
import { UserContext } from '../context/userContext';

const TrackerContext = createContext(null);

export function TrackerProvider({ children }) {
  // Newest reading from the tracker, or null before the first one arrives.
  const [stats, setStats] = useState(null);
  const { user } = useContext(UserContext);

  const { isConnected, send, lastMessage, messages } = useBleMessages(
    (text) => {
      try{
        if (!isConnected) return;
        const data = JSON.parse(text);
        if(data.type === 'tracker_data'){
          setStats(data.data);
          handleSaveTrackerStats(data.data);
          return;
        }

        if(data.type === 'tracker_logs'){
          handleSaveTrackerStats(data.data);
          return;
        }
      }
      catch(error){
        console.error('Error parsing tracker stats:', error);
      }

    }
  );

  const handleSaveTrackerStats = async (data) => {
    if (!Array.isArray(data) || data.length === 0) return;

    const payload = {
      measurements: data.map((item, index) => ({
        tracker_id: 'a1b2c3d4e5f622',
        sequence: index + 1,
        captured_at: item.updated_at,
        timestamp_estimated: false,
        step_delta: 1,
        steps: Number(item.steps) ?? 0,
        bpm: Number(item.bpm) ?? 0,
        spo2: Number(item.spo2) ?? 0,
        temperature_c: Number(item.temperature) ?? 0,
      })),
    };
    

    console.log('Saving tracker data to DB:', payload);
    const save = await fetchMeasurementsDB(payload);
    if(save?.ok){
      console.log('Tracker data saved successfully.');
    }
  }

  
  const value = useMemo(
    () => ({ stats, isConnected, send, lastMessage, messages }),
    [stats, isConnected, send, lastMessage, messages]
  );

  return (
    <TrackerContext.Provider value={value}>{children}</TrackerContext.Provider>
  );
}

/** Read the newest tracker reading from any screen. */
export function useTracker() {
  const context = useContext(TrackerContext);

  if (!context) {
    throw new Error('useTracker must be used inside a <TrackerProvider>.');
  }

  return context;
}
