import { colors } from '../constants/colors';

/**
 * The weekly activity chart on the home screen.
 *
 * Same idea as healthData.js: everything here is presentation. A metric knows
 * which field to read off a day (`key`), how to write it out in full (`format`)
 * and how to squeeze it into a bar label (`short`).
 *
 * The days themselves come from the backend once that endpoint exists - until
 * then `fakeWeeklyActivity()` builds a week that looks like a real one, so the
 * chart can be styled and reviewed before any API work lands.
 */

export const WEEK_DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const ACTIVITY_METRICS = [
  {
    id: 'steps',
    key: 'steps',
    title: 'Steps',
    unit: 'steps',
    icon: 'footsteps',
    color: colors.blue,
    background: colors.blueSoft,
    goal: 10000,
    format: (value) => Math.round(value).toLocaleString(),
    short: (value) =>
      value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(Math.round(value)),
  },
  {
    id: 'kcal',
    key: 'kcal',
    title: 'Calories',
    unit: 'kcal',
    icon: 'flame',
    color: colors.orange,
    background: colors.orangeSoft,
    goal: 500,
    format: (value) => Math.round(value).toLocaleString(),
    short: (value) => String(Math.round(value)),
  },
];

/** "Mon" for the day `date` falls on. getDay() is 0 for Sunday, not Monday. */
function weekdayLabel(date) {
  return WEEK_DAY_LABELS[(date.getDay() + 6) % 7];
}

/** "2026-09-07" - the same shape the steps endpoint already takes. */
function isoDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

// Numbers that read like a plausible week: a quiet Saturday, a long Sunday walk.
const SAMPLE_STEPS = [6420, 9040, 7530, 11230, 8410, 4980, 12010];

/**
 * Seven days of placeholder activity, oldest first and ending on today.
 *
 * A rolling window rather than a calendar week, so the chart is always full -
 * a Monday morning would otherwise leave six empty slots.
 *
 * Swap this out for the real API response; the shape is what the card reads:
 *
 *   [{ id, label, date, steps, kcal, isToday }, ...]
 *
 * A day the backend has no reading for should come through as `null`, not 0:
 * the card draws those as empty slots and leaves them out of the average,
 * instead of pretending you walked nowhere.
 */
export function fakeWeeklyActivity(reference = new Date()) {
  const today = new Date(reference);
  today.setHours(0, 0, 0, 0);

  return SAMPLE_STEPS.map((steps, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (SAMPLE_STEPS.length - 1 - index));

    return {
      id: isoDate(date),
      label: weekdayLabel(date),
      date: isoDate(date),
      steps,
      // Roughly 0.04 kcal per step for an average adult - close enough for a
      // placeholder, and it keeps the two bars in step with each other.
      kcal: Math.round(steps * 0.04),
      isToday: index === SAMPLE_STEPS.length - 1,
    };
  });
}
