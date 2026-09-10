import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '../constants/colors';

// A simple splash screen that only shows the app name.
// App.js decides how long it stays on screen.
export default function SplashScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.logoCircle}>
        <Ionicons name="fitness" size={44} color={colors.blue} />
      </View>

      <Text style={styles.appName}>Fitness Tracker</Text>
      <Text style={styles.tagline}>Stay healthy every day</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  logoCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,

    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  appName: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.title,
    letterSpacing: 0.5,
  },
  tagline: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 8,
  },
});
