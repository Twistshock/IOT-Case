import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '../constants/colors';

/**
 * Bottom tab bar.
 *
 * Props:
 *  - tabs        [{ key, label, icon, activeIcon }]
 *  - activeTab   key of the tab currently shown
 *  - onChange    called with the key of the tapped tab
 */
export default function TabBar({ tabs, activeTab, onChange }) {
  return (
    <View style={styles.bar}>
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;

        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={styles.tab}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={tab.label}
          >
            <Ionicons
              name={isActive ? tab.activeIcon : tab.icon}
              size={23}
              color={isActive ? colors.blue : colors.muted}
            />
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 8,
    // Leave room for the home indicator on modern iPhones.
    paddingBottom: Platform.OS === 'ios' ? 24 : 48,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  label: {
    fontSize: 11,
    color: colors.muted,
  },
  labelActive: {
    color: colors.blue,
    fontWeight: '600',
  },
});
