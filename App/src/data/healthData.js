import { colors } from '../constants/colors';

/**
 * The cards on the home screen, in display order.
 *
 * Everything here is presentation: `key` picks the matching field out of the
 * stats the tracker sends (see utils/trackerStats.js) and `format` turns that
 * number into the text on the card. `isValid` rejects readings the sketch has
 * not taken yet - it reports 0 bpm until a finger is on the sensor - so those
 * show PLACEHOLDER instead of a misleading zero.
 *
 * `getAlert` marks a reading that is outside the safe range. It is only asked
 * about values that already passed `isValid`, so a missing reading never
 * raises an alarm. It returns { level, message } or null when all is well.
 */
export const PLACEHOLDER = '--';

// The same limits the firmware uses, so the app and the device agree.
export const HEART_RATE_TOO_LOW = 40;
export const HEART_RATE_TOO_HIGH = 140;
export const SPO2_TOO_LOW = 95;

// 'danger' paints the card red, 'warning' paints it amber.
export const ALERT_DANGER = 'danger';
export const ALERT_WARNING = 'warning';

export const healthData = [
  {
    id: 'steps',
    key: 'steps',
    title: 'Steps',
    unit: 'steps',
    icon: 'footsteps',
    color: colors.blue,
    background: colors.blueSoft,
    format: (value) => Math.round(value).toLocaleString(),
    isValid: (value) => value >= 0,
  },
  {
    id: 'heartRate',
    key: 'bpm',
    title: 'Heart Rate',
    unit: 'BPM',
    icon: 'heart',
    color: colors.pink,
    background: colors.pinkSoft,
    format: (value) => String(Math.round(value)),
    isValid: (value) => value > 0,
    getAlert: (value) => {
      if (value < HEART_RATE_TOO_LOW) {
        return {
          level: ALERT_DANGER,
          message: `Heart rate is very low (under ${HEART_RATE_TOO_LOW} BPM)`,
        };
      }
      if (value > HEART_RATE_TOO_HIGH) {
        return {
          level: ALERT_DANGER,
          message: `Heart rate is very high (over ${HEART_RATE_TOO_HIGH} BPM)`,
        };
      }
      return null;
    },
  },
  {
    id: 'spo2',
    key: 'spo2',
    title: 'Blood Oxygen',
    unit: '% SpO\u2082',
    icon: 'water',
    color: colors.teal,
    background: colors.tealSoft,
    format: (value) => String(Math.round(value)),
    isValid: (value) => value > 0,
    getAlert: (value) =>
      value < SPO2_TOO_LOW
        ? {
            level: ALERT_WARNING,
            message: `Blood oxygen is below ${SPO2_TOO_LOW}%`,
          }
        : null,
  },
  {
    id: 'temperature',
    key: 'temp',
    title: 'Temperature',
    unit: '\u00B0C',
    icon: 'thermometer',
    color: colors.orange,
    background: colors.orangeSoft,
    format: (value) => value.toFixed(1),
    isValid: (value) => value > 0,
  },
];
