import { Platform, PermissionsAndroid } from 'react-native';

/**
 * Thin wrapper around react-native-ble-plx.
 *
 * The library needs native code, so it only works in a development build
 * (or a real release build) - never in Expo Go. Everything here is written
 * so the app keeps running when the native module is missing: the manager
 * is created lazily inside a try/catch and `isBleAvailable()` tells the UI
 * whether real scanning is possible.
 */

let manager = null;
let available = null; // null = not checked yet, true/false = checked
let unavailableReason = null; // the real error, kept so the UI can show it

/** Returns the shared BleManager, or null when BLE is not available. */
export function getBleManager() {
  if (available !== null) return manager;

  try {
    const { BleManager } = require('react-native-ble-plx');
    manager = new BleManager();
    available = true;
    unavailableReason = null;
  } catch (error) {
    // Expo Go, web, or a build without the native module. Keep the real
    // message around - "no native module" hides permission and setup errors
    // that look identical from the outside.
    manager = null;
    available = false;
    unavailableReason = error?.message ?? String(error);
    console.warn('[ble] BleManager could not start:', error);
  }

  return manager;
}

/** True when real Bluetooth scanning can be used on this build. */
export function isBleAvailable() {
  getBleManager();
  return available === true;
}

/** The error that stopped BLE from starting, or null when it started fine. */
export function getBleUnavailableReason() {
  getBleManager();
  return unavailableReason;
}

/**
 * Asks for the runtime permissions Android needs before scanning.
 * iOS asks automatically (using the strings in app.json), so it just returns true.
 */
export async function requestBlePermissions() {
  if (Platform.OS !== 'android') return true;

  // Android 12 (API 31) replaced the location permission with two BLE ones.
  if (Number(Platform.Version) >= 31) {
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);

    return Object.values(result).every(
      (status) => status === PermissionsAndroid.RESULTS.GRANTED
    );
  }

  const status = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    {
      title: 'Location permission',
      message: 'Android needs location access to find nearby Bluetooth devices.',
      buttonPositive: 'Allow',
    }
  );

  return status === PermissionsAndroid.RESULTS.GRANTED;
}
