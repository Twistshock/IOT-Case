import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '../constants/colors';

/**
 * Today's step goal, and how much of it is still left.
 *
 * The card is pure presentation: it is handed the live step count and the goal
 * the user picked, works out the share of the goal that is done and draws the
 * rest as the empty part of the bar. Tapping "Edit" hands control back to the
 * screen, which owns the modal that changes the goal.
 *
 * The bar is drawn with a plain View scaled on the X axis rather than an
 * animated width, so it can ride the native driver like the other cards.
 *
 * Props:
 *  - steps       steps walked so far today
 *  - goal        the goal for today; 0 or missing means "not set yet"
 *  - width       card width in pixels (calculated by the screen)
 *  - onEditGoal  called when the user taps the goal to change it
 *  - index       position on the screen, used to stagger the entrance
 */
export default function StepGoalCard({
  steps = 0,
  goal = 0,
  width,
  onEditGoal,
  index = 0,
}) {
  const hasGoal = Number.isFinite(goal) && goal > 0;
  const walked = Number.isFinite(steps) && steps > 0 ? Math.round(steps) : 0;

  // Share of the goal that is done. Kept unclamped for the label - walking
  // 120% of the goal is worth showing - but clamped for the bar itself.
  const percentDone = hasGoal ? (walked / goal) * 100 : 0;
  const percentLeft = Math.max(0, 100 - percentDone);
  const stepsLeft = hasGoal ? Math.max(0, goal - walked) : 0;
  const reached = hasGoal && walked >= goal;

  const accent = reached ? colors.green : colors.blue;
  const accentSoft = reached ? colors.greenSoft : colors.blueSoft;

  // Entrance: 0 -> 1 once, just after mount.
  const enter = useRef(new Animated.Value(0)).current;
  // How full the bar is, 0 -> 1, animated on every new reading.
  const fill = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 420,
      delay: index * 90,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enter, index]);

  useEffect(() => {
    Animated.timing(fill, {
      toValue: Math.min(1, Math.max(0, percentDone / 100)),
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [fill, percentDone]);

  const translateY = enter.interpolate({
    inputRange: [0, 1],
    outputRange: [18, 0],
  });

  // A bar scaled to exactly 0 disappears; leave a sliver so the rounded cap
  // still hints where the progress starts.
  const scaleX = fill.interpolate({
    inputRange: [0, 1],
    outputRange: [0.001, 1],
  });

  return (
    <Animated.View
      style={[styles.card, { width, opacity: enter, transform: [{ translateY }] }]}
    >
      <View style={styles.headerRow}>
        <View style={[styles.iconCircle, { backgroundColor: accentSoft }]}>
          <Ionicons name="footsteps" size={20} color={accent} />
        </View>

        <View style={styles.headerText}>
          <Text style={styles.title}>Today's step goal</Text>
          <Text style={styles.subtitle}>
            {hasGoal ? `${goal.toLocaleString()} steps` : 'No goal set yet'}
          </Text>
        </View>

        <Pressable
          onPress={onEditGoal}
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => [styles.editButton, pressed && styles.editPressed]}
        >
          <Text style={styles.editText}>{hasGoal ? 'Edit' : 'Set goal'}</Text>
        </Pressable>
      </View>

      <View style={styles.valueRow}>
        <Text style={[styles.value, { color: accent }]}>
          {walked.toLocaleString()}
        </Text>
        <Text style={styles.valueUnit}>
          {hasGoal ? `/ ${goal.toLocaleString()} steps` : 'steps'}
        </Text>
      </View>

      <View style={styles.track}>
        <Animated.View
          style={[
            styles.fill,
            { backgroundColor: accent, transform: [{ scaleX }] },
          ]}
        />
      </View>

      {hasGoal ? (
        <View style={styles.footerRow}>
          <Text style={styles.footerDone}>
            {Math.round(percentDone)}% done
          </Text>

          <Text style={styles.footerLeft}>
            {reached
              ? 'Goal reached - nice work!'
              : `${Math.round(percentLeft)}% left - ${stepsLeft.toLocaleString()} steps to go`}
          </Text>
        </View>
      ) : (
        <Text style={styles.emptyHint}>
          Set a goal to see how much of today is left.
        </Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,

    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.title,
  },
  subtitle: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  editButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  editPressed: {
    opacity: 0.6,
  },
  editText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.blue,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 16,
  },
  value: {
    fontSize: 30,
    fontWeight: '700',
  },
  valueUnit: {
    fontSize: 13,
    color: colors.muted,
    marginLeft: 6,
    marginBottom: 5,
  },
  track: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginTop: 12,
  },
  fill: {
    height: '100%',
    borderRadius: 5,
    // Grow out of the left edge instead of from the middle of the track.
    transformOrigin: 'left center',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 10,
  },
  footerDone: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.title,
  },
  footerLeft: {
    flex: 1,
    fontSize: 12,
    color: colors.muted,
    textAlign: 'right',
  },
  emptyHint: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 10,
  },
});
