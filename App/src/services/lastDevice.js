import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Remembers the tracker the user last connected to, so the app can come back
 * to it on its own instead of asking for a scan every launch.
 *
 * Only the id and the name are stored. The id is what
 * `connectToDevice` needs: a MAC address on Android, a per-app peripheral
 * UUID on iOS. Both stay stable for the same phone/tracker pair, so a saved
 * id keeps working across restarts.
 */

const STORAGE_KEY = 'ble.lastDevice';

/** The saved `{ id, name }`, or null when nothing was saved (or it is broken). */
export async function loadLastDevice() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const saved = JSON.parse(raw);
    if (!saved?.id) return null;

    return { id: saved.id, name: saved.name ?? null };
  } catch (error) {
    // Corrupt or unreadable storage must never stop the app from starting.
    console.warn('[ble] Could not read the saved device:', error);
    return null;
  }
}

/** Stores the device to reconnect to next time. */
export async function saveLastDevice(device) {
  if (!device?.id) return;

  try {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ id: device.id, name: device.name ?? null })
    );
  } catch (error) {
    console.warn('[ble] Could not save the device:', error);
  }
}

/** Forgets the saved device, so the app stops reconnecting to it. */
export async function clearLastDevice() {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('[ble] Could not clear the saved device:', error);
  }
}
