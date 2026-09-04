import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '../constants/colors';

/**
 * One health-data card: icon, title, current value and unit.
 *
 * The card animates in three ways:
 *  - it fades and slides in when it first appears (staggered by `index`);
 *  - while there is no reading yet it blinks slowly, so an empty card looks
 *    like it is waiting rather than broken;
 *  - when a new reading actually changes this card's value the number pops
 *    and a single ring expands out of the icon. Only the card that changed
 *    animates - the others stay still, so it is obvious which one is new.
 *
 * Props:
 *  - title      "Steps"
 *  - value      "8,432"
 *  - unit       "steps"
 *  - icon       an Ionicons name, e.g. "footsteps"
 *  - color      accent color for the icon
 *  - background pale background behind the icon
 *  - width      card width in pixels (calculated by the screen)
 *  - isLive     true once this card shows a real reading
 *  - index      position in the grid, used to stagger the entrance
 */
export default function HealthCard({
  title,
  value,
  unit,
  icon,
  color,
  background,
  width,
  isLive = false,
  index = 0,
}) {
  // Entrance: 0 -> 1 once, just after mount.
  const enter = useRef(new Animated.Value(0)).current;
  // Idle blink while the card is still waiting for its first reading.
  const blink = useRef(new Animated.Value(1)).current;
  // One-shot highlight, played only on the card whose value just changed:
  // the icon bumps, a ring expands out of it and the number pops.
  const iconScale = useRef(new Animated.Value(1)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(1)).current;

  const previousValue = useRef(value);

  // --- entrance -----------------------------------------------------------
  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 420,
      delay: index * 90,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enter, index]);

  // --- waiting: slow blink ------------------------------------------------
  useEffect(() => {
    if (isLive) {
      blink.setValue(1);
      return undefined;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, {
          toValue: 0.35,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(blink, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();

    return () => {
      loop.stop();
      blink.setValue(1);
    };
  }, [blink, isLive]);

  // --- a new reading lands on this card ----------------------------------
  useEffect(() => {
    if (previousValue.current === value) return;
    previousValue.current = value;

    // Nothing to celebrate when the card falls back to "--".
    if (!isLive) return;

    pop.stopAnimation();
    iconScale.stopAnimation();
    ring.stopAnimation();
    pop.setValue(1);
    iconScale.setValue(1);
    ring.setValue(0);

    Animated.parallel([
      // The number snaps up and springs back.
      Animated.sequence([
        Animated.timing(pop, {
          toValue: 1.18,
          duration: 140,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(pop, {
          toValue: 1,
          friction: 4,
          tension: 120,
          useNativeDriver: true,
        }),
      ]),
      // The icon gives a single beat.
      Animated.sequence([
        Animated.timing(iconScale, {
          toValue: 1.16,
          duration: 160,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(iconScale, {
          toValue: 1,
          friction: 5,
          tension: 110,
          useNativeDriver: true,
        }),
      ]),
      // One ring rides out from under the icon and fades.
      Animated.timing(ring, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  }, [iconScale, isLive, pop, ring, value]);

  const translateY = enter.interpolate({
    inputRange: [0, 1],
    outputRange: [18, 0],
  });

  const ringScale = ring.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.9],
  });

  const ringOpacity = ring.interpolate({
    inputRange: [0, 0.15, 1],
    outputRange: [0, 0.35, 0],
  });

  return (
    <Animated.View
      style={[
        styles.card,
        { width, opacity: enter, transform: [{ translateY }] },
      ]}
    >
      <View style={styles.iconWrap}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pulseRing,
            {
              backgroundColor: color,
              opacity: ringOpacity,
              transform: [{ scale: ringScale }],
            },
          ]}
        />

        <Animated.View
          style={[
            styles.iconCircle,
            {
              backgroundColor: background,
              opacity: blink,
              transform: [{ scale: iconScale }],
            },
          ]}
        >
          <Ionicons name={icon} size={22} color={color} />
        </Animated.View>
      </View>

      <Text style={styles.title}>{title}</Text>

      <View style={styles.valueRow}>
        <Animated.Text
          style={[
            styles.value,
            { opacity: blink, transform: [{ scale: pop }] },
          ]}
        >
          {value}
        </Animated.Text>
        <Text style={styles.unit}>{unit}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,

    // Subtle shadow on iOS...
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    // ...and on Android.
    elevation: 3,
  },
  // Holds the icon and the pulse ring on top of each other.
  iconWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  pulseRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 6,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  value: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.title,
    // Grow from the bottom-left so the pop does not shove the unit around.
    transformOrigin: 'left bottom',
  },
  unit: {
    fontSize: 13,
    color: colors.muted,
    marginLeft: 6,
    marginBottom: 4,
  },
});
