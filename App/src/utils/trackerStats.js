/**
 * Turns one line from the tracker into a stats object.
 *
 * The sketch sends JSON once a second (see BLESendStats in main.ino):
 *
 *   {"steps":8432,"kcal":337.3,"bpm":78,"spo2":98,"temp":36.6}
 *
 * Anything else - an ack, a log line, a truncated packet - returns null, so a
 * stray message can never blank out the cards or crash the screen.
 */
export function parseTrackerStats(text) {
  if (typeof text !== 'string') return null;

  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return null;

  let payload;

  try {
    payload = JSON.parse(trimmed);
  } catch (e) {
    return null;
  }

  if (!payload || typeof payload !== 'object') return null;

  const stats = {
    steps: toNumber(payload.steps),
    kcal: toNumber(payload.kcal),
    bpm: toNumber(payload.bpm),
    spo2: toNumber(payload.spo2),
    temp: toNumber(payload.temp),
    type: payload.type == undefined ? null : String(payload.type),
  };

  // A packet with no usable field at all is not worth showing.
  const hasValue = Object.values(stats).some((value) => value !== null);

  return hasValue ? stats : null;
}

/** Numbers only; missing or malformed fields become null. */
function toNumber(value) {
  const number = typeof value === 'string' ? Number(value) : value;

  return typeof number === 'number' && Number.isFinite(number) ? number : null;
}
