import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useBleMessages } from '../hooks/useBleMessage';
import { parseTrackerStats } from '../utils/trackerStats';
import { SaveBpm } from '../services/dashbroad';

const TrackerContext = createContext(null);

export function TrackerProvider({ children }) {
  // Newest reading from the tracker, or null before the first one arrives.
  const [stats, setStats] = useState(null);

  const { isConnected, send, lastMessage, messages } = useBleMessages(
    (text) => {
      try{
        if (!isConnected) return;
        const parsed = parseTrackerStats(text);
        if(parsed && parsed.type === 'tracker_data') {
          console.log('Received save_steps_to_db message from tracker:', parsed);
        }
      }
      catch(error){
        console.error('Error parsing tracker stats:', error);
      }

    }
  );

  
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
