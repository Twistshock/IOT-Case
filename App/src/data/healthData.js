import { colors } from '../constants/colors';

/**
 * The cards on the home screen, in display order.
 *
 * Everything here is presentation: `key` picks the matching field out of the
 * stats the tracker sends (see utils/trackerStats.js) and `format` turns that
 * number into the text on the card. `isValid` rejects readings the sketch has
 * not taken yet - it reports 0 bpm until a finger is on the sensor - so those
 * show PLACEHOLDER instead of a misleading zero.
 */
export const PLACEHOLDER = '--';

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
