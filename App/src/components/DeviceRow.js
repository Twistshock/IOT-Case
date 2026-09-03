import React from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '../constants/colors';

/** Turns an RSSI value into a rough distance hint. */
function signalLabel(rssi) {
  if (rssi == null) return 'Signal unknown';
  if (rssi >= -60) return 'Strong signal';
  if (rssi >= -75) return 'Good signal';
  return 'Weak signal';
}

/**
 * One row in the scan results list.
 *
 * Props:
 *  - device       { id, name, rssi }
 *  - isConnected  the app is currently connected to this device
 *  - isConnecting a connection attempt to this device is in progress
 *  - disabled     another device is being connected right now
 *  - onPress      called with the device
 */
export default function DeviceRow({
  device,
  isConnected,
  isConnecting,
  disabled,
  onPress,
}) {
  return (
    <Pressable
      onPress={() => onPress(device)}
      disabled={disabled || isConnecting || isConnected}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${device.name ?? 'Unnamed device'}, ${signalLabel(
        device.rssi
      )}`}
    >
      <View
        style={[
          styles.iconCircle,
          isConnected && { backgroundColor: colors.greenSoft },
        ]}
      >
        <Ionicons
          name="bluetooth"
          size={20}
          color={isConnected ? colors.green : colors.blue}
        />
      </View>

      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {device.name ?? 'Unnamed device'}
          </Text>

          {/* Marks the ESP32: it advertises our service UUID. */}
          {device.isTracker && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Tracker</Text>
            </View>
          )}
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {device.id}
        </Text>
        <Text style={styles.meta}>
          {signalLabel(device.rssi)}
          {device.rssi != null ? ` \u00B7 ${device.rssi} dBm` : ''}
        </Text>
      </View>

      {isConnecting ? (
        <ActivityIndicator color={colors.blue} />
      ) : (
        <Text style={[styles.action, isConnected && styles.actionConnected]}>
          {isConnected ? 'Connected' : 'Connect'}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,

    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 2,
  },
  rowPressed: {
    opacity: 0.7,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  info: {
    flex: 1,
    marginRight: 10,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  name: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.title,
  },
  badge: {
    backgroundColor: colors.blueSoft,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.blue,
  },
  meta: {
    fontSize: 12,
    color: colors.muted,
  },
  action: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.blue,
  },
  actionConnected: {
    color: colors.green,
  },
});
