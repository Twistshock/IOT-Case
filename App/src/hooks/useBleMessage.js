import { useCallback, useEffect, useRef } from 'react';

import { useBle } from '../context/BleContext';

/**
 * Send and listen to tracker messages from anywhere in the app.
 *
 * Both hooks work on top of the single connection held by <BleProvider>, so
 * any screen can use them at the same time without stealing the connection
 * from the device screen. Nothing here throws when the tracker is missing:
 * sending returns false and no message ever arrives.
 *
 *   // listen
 *   useBleMessage((text) => console.log('from tracker:', text));
 *
 *   // send
 *   const { send, isConnected } = useBleSender();
 *   await send('vibrate');
 */

/**
 * Runs `handler(text, entry)` for every message coming from the tracker.
 *
 * The newest handler is always used, so it can close over fresh state and
 * still be written inline - no useCallback needed. Pass `enabled: false` to
 * pause listening (for example while a screen is hidden).
 */
export function useBleMessage(handler, { enabled = true } = {}) {
  const { addMessageListener } = useBle();

  // Kept in a ref so a new inline handler does not re-subscribe every render.
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return undefined;

    return addMessageListener((text, entry) => {
      handlerRef.current?.(text, entry);
    });
  }, [addMessageListener, enabled]);
}

/**
 * Everything needed to send to the tracker.
 *
 * `send(text)` resolves to true when the write was acknowledged, and to
 * false when there is no connection or the write failed (the reason is in
 * `error`). `isBusy` is true while a read or write is in flight.
 */
export function useBleSender() {
  const {
    sendTrackerValue,
    readTrackerValue,
    isConnected,
    isBusy,
    error,
  } = useBle();

  const send = useCallback(
    (text) => {
      const trimmed = typeof text === 'string' ? text.trim() : '';
      if (!trimmed) return Promise.resolve(false);

      return sendTrackerValue(trimmed);
    },
    [sendTrackerValue]
  );

  return { send, read: readTrackerValue, isConnected, isBusy, error };
}

/**
 * Both halves at once, plus the state most screens want to show.
 *
 * `lastMessage` is the newest entry received ({ text, kind, at }), and
 * `messages` is the whole log, oldest first.
 */
export function useBleMessages(handler, options) {
  const {
    messages,
    lastMessage,
    isSubscribed,
    isConnected,
    clearMessages,
  } = useBle();

  useBleMessage(handler, options);

  const sender = useBleSender();

  return {
    ...sender,
    messages,
    lastMessage,
    isSubscribed,
    isConnected,
    clearMessages,
  };
}
