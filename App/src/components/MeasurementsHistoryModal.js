import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '../constants/colors';
import { getMeasurementsHistory } from '../services/dashbroad';

/**
 * Every reading stored for one day, newest first.
 *
 * The modal owns the day being looked at and the request for it: it opens on
 * today, and the arrows step one day back or forward. The caller only says
 * whether it is visible, so nothing is fetched while it is closed.
 *
 * Props:
 *  - visible  show or hide the modal
 *  - onClose  called when the user dismisses it
 */
export default function MeasurementsHistoryModal({ visible, onClose }) {
  const [day, setDay] = useState(startOfToday);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const isToday = sameDay(day, new Date());
  const summary = useMemo(() => summarise(rows), [rows]);

  // `quiet` reloads the same day under a pull-to-refresh instead of wiping the
  // list back to the spinner, so the rows stay put while the request runs.
  const load = useCallback(async (date, quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);

    setError('');

    try {
      const data = await getMeasurementsHistory(date);
      setRows(sortNewestFirst(data));
    } catch (e) {
      setRows([]);
      setError(e?.message || 'Could not load your measurements.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Always open on today, whatever day was left showing last time.
  useEffect(() => {
    if (!visible) return;

    const today = startOfToday();
    setDay(today);
    load(today);
  }, [visible, load]);

  const goToDay = (offset) => {
    const next = new Date(day);
    next.setDate(next.getDate() + offset);

    // There is nothing stored for tomorrow, so the forward arrow stops here.
    if (next > new Date()) return;

    setDay(next);
    load(next);
  };

  const jumpToToday = () => {
    const today = startOfToday();
    setDay(today);
    load(today);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        {/* The dimmed area is its own layer, so it can close the sheet without
            sitting between the list and the finger scrolling it. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close history"
        />

        <View style={styles.sheet}>
          <View style={styles.grabber} />

          <View style={styles.headerRow}>
            <View style={styles.iconCircle}>
              <Ionicons name="time-outline" size={20} color={colors.blue} />
            </View>

            <View style={styles.headerText}>
              <Text style={styles.title}>Measurement history</Text>
              <Text style={styles.subtitle}>
                {loading
                  ? 'Loading...'
                  : `${rows.length} ${rows.length === 1 ? 'reading' : 'readings'} this day`}
              </Text>
            </View>

            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close history"
              hitSlop={10}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
            >
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>

          <View style={styles.dayRow}>
            <Pressable
              onPress={() => goToDay(-1)}
              accessibilityRole="button"
              accessibilityLabel="Previous day"
              hitSlop={10}
              style={({ pressed }) => [styles.arrow, pressed && styles.pressed]}
            >
              <Ionicons name="chevron-back" size={18} color={colors.title} />
            </Pressable>

            <Pressable
              onPress={jumpToToday}
              disabled={isToday}
              accessibilityRole="button"
              accessibilityLabel="Jump to today"
              style={styles.dayLabelBox}
            >
              <Text style={styles.dayLabel}>{isToday ? 'Today' : dayLabel(day)}</Text>
              <Text style={styles.dayDate}>
                {isToday ? fullDate(day) : `${fullDate(day)} · tap for today`}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => goToDay(1)}
              disabled={isToday}
              accessibilityRole="button"
              accessibilityLabel="Next day"
              accessibilityState={{ disabled: isToday }}
              hitSlop={10}
              style={({ pressed }) => [
                styles.arrow,
                pressed && styles.pressed,
                isToday && styles.arrowDisabled,
              ]}
            >
              <Ionicons
                name="chevron-forward"
                size={18}
                color={isToday ? colors.muted : colors.title}
              />
            </Pressable>
          </View>

          {/* The day at a glance, above the reading-by-reading list. */}
          {!loading && !error && rows.length > 0 ? (
            <View style={styles.summaryRow}>
              <SummaryTile
                icon="heart"
                color={colors.pink}
                background={colors.pinkSoft}
                label="Avg BPM"
                value={summary.bpm == null ? null : String(Math.round(summary.bpm))}
              />
              <SummaryTile
                icon="water"
                color={colors.teal}
                background={colors.tealSoft}
                label="Avg SpO₂"
                value={summary.spo2 == null ? null : `${Math.round(summary.spo2)}%`}
              />
              <SummaryTile
                icon="thermometer"
                color={colors.orange}
                background={colors.orangeSoft}
                label="Avg temp"
                value={summary.temp == null ? null : `${summary.temp.toFixed(1)}°`}
              />
              <SummaryTile
                icon="footsteps"
                color={colors.blue}
                background={colors.blueSoft}
                label="Steps"
                value={
                  summary.steps == null ? null : Math.round(summary.steps).toLocaleString()
                }
              />
            </View>
          ) : null}

          <View style={styles.body}>
            {loading ? (
              <SkeletonList />
            ) : error ? (
              <View style={styles.state}>
                <View style={[styles.stateIcon, { backgroundColor: colors.dangerSoft }]}>
                  <Ionicons name="cloud-offline-outline" size={24} color={colors.danger} />
                </View>

                <Text style={styles.stateTitle}>Could not load this day</Text>
                <Text style={styles.stateText}>{error}</Text>

                <Pressable
                  onPress={() => load(day)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
                >
                  <Ionicons name="refresh" size={15} color={colors.card} />
                  <Text style={styles.retryText}>Try again</Text>
                </Pressable>
              </View>
            ) : (
              <FlatList
                data={rows}
                style={styles.list}
                keyExtractor={(item, index) => `${item?.captured_at ?? 'row'}-${index}`}
                renderItem={({ item, index }) => (
                  <MeasurementRow reading={item} isLast={index === rows.length - 1} />
                )}
                contentContainerStyle={
                  rows.length ? styles.listContent : styles.listEmpty
                }
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={() => load(day, true)}
                    tintColor={colors.blue}
                    colors={[colors.blue]}
                  />
                }
                ListEmptyComponent={
                  <View style={styles.state}>
                    <View style={[styles.stateIcon, { backgroundColor: colors.blueSoft }]}>
                      <Ionicons name="pulse-outline" size={24} color={colors.blue} />
                    </View>

                    <Text style={styles.stateTitle}>Nothing recorded</Text>
                    <Text style={styles.stateText}>
                      No measurements were stored on this day. Pull down to check again.
                    </Text>
                  </View>
                }
              />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** One number for the whole day, shown above the list. */
function SummaryTile({ icon, color, background, label, value }) {
  return (
    <View style={styles.summaryTile}>
      <View style={[styles.summaryIcon, { backgroundColor: background }]}>
        <Ionicons name={icon} size={14} color={color} />
      </View>

      <Text style={[styles.summaryValue, value == null && styles.summaryValueEmpty]}>
        {value ?? '--'}
      </Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

/** One stored reading: when it was taken, and whatever it managed to record. */
function MeasurementRow({ reading, isLast }) {
  const captured = new Date(reading?.captured_at);
  const validTime = !Number.isNaN(captured.getTime());
  const metrics = presentMetrics(reading);

  return (
    <View style={styles.row}>
      {/* Timeline rail: a dot per reading, joined down to the next one. */}
      <View style={styles.rail}>
        <View style={styles.dot} />
        {!isLast ? <View style={styles.railLine} /> : null}
      </View>

      <View style={styles.rowCard}>
        <View style={styles.rowHeader}>
          <Text style={styles.time}>{validTime ? clockTime(captured) : '--:--'}</Text>

          {/* The tracker stamps a reading itself only when its clock is set;
              the rest are dated on arrival, so say which one this is. */}
          {reading?.timestamp_estimated ? (
            <View style={styles.badge}>
              <Ionicons name="help-circle-outline" size={11} color={colors.muted} />
              <Text style={styles.badgeText}>approx. time</Text>
            </View>
          ) : null}
        </View>

        {metrics.length ? (
          <View style={styles.metrics}>
            {metrics.map((metric) => (
              <View
                key={metric.key}
                style={[styles.metric, { backgroundColor: metric.background }]}
              >
                <Ionicons name={metric.icon} size={13} color={metric.color} />
                <Text style={[styles.metricValue, { color: metric.color }]}>
                  {metric.text}
                </Text>
                <Text style={styles.metricUnit}>{metric.unit}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.metricEmpty}>No values recorded</Text>
        )}
      </View>
    </View>
  );
}

/** Grey placeholder cards while the day is being fetched. */
function SkeletonList() {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.9] });

  return (
    <View style={styles.listContent}>
      {[0, 1, 2, 3].map((index) => (
        <View key={index} style={styles.row}>
          <View style={styles.rail}>
            <View style={styles.dot} />
            {index < 3 ? <View style={styles.railLine} /> : null}
          </View>

          <Animated.View style={[styles.rowCard, { opacity }]}>
            <View style={styles.skeletonTime} />
            <View style={styles.metrics}>
              <View style={[styles.skeletonChip, { width: 84 }]} />
              <View style={[styles.skeletonChip, { width: 72 }]} />
            </View>
          </Animated.View>
        </View>
      ))}

      <View style={styles.skeletonFooter}>
        <ActivityIndicator color={colors.blue} />
      </View>
    </View>
  );
}

/** Only the metrics this reading actually carries, already formatted. */
function presentMetrics(reading) {
  return [
    {
      key: 'bpm',
      icon: 'heart',
      color: colors.pink,
      background: colors.pinkSoft,
      value: reading?.bpm,
      unit: 'BPM',
      format: (v) => String(Math.round(v)),
    },
    {
      key: 'spo2',
      icon: 'water',
      color: colors.teal,
      background: colors.tealSoft,
      value: reading?.spo2,
      unit: '%',
      format: (v) => String(Math.round(v)),
    },
    {
      key: 'temp',
      icon: 'thermometer',
      color: colors.orange,
      background: colors.orangeSoft,
      value: reading?.temperature_c,
      unit: '°C',
      format: (v) => v.toFixed(1),
    },
    {
      key: 'steps',
      icon: 'footsteps',
      color: colors.blue,
      background: colors.blueSoft,
      value: reading?.steps,
      unit: 'steps',
      format: (v) => Math.round(v).toLocaleString(),
    },
  ]
    .filter((m) => typeof m.value === 'number' && Number.isFinite(m.value))
    .map((m) => ({ ...m, text: m.format(m.value) }));
}

/**
 * The day in four numbers: the vitals averaged over the readings that carry
 * them, and steps as the highest count seen - the tracker sends a running
 * total, so the last one of the day is the day's total.
 */
function summarise(rows) {
  const collect = (key) =>
    rows
      .map((row) => row?.[key])
      .filter((value) => typeof value === 'number' && Number.isFinite(value));

  const average = (values) =>
    values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

  const steps = collect('steps');

  return {
    bpm: average(collect('bpm').filter((v) => v > 0)),
    spo2: average(collect('spo2').filter((v) => v > 0)),
    temp: average(collect('temperature_c').filter((v) => v > 0)),
    steps: steps.length ? Math.max(...steps) : null,
  };
}

/** Midnight today, so the day being shown never carries a time of its own. */
function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Newest first, with unreadable timestamps pushed to the bottom. */
function sortNewestFirst(data) {
  if (!Array.isArray(data)) return [];

  return [...data].sort((a, b) => {
    const left = new Date(a?.captured_at).getTime();
    const right = new Date(b?.captured_at).getTime();

    if (Number.isNaN(left)) return 1;
    if (Number.isNaN(right)) return -1;

    return right - left;
  });
}

function clockTime(date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${hours}:${minutes}`;
}

function dayLabel(date) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (sameDay(date, yesterday)) return 'Yesterday';

  return date.toLocaleDateString(undefined, { weekday: 'long' });
}

function fullDate(date) {
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(31, 41, 55, 0.45)',
  },
  sheet: {
    // A share of the screen rather than all of it, so the dimmed page behind
    // still reads as "this is a sheet over the summary".
    height: '86%',
    backgroundColor: colors.background,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 20,

    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 12,
  },
  grabber: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.title,
  },
  subtitle: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  pressed: {
    opacity: 0.6,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
    padding: 8,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  arrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  arrowDisabled: {
    opacity: 0.5,
  },
  dayLabelBox: {
    flex: 1,
    alignItems: 'center',
  },
  dayLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.title,
  },
  dayDate: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  summaryTile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.title,
  },
  summaryValueEmpty: {
    color: colors.muted,
  },
  summaryLabel: {
    fontSize: 10,
    color: colors.muted,
    marginTop: 2,
  },
  // The list gets whatever height is left under the header, which is what
  // lets it scroll instead of running off the bottom of the sheet.
  body: {
    flex: 1,
    marginTop: 12,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingTop: 4,
    paddingBottom: 24,
  },
  listEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  rail: {
    width: 12,
    alignItems: 'center',
    paddingTop: 18,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.blue,
  },
  railLine: {
    flex: 1,
    width: 2,
    borderRadius: 1,
    backgroundColor: colors.border,
    marginTop: 4,
  },
  rowCard: {
    flex: 1,
    marginBottom: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  time: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.title,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: colors.background,
  },
  badgeText: {
    fontSize: 10,
    color: colors.muted,
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  metricUnit: {
    fontSize: 11,
    color: colors.muted,
  },
  metricEmpty: {
    fontSize: 12,
    color: colors.muted,
  },
  skeletonTime: {
    width: 52,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.border,
    marginBottom: 12,
  },
  skeletonChip: {
    height: 26,
    borderRadius: 999,
    backgroundColor: colors.border,
  },
  skeletonFooter: {
    paddingTop: 8,
    alignItems: 'center',
  },
  state: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  stateIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  stateTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.title,
    marginBottom: 6,
  },
  stateText: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
    textAlign: 'center',
  },
  retry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: colors.blue,
  },
  retryText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.card,
  },
});
