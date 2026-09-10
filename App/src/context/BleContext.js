import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  getBleManager,
  getBleUnavailableReason,
  isBleAvailable,
  requestBlePermissions,
} from '../services/ble';
import {
  clearLastDevice,
  loadLastDevice,
  saveLastDevice,
} from '../services/lastDevice';
import {
  TRACKER_SERVICE_UUID,
  TRACKER_RX_CHARACTERISTIC_UUID,
  TRACKER_TX_CHARACTERISTIC_UUID,
  TRACKER_MTU,
  isTrackerDevice,
} from '../constants/ble';
import { encodeBase64, decodeBase64 } from '../utils/base64';

const SCAN_SECONDS = 10; // scanning stops on its own after this long
const MAX_MESSAGES = 50; // oldest entries are dropped past this

// How long the silent reconnect scan looks for the saved tracker before
// giving up, and how it spaces out the retries after an unexpected drop.
const RECONNECT_SCAN_SECONDS = 15;
// The adapter reports 'Unknown' for a moment after the app starts, so the
// automatic reconnect waits this long for it to settle before giving up.
const POWER_ON_WAIT_MS = 6000;
const RECONNECT_RETRY_MS = 2000;
const RECONNECT_MAX_TRIES = 3;

// Shown whenever anything is attempted without the native module present.
const NO_NATIVE_MODULE =
  'Bluetooth is not available in this build. Run "npx expo run:android" and open that app instead of Expo Go.';

const BleContext = createContext(null);

/**
 * Resolves true once the adapter is powered on, false if it is off (or the
 * wait runs out).
 *
 * Right after launch the state is still 'Unknown' for a moment, so reading it
 * once would make the automatic reconnect give up on a perfectly good radio.
 */
function waitForPoweredOn(manager, ms) {
  return new Promise((resolve) => {
    let settled = false;
    let subscription = null;
    let removed = false;

    const removeSubscription = () => {
      if (!subscription || removed) return;
      removed = true;
      subscription.remove();
    };

    const finish = (poweredOn) => {
      if (settled) return;
      settled = true;

      clearTimeout(timer);
      removeSubscription();
      resolve(poweredOn);
    };

    const timer = setTimeout(() => finish(false), ms);

    // `true` makes it report the current state first, so an already powered
    // on adapter resolves immediately.
    subscription = manager.onStateChange((state) => {
      if (state === 'PoweredOn') {
        finish(true);
      } else if (state !== 'Unknown' && state !== 'Resetting') {
        // PoweredOff, Unsupported or Unauthorized - waiting will not help.
        finish(false);
      }
    }, true);

    // The listener can already have fired before the handle came back.
    if (settled) removeSubscription();
  });
}

/**
 * Scans until the device with `id` shows up, or the timeout runs out.
 *
 * Used by the silent reconnect: a saved id can only be connected to directly
 * while the OS still has the device cached, so this is the fallback that
 * waits for the tracker to advertise again (after a reboot, or a long gap).
 */
function scanForDeviceId(manager, id, seconds) {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (device) => {
      if (settled) return;
      settled = true;

      clearTimeout(timer);

      try {
        manager.stopDeviceScan();
      } catch (e) {
        // Nothing to stop - safe to ignore.
      }

      resolve(device);
    };

    const timer = setTimeout(() => finish(null), seconds * 1000);

    manager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
      if (error) {
        finish(null);
        return;
      }

      if (device?.id === id) finish(device);
    });
  });
}

/**
 * Holds all Bluetooth state for the app.
 *
 * It lives above the tabs so a connection stays alive (and stays visible)
 * when the user switches between Home and Device.
 *
 * The tracker the user last connected to is remembered on disk, so the app
 * reconnects to it by itself on the next launch (and after an unexpected
 * drop) instead of asking for a scan every time. Disconnecting is an
 * explicit choice, so it also forgets the device.
 *
 * Every device and every message in here comes from real hardware. When the
 * native module is missing the provider reports an error and stays empty - it
 * never invents devices or readings.
 */
export function BleProvider({ children }) {
  const available = isBleAvailable();
  const unavailableReason = getBleUnavailableReason();

  const [devices, setDevices] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [connectingId, setConnectingId] = useState(null);
  const [error, setError] = useState(null);

  // The remembered tracker ({ id, name }) and whether a silent reconnect to
  // it is running right now.
  const [lastDevice, setLastDevice] = useState(null);
  const [isReconnecting, setIsReconnecting] = useState(false);

  // Value of the ESP32 characteristic, as text.
  const [trackerValue, setTrackerValue] = useState(null);
  const [isBusy, setIsBusy] = useState(false);

  // Everything sent to and received from the tracker, newest last.
  const [messages, setMessages] = useState([]);
  // True while a notification subscription is running on the characteristic.
  const [isSubscribed, setIsSubscribed] = useState(false);

  // Devices found during the current scan, keyed by id so duplicates merge.
  const foundRef = useRef(new Map());
  const timersRef = useRef([]);
  const messageIdRef = useRef(0);

  // Reconnect bookkeeping. Refs, not state, because the disconnect handler
  // and the retry timer read them outside of React's render cycle.
  const lastDeviceRef = useRef(null);
  const busyConnectingRef = useRef(false);
  const userDisconnectedRef = useRef(false);
  const retryTimerRef = useRef(null);
  const mountedRef = useRef(true);

  // Callbacks registered by screens that want every incoming message.
  const listenersRef = useRef(new Set());

  /**
   * Registers a callback for messages coming from the tracker.
   *
   * It is called as `listener(text, entry)` and returns a function that
   * removes it again. Prefer the `useBleMessage` hook, which does the
   * removing for you.
   */
  const addMessageListener = useCallback((listener) => {
    if (typeof listener !== 'function') return () => {};

    listenersRef.current.add(listener);

    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  /**
   * Appends one line to the message log.
   *
   * `kind` says how the text moved: 'write' (sent by us), 'notify' (pushed by
   * the device) or 'read' (pulled by us).
   */
  const addMessage = useCallback((direction, kind, text) => {
    messageIdRef.current += 1;

    const entry = {
      id: `msg-${messageIdRef.current}`,
      direction,
      kind,
      text,
      at: Date.now(),
    };

    setMessages((previous) => [...previous, entry].slice(-MAX_MESSAGES));

    // Only incoming traffic is interesting to the rest of the app, and one
    // broken listener must not stop the others.
    if (direction === 'in') {
      listenersRef.current.forEach((listener) => {
        try {
          listener(text, entry);
        } catch (e) {
          console.warn('BLE message listener failed:', e);
        }
      });
    }
  }, []);

  const clearMessages = useCallback(() => setMessages([]), []);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const addDevice = useCallback((item) => {
    const previous = foundRef.current.get(item.id);

    const merged = {
      ...previous,
      ...item,
      // A device does not always advertise its name in every packet.
      name: item.name || previous?.name || null,
      serviceUUIDs: item.serviceUUIDs ?? previous?.serviceUUIDs ?? null,
    };

    merged.isTracker = isTrackerDevice(merged);
    foundRef.current.set(item.id, merged);

    // Our ESP32 first, then the strongest signal (usually the closest device).
    const list = [...foundRef.current.values()].sort((a, b) => {
      if (a.isTracker !== b.isTracker) return a.isTracker ? -1 : 1;
      return (b.rssi ?? -999) - (a.rssi ?? -999);
    });

    setDevices(list);
  }, []);

  const stopScan = useCallback(() => {
    clearTimers();

    const manager = getBleManager();
    if (manager) {
      try {
        manager.stopDeviceScan();
      } catch (e) {
        // Nothing to stop - safe to ignore.
      }
    }

    setIsScanning(false);
  }, [clearTimers]);

  const startScan = useCallback(async () => {
    clearTimers();
    foundRef.current = new Map();
    setDevices([]);
    setError(null);

    if (!available) {
      setError(NO_NATIVE_MODULE);
      return;
    }

    const allowed = await requestBlePermissions();
    if (!allowed) {
      setError('Bluetooth permission was denied. Allow it in Settings to scan.');
      return;
    }

    const manager = getBleManager();

    try {
      const state = await manager.state();
      if (state !== 'PoweredOn') {
        setError('Bluetooth is off. Turn it on and try again.');
        return;
      }
    } catch (e) {
      setError(e?.message ?? 'Could not read the Bluetooth state.');
      return;
    }

    setIsScanning(true);

    // Scanning without a UUID filter so every nearby device is listed; the
    // ESP32 is recognised from its advertised service UUID and pinned on top.
    manager.startDeviceScan(
      null,
      { allowDuplicates: false },
      (scanError, device) => {
        if (scanError) {
          setError(scanError.message ?? 'Scanning failed.');
          stopScan();
          return;
        }

        if (!device) return;

        addDevice({
          id: device.id,
          name: device.name || device.localName || null,
          rssi: device.rssi,
          serviceUUIDs: device.serviceUUIDs,
        });
      }
    );

    timersRef.current.push(setTimeout(stopScan, SCAN_SECONDS * 1000));
  }, [available, addDevice, clearTimers, stopScan]);

  /**
   * Connects to one id and gets the link ready for use: MTU, service
   * discovery and the notification check.
   *
   * Returns the summary that goes into `connectedDevice`, and throws when the
   * connection itself fails - so the manual and the automatic path can each
   * report the failure their own way.
   */
  const openConnection = useCallback(async (id, fallbackName) => {
    const manager = getBleManager();

    // The OS can still be holding the link (an earlier run of the app, or
    // another app), and connecting again would fail with "already connected".
    let device = null;

    const alreadyConnected = await manager
      .isDeviceConnected(id)
      .catch(() => false);

    if (alreadyConnected) {
      const [known] = await manager.devices([id]).catch(() => []);
      device = known ?? null;
    }

    if (!device) {
      // requestMTU is honoured on Android; iOS negotiates the MTU itself
      // and ignores the option.
      device = await manager.connectToDevice(id, {
        timeout: 10000,
        requestMTU: TRACKER_MTU,
      });
    }

    // Some Android stacks ignore the connect-time option, so ask again
    // when the negotiated MTU came back smaller than requested. A refusal
    // is not fatal - it only means writes stay capped at the smaller size.
    if (device.mtu < TRACKER_MTU) {
      try {
        device = await device.requestMTU(TRACKER_MTU);
      } catch (e) {
        console.warn('[ble] MTU request failed:', e?.message ?? e);
      }
    }

    // Required before any characteristic can be read or written.
    await device.discoverAllServicesAndCharacteristics();

    const services = await device.services();
    const hasTrackerService = services.some(
      (service) => service.uuid?.toLowerCase() === TRACKER_SERVICE_UUID
    );

    // Notifications are used when the TX characteristic offers them, and
    // plain reads are the fallback.
    let canNotify = false;

    if (hasTrackerService) {
      try {
        const characteristics = await device.characteristicsForService(
          TRACKER_SERVICE_UUID
        );

        const tracker = characteristics.find(
          (characteristic) =>
            characteristic.uuid?.toLowerCase() ===
            TRACKER_TX_CHARACTERISTIC_UUID
        );

        canNotify = Boolean(tracker?.isNotifiable || tracker?.isIndicatable);
      } catch (e) {
        // Keep the connection: without notifications reading still works.
        canNotify = false;
      }
    }

    return {
      id: device.id,
      name: device.name || fallbackName || null,
      hasTrackerService,
      canNotify,
    };
  }, []);

  /** Remembers a device so the next launch can connect to it on its own. */
  const rememberDevice = useCallback((device) => {
    const saved = { id: device.id, name: device.name ?? null };

    lastDeviceRef.current = saved;
    setLastDevice(saved);
    saveLastDevice(saved);
  }, []);

  /** Forgets the saved device, so no more automatic reconnects happen. */
  const forgetDevice = useCallback(() => {
    lastDeviceRef.current = null;
    setLastDevice(null);
    clearLastDevice();
  }, []);

  const connect = useCallback(
    async (item) => {
      if (!available) {
        setError(NO_NATIVE_MODULE);
        return;
      }

      stopScan();
      setError(null);
      setTrackerValue(null);
      setMessages([]);
      setConnectingId(item.id);
      busyConnectingRef.current = true;
      userDisconnectedRef.current = false;

      try {
        const summary = await openConnection(item.id, item.name);

        setConnectedDevice(summary);
        rememberDevice(summary);
      } catch (e) {
        setError(e?.message ?? 'Could not connect to that device.');
      } finally {
        busyConnectingRef.current = false;
        setConnectingId(null);
      }
    },
    [available, stopScan, openConnection, rememberDevice]
  );

  /**
   * Connects to the remembered tracker without any user action.
   *
   * A direct connect is tried first - it is instant while the OS still has
   * the device cached - and a scan for the saved id is the fallback for when
   * the tracker has to be found again. Failure is silent: an unreachable
   * tracker is normal (switched off, out of range) rather than an error worth
   * a banner, and the manual scan is always still there.
   */
  const reconnectToSaved = useCallback(
    async (saved) => {
      if (!available || !saved?.id) return false;
      if (busyConnectingRef.current) return false;

      const allowed = await requestBlePermissions();
      if (!allowed) return false;

      const manager = getBleManager();

      const poweredOn = await waitForPoweredOn(manager, POWER_ON_WAIT_MS);
      if (!poweredOn) return false;

      busyConnectingRef.current = true;
      userDisconnectedRef.current = false;

      if (mountedRef.current) {
        setIsReconnecting(true);
        setConnectingId(saved.id);
      }

      try {
        let summary = null;

        try {
          summary = await openConnection(saved.id, saved.name);
        } catch (e) {
          // Not cached, or not advertising yet - wait for it to show up.
          const found = await scanForDeviceId(
            manager,
            saved.id,
            RECONNECT_SCAN_SECONDS
          );

          if (found) {
            summary = await openConnection(saved.id, found.name || saved.name);
          }
        }

        if (!summary) return false;
        if (!mountedRef.current) return true;

        setError(null);
        setTrackerValue(null);
        setMessages([]);
        setConnectedDevice(summary);
        rememberDevice(summary);

        return true;
      } catch (e) {
        console.warn('[ble] Automatic reconnect failed:', e?.message ?? e);
        return false;
      } finally {
        busyConnectingRef.current = false;

        if (mountedRef.current) {
          setIsReconnecting(false);
          setConnectingId(null);
        }
      }
    },
    [available, openConnection, rememberDevice]
  );

  /** Reconnects to the remembered tracker on demand (the Reconnect button). */
  const reconnect = useCallback(async () => {
    const saved = lastDeviceRef.current;
    if (!saved) return false;

    const connected = await reconnectToSaved(saved);

    if (!connected && mountedRef.current) {
      setError(
        `Could not reach ${
          saved.name ?? 'the saved device'
        }. Make sure it is on and nearby.`
      );
    }

    return connected;
  }, [reconnectToSaved]);

  const disconnect = useCallback(async () => {
    // An explicit disconnect also means "stop coming back to this device".
    userDisconnectedRef.current = true;
    clearTimeout(retryTimerRef.current);
    forgetDevice();

    if (!connectedDevice) return;

    try {
      await getBleManager().cancelDeviceConnection(connectedDevice.id);
    } catch (e) {
      // Already gone - treat it as disconnected anyway.
    } finally {
      setConnectedDevice(null);
      setTrackerValue(null);
      setIsSubscribed(false);
    }
  }, [connectedDevice, forgetDevice]);

  /** Reads the ESP32 characteristic (PROPERTY_READ in the sketch). */
  const readTrackerValue = useCallback(async () => {
    if (!connectedDevice) return;

    setError(null);
    setIsBusy(true);

    try {
      const characteristic = await getBleManager().readCharacteristicForDevice(
        connectedDevice.id,
        TRACKER_SERVICE_UUID,
        TRACKER_TX_CHARACTERISTIC_UUID
      );

      const text = decodeBase64(characteristic.value);

      setTrackerValue(text);
      addMessage('in', 'read', text);
    } catch (e) {
      setError(e?.message ?? 'Could not read from the device.');
    } finally {
      setIsBusy(false);
    }
  }, [connectedDevice, addMessage]);

  /**
   * Writes text to the tracker RX characteristic. BLEReceiveCallbacks::onWrite
   * in the sketch picks it up for BLEReadMessage() on the main loop.
   */
  const sendTrackerValue = useCallback(
    async (text) => {
      if (!connectedDevice || !text) return false;

      setError(null);
      setIsBusy(true);

      try {
        // PROPERTY_WRITE (not WRITE_NR), so the write is acknowledged.
        await getBleManager().writeCharacteristicWithResponseForDevice(
          connectedDevice.id,
          TRACKER_SERVICE_UUID,
          TRACKER_RX_CHARACTERISTIC_UUID,
          encodeBase64(text)
        );

        setTrackerValue(text);
        addMessage('out', 'write', text);
        return true;
      } catch (e) {
        setError(e?.message ?? 'Could not send to the device.');
        return false;
      } finally {
        setIsBusy(false);
      }
    },
    [connectedDevice, addMessage]
  );

  // The newest line that came from the tracker, or null when there is none.
  const lastMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].direction === 'in') return messages[i];
    }

    return null;
  }, [messages]);

  /**
   * Listens for values the tracker pushes on its own.
   *
   * react-native-ble-plx calls the callback again with a cancellation error
   * when the subscription is removed, so that one error is ignored.
   */
  useEffect(() => {
    if (!connectedDevice?.canNotify) return undefined;

    let cancelled = false;

    const subscription = getBleManager().monitorCharacteristicForDevice(
      connectedDevice.id,
      TRACKER_SERVICE_UUID,
      TRACKER_TX_CHARACTERISTIC_UUID,
      (monitorError, characteristic) => {
        if (monitorError) {
          if (!cancelled) {
            setIsSubscribed(false);
            setError(
              monitorError.message ?? 'Lost the notification subscription.'
            );
          }
          return;
        }

        if (!characteristic?.value) return;

        const text = decodeBase64(characteristic.value);

        setTrackerValue(text);
        addMessage('in', 'notify', text);
      }
    );

    setIsSubscribed(true);

    return () => {
      cancelled = true;
      subscription.remove();
      setIsSubscribed(false);
    };
  }, [connectedDevice, addMessage]);

  // Notice when the device drops the connection by itself (out of range,
  // battery) and quietly try to get it back. The saved device is only
  // forgotten when the user disconnects on purpose.
  useEffect(() => {
    if (!connectedDevice) return undefined;

    const droppedId = connectedDevice.id;

    const subscription = getBleManager().onDeviceDisconnected(droppedId, () => {
      setConnectedDevice(null);
      setTrackerValue(null);
      setIsSubscribed(false);

      if (userDisconnectedRef.current) return;

      const saved = lastDeviceRef.current;
      if (!saved || saved.id !== droppedId) return;

      let tries = 0;

      const retry = async () => {
        if (!mountedRef.current) return;
        if (userDisconnectedRef.current) return;
        if (lastDeviceRef.current?.id !== droppedId) return;

        tries += 1;

        const connected = await reconnectToSaved(saved);

        if (!connected && tries < RECONNECT_MAX_TRIES) {
          retryTimerRef.current = setTimeout(retry, RECONNECT_RETRY_MS);
        }
      };

      retryTimerRef.current = setTimeout(retry, RECONNECT_RETRY_MS);
    });

    return () => subscription.remove();
  }, [connectedDevice, reconnectToSaved]);

  // Load the remembered tracker at start-up and connect straight to it, so a
  // returning user lands on a live connection without touching anything.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const saved = await loadLastDevice();
      if (cancelled || !saved) return;

      lastDeviceRef.current = saved;
      setLastDevice(saved);

      if (available) reconnectToSaved(saved);
    })();

    return () => {
      cancelled = true;
    };
    // Runs once on mount: `available` and `reconnectToSaved` are stable for
    // the life of the provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Never leave a scan or a retry running after the app closes the provider.
  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      clearTimeout(retryTimerRef.current);
      stopScan();
    };
  }, [stopScan]);

  const value = useMemo(
    () => ({
      available,
      unavailableReason,
      devices,
      isScanning,
      connectedDevice,
      connectingId,
      error,
      trackerValue,
      isBusy,
      messages,
      lastMessage,
      isSubscribed,
      isConnected: Boolean(connectedDevice),
      lastDevice,
      isReconnecting,
      startScan,
      stopScan,
      connect,
      disconnect,
      reconnect,
      forgetDevice,
      readTrackerValue,
      sendTrackerValue,
      clearMessages,
      addMessageListener,
      // Short names for use outside the device screen.
      sendMessage: sendTrackerValue,
      readMessage: readTrackerValue,
    }),
    [
      available,
      unavailableReason,
      devices,
      isScanning,
      connectedDevice,
      connectingId,
      error,
      trackerValue,
      isBusy,
      messages,
      lastMessage,
      isSubscribed,
      lastDevice,
      isReconnecting,
      startScan,
      stopScan,
      connect,
      disconnect,
      reconnect,
      forgetDevice,
      readTrackerValue,
      sendTrackerValue,
      clearMessages,
      addMessageListener,
    ]
  );

  return <BleContext.Provider value={value}>{children}</BleContext.Provider>;
}

/** Read the Bluetooth state from any screen. */
export function useBle() {
  const context = useContext(BleContext);

  if (!context) {
    throw new Error('useBle must be used inside a <BleProvider>.');
  }

  return context;
}
