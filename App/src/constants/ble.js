/**
 * These values must stay in sync with the ESP32 sketch (firmware/main/ble.h).
 *
 *   BLEDevice::init("Fitness Tracker V1.0");
 *   #define SERVICE_UUID            "12345678-1234-1234-1234-1234567890ab"
 *   #define CHARACTERISTIC_RX_UUID  "abcdefab-1234-1234-1234-abcdefabcdef"
 *   #define CHARACTERISTIC_TX_UUID  "abcdefab-1234-1234-1234-abcdefabcdf0"
 *
 * The tracker uses two characteristics, one per direction, so each can carry
 * the properties it needs: RX is write-only, TX is read + notify.
 */
export const TRACKER_NAME = 'Fitness Tracker V1.0';

/**
 * ATT MTU asked for right after connecting, matching the sketch's
 * BLEDevice::setMTU(185). 185 bytes of MTU leaves 182 for the payload
 * (3 go to the ATT header), instead of the 20 the default MTU of 23 allows.
 *
 * The peripheral is free to answer with something smaller, so the negotiated
 * value is what actually applies - this is a request, not a guarantee.
 */
export const TRACKER_MTU = 185;

// react-native-ble-plx always reports UUIDs in lower case, so store them that way.
export const TRACKER_SERVICE_UUID = '12345678-1234-1234-1234-1234567890ab';

// Phone -> tracker: everything the app sends goes here (PROPERTY_WRITE).
export const TRACKER_RX_CHARACTERISTIC_UUID =
  'abcdefab-1234-1234-1234-abcdefabcdef';

// Tracker -> phone: reads and notifications come from here (READ | NOTIFY).
export const TRACKER_TX_CHARACTERISTIC_UUID =
  'abcdefab-1234-1234-1234-abcdefabcdf0';

/**
 * True when an advertising packet looks like our ESP32.
 *
 * The sketch calls advertising->addServiceUUID(SERVICE_UUID), so the service
 * UUID is the reliable check; the name is a fallback for the moment before
 * the scan record is fully parsed.
 */
export function isTrackerDevice({ name, serviceUUIDs }) {
  if (name && name.trim() === TRACKER_NAME) return true;

  if (!Array.isArray(serviceUUIDs)) return false;

  return serviceUUIDs.some(
    (uuid) => uuid?.toLowerCase() === TRACKER_SERVICE_UUID
  );
}
