import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '../constants/colors';
import { ACTIVITY_METRICS } from '../data/weeklyActivity';

const CHART_HEIGHT = 132; // tallest a bar can grow
const BAR_WIDTH = 14;
// Day labels sit under the bars, inside the same box the goal line is placed
// in, so the line has to clear them to line up with the foot of the bars.
const AXIS_HEIGHT = 22;

/**
 * The week under the health cards: one bar per day, either steps or calories.
 *
 * The card only draws what it is handed. `days` is a Monday-to-Sunday list -
 * see data/weeklyActivity.js for the shape - where a day that has no reading
 * yet carries `null` instead of 0, so the rest of the week is not flattened by
 * days that simply have not happened.
 *
 * Tapping a bar picks that day and the summary switches to it; tapping it
 * again goes back to the weekly total.
 *
 * Props:
 *  - days     the seven days to draw
 *  - width    card width in pixels (calculated by the screen)
 *  - loading  true while the week is still being fetched
 *  - error    a message to show instead of the chart, if the fetch failed
 *  - index    position on the screen, used to stagger the entrance
 */
export default function WeeklyActivityCard({
  days = [],
  width,
  loading = false,
  error = null,
  index = 0,
}) {
  const [metricId, setMetricId] = useState(ACTIVITY_METRICS[0].id);
  const [selectedId, setSelectedId] = useState(null);

  const metric = useMemo(
    () => ACTIVITY_METRICS.find((item) => item.id === metricId) ?? ACTIVITY_METRICS[0],
    [metricId]
  );

  // Everything the header and the bars need, recomputed when the week or the
  // chosen metric changes.
  const summary = useMemo(() => {
    const values = days
      .map((day) => day?.[metric.key])
      .filter((value) => typeof value === 'number' && Number.isFinite(value));

    const total = values.reduce((sum, value) => sum + value, 0);

    return {
      total,
      // Average over the days that actually reported, not over a flat seven.
      average: values.length ? total / values.length : 0,
      best: values.length ? Math.max(...values) : 0,
      hasData: values.length > 0,
      // The goal stays in the scale so its line is always somewhere on screen.
      scale: Math.max(metric.goal, ...values, 1),
    };
  }, [days, metric]);

  const selected = days.find((day) => day.id === selectedId) ?? null;
  const selectedValue = selected?.[metric.key];
  const showSelected = typeof selectedValue === 'number';

  // Entrance: the card slides up under the health cards.
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 420,
      delay: index * 90,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enter, index]);

  const translateY = enter.interpolate({
    inputRange: [0, 1],
    outputRange: [18, 0],
  });

  const goalRatio = Math.min(metric.goal / summary.scale, 1);

  return (
    <Animated.View
      style={[styles.card, { width, opacity: enter, transform: [{ translateY }] }]}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>This Week</Text>
          <Text style={styles.subtitle}>
            {showSelected
              ? dayName(selected)
              : summary.hasData
                ? `Daily average ${metric.format(summary.average)} ${metric.unit}`
                : 'No activity recorded yet'}
          </Text>
        </View>

        <View style={styles.toggle}>
          {ACTIVITY_METRICS.map((item) => {
            const active = item.id === metric.id;

            return (
              <Pressable
                key={item.id}
                onPress={() => setMetricId(item.id)}
                style={[
                  styles.toggleButton,
                  active && { backgroundColor: item.background },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Show ${item.title.toLowerCase()}`}
              >
                <Ionicons
                  name={item.icon}
                  size={15}
                  color={active ? item.color : colors.muted}
                />
                <Text
                  style={[styles.toggleLabel, active && { color: item.color }]}
                >
                  {item.title}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.valueRow}>
        <Text style={styles.value}>
          {showSelected
            ? metric.format(selectedValue)
            : summary.hasData
              ? metric.format(summary.total)
              : '--'}
        </Text>
        <Text style={styles.unit}>{metric.unit}</Text>

        {!showSelected && summary.hasData && (
          <View style={styles.totalTag}>
            <Text style={styles.totalTagText}>7-day total</Text>
          </View>
        )}
      </View>

      {error ? (
        <Text style={styles.message}>{error}</Text>
      ) : loading ? (
        <Text style={styles.message}>Loading your week...</Text>
      ) : (
        <>
          <View style={styles.chart}>
            {/* Where the daily goal sits, so a bar can be read at a glance. */}
            <View
              pointerEvents="none"
              style={[
                styles.goalLine,
                { bottom: AXIS_HEIGHT + CHART_HEIGHT * goalRatio },
              ]}
            />

            {days.map((day, position) => (
              <Bar
                key={day.id}
                day={day}
                value={day[metric.key]}
                scale={summary.scale}
                color={metric.color}
                background={metric.background}
                label={
                  typeof day[metric.key] === 'number'
                    ? metric.short(day[metric.key])
                    : ''
                }
                delay={position * 60}
                selected={day.id === selectedId}
                onPress={() =>
                  setSelectedId((current) => (current === day.id ? null : day.id))
                }
              />
            ))}
          </View>

          <View style={styles.footer}>
            <View style={styles.footerItem}>
              <View style={[styles.dot, { backgroundColor: metric.color }]} />
              <Text style={styles.footerText}>
                Best day {summary.hasData ? metric.format(summary.best) : '--'}
              </Text>
            </View>

            <Text style={styles.footerText}>
              Goal {metric.format(metric.goal)} {metric.unit}/day
            </Text>
          </View>
        </>
      )}
    </Animated.View>
  );
}

/**
 * One day's bar. Kept separate so each bar owns the Animated.Value that grows
 * it - heights cannot run on the native driver, so this is a layout animation.
 */
function Bar({
  day,
  value,
  scale,
  color,
  background,
  label,
  delay,
  selected,
  onPress,
}) {
  const hasValue = typeof value === 'number' && Number.isFinite(value);
  const target = hasValue ? Math.max((value / scale) * CHART_HEIGHT, 4) : 0;

  const grow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(grow, {
      toValue: target,
      duration: 520,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [delay, grow, target]);

  return (
    <Pressable
      style={styles.column}
      onPress={hasValue ? onPress : undefined}
      accessibilityRole={hasValue ? 'button' : undefined}
      accessibilityLabel={hasValue ? `${day.label}: ${label}` : `${day.label}: no data`}
    >
      <Text style={[styles.barLabel, selected && { color, fontWeight: '700' }]}>
        {label}
      </Text>

      <View style={styles.track}>
        <Animated.View
          style={[
            styles.bar,
            {
              height: grow,
              backgroundColor: selected ? color : background,
              borderColor: color,
              // The selected bar is filled; the rest are pale with an outline,
              // so one day can be singled out without hiding the others.
              borderWidth: hasValue && !selected ? 1 : 0,
            },
          ]}
        />
      </View>

      <Text
        style={[
          styles.dayLabel,
          day.isToday && styles.dayLabelToday,
          selected && { color },
        ]}
      >
        {day.label}
      </Text>
    </Pressable>
  );
}

/** "Today" for the current day, otherwise "Monday 1 Sep" style text. */
function dayName(day) {
  if (day.isToday) return 'Today';

  const date = new Date(day.date);
  if (Number.isNaN(date.getTime())) return day.label;

  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,

    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  headerText: {
    flexShrink: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.title,
  },
  subtitle: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  toggle: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 3,
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  toggleLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    marginLeft: 5,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  value: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.title,
  },
  unit: {
    fontSize: 13,
    color: colors.muted,
    marginLeft: 6,
    marginBottom: 4,
  },
  totalTag: {
    marginLeft: 10,
    marginBottom: 5,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: colors.background,
  },
  totalTagText: {
    fontSize: 11,
    color: colors.muted,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  goalLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    // A hairline is enough; the dashed look comes from the border style.
    height: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  column: {
    flex: 1,
    alignItems: 'center',
  },
  barLabel: {
    fontSize: 10,
    color: colors.muted,
    marginBottom: 4,
    height: 13,
  },
  track: {
    height: CHART_HEIGHT,
    justifyContent: 'flex-end',
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: BAR_WIDTH / 2,
  },
  dayLabel: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 8,
  },
  dayLabelToday: {
    color: colors.title,
    fontWeight: '700',
  },
  message: {
    fontSize: 13,
    color: colors.muted,
    paddingVertical: 24,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  footerText: {
    fontSize: 12,
    color: colors.muted,
  },
});
