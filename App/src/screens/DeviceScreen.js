import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  Pressable,
  TextInput,
  Keyboard,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import DeviceRow from '../components/DeviceRow';
import { useBle } from '../context/BleContext';
import { colors } from '../constants/colors';

const PAGE_PADDING = 20;
const MAX_CONTENT_WIDTH = 600;

/** 09:41:07, so several messages in the same minute stay apart. */
function formatTime(timestamp) {
  const date = new Date(timestamp);
  const pad = (number) => String(number).padStart(2, '0');

  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds()
  )}`;
}

export default function DeviceScreen() {
  const {
    available,
    unavailableReason,
    devices,
    isScanning,
    connectedDevice,
    connectingId,
    error,
    trackerValue,
    isBusy,
    messages,
    isSubscribed,
    startScan,
    stopScan,
    connect,
    disconnect,
    readTrackerValue,
    sendTrackerValue,
    clearMessages,
  } = useBle();

  // Text typed into the box that gets written to the ESP32 characteristic.
  const [message, setMessage] = useState('');
  const logRef = useRef(null);

  const handleSend = async () => {
    const text = message.trim();
    if (!text) return;

    Keyboard.dismiss();
    const sent = await sendTrackerValue(text);
    if (sent) setMessage('');
  };


  useEffect(() => {
    if (connectedDevice) {
      console.log('Connected to device:', connectedDevice.name, connectedDevice.id);
      asyncDevice();
    }
  }, [connectedDevice]);


  async function asyncDevice() {
    const currentTime = new Date().toISOString();
    const payload = {
      timestamp: currentTime,
      username: 'testuser', // Replace with actual username if available
      type: 'device_connected',
    }

    await sendTrackerValue(JSON.stringify(payload));
  }
  

  return (
    <View style={styles.safeArea}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.heading}>Add a Device</Text>
        </View>

        {!available && (
          <View style={[styles.banner, styles.bannerError]}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
            <Text style={styles.bannerText}>
              Bluetooth is unavailable: {unavailableReason || 'this build has no native BLE module.'}
            </Text>
          </View>
        )}

        {error && (
          <View style={[styles.banner, styles.bannerError]}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
            <Text style={styles.bannerText}>{error}</Text>
          </View>
        )}

        {connectedDevice && (
          <View style={styles.connectedCard}>
            <View style={styles.connectedIcon}>
              <Ionicons name="checkmark" size={20} color={colors.green} />
            </View>

            <View style={styles.connectedInfo}>
              <Text style={styles.connectedLabel}>Connected</Text>
              <Text style={styles.connectedName} numberOfLines={1}>
                {connectedDevice.name ?? 'Unnamed device'}
              </Text>
            </View>

            <Pressable
              onPress={disconnect}
              style={({ pressed }) => [
                styles.disconnectButton,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.disconnectText}>Disconnect</Text>
            </Pressable>
          </View>
        )}

        {/* Only the ESP32 exposes the service from the sketch. */}
        {connectedDevice?.hasTrackerService && (
          <View style={styles.trackerCard}>
            <View style={styles.trackerHeader}>
              <View style={styles.trackerHeaderText}>
                <Text style={styles.trackerTitle}>Characteristic</Text>
                <Text style={styles.trackerValue} numberOfLines={3}>
                  {trackerValue === null
                    ? 'Not read yet'
                    : trackerValue === ''
                    ? '(empty)'
                    : trackerValue}
                </Text>
              </View>

              {messages.length > 0 && (
                <Pressable
                  onPress={clearMessages}
                  style={({ pressed }) => [
                    styles.clearButton,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Clear message log"
                >
                  <Ionicons name="trash-outline" size={14} color={colors.muted} />
                </Pressable>
              )}
            </View>

            {/*
              The sketch declares the characteristic as READ | WRITE only.
              Add BLECharacteristic::PROPERTY_NOTIFY (plus a BLE2902
              descriptor) and the pushed values land in the log below on
              their own; until then "Read value" pulls them in.
            */}
            <View style={styles.subscriptionRow}>
              <View
                style={[
                  styles.dot,
                  isSubscribed ? styles.dotLive : styles.dotIdle,
                ]}
              />
              <Text style={styles.subscriptionText}>
                {isSubscribed
                  ? 'Listening for notifications'
                  : 'No notifications - read to get the value'}
              </Text>
            </View>

            <ScrollView
              ref={logRef}
              style={styles.log}
              contentContainerStyle={styles.logContent}
              onContentSizeChange={() =>
                logRef.current?.scrollToEnd({ animated: true })
              }
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              {messages.length === 0 ? (
                <Text style={styles.logEmpty}>
                  Nothing exchanged yet. Send a line, or read the value.
                </Text>
              ) : (
                messages.map((entry) => (
                  <View
                    key={entry.id}
                    style={[
                      styles.bubble,
                      entry.direction === 'out'
                        ? styles.bubbleOut
                        : styles.bubbleIn,
                    ]}
                  >
                    <Text
                      style={[
                        styles.bubbleMeta,
                        entry.direction === 'out' && styles.bubbleMetaOut,
                      ]}
                    >
                      {entry.direction === 'out' ? 'Sent' : 'Received'}
                      {entry.kind === 'read' ? ' (read)' : ''}
                      {' \u00b7 '}
                      {formatTime(entry.at)}
                    </Text>
                    <Text
                      style={[
                        styles.bubbleText,
                        entry.direction === 'out' && styles.bubbleTextOut,
                      ]}
                    >
                      {entry.text === '' ? '(empty)' : entry.text}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>

            <View style={styles.trackerRow}>
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder="Text to send to the ESP32"
                placeholderTextColor={colors.muted}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="send"
                onSubmitEditing={handleSend}
                editable={!isBusy}
              />

              <Pressable
                onPress={handleSend}
                disabled={isBusy || !message.trim()}
                style={({ pressed }) => [
                  styles.sendButton,
                  (isBusy || !message.trim()) && styles.buttonDisabled,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Send to device"
              >
                <Ionicons name="send" size={16} color={colors.card} />
              </Pressable>
            </View>

            <Pressable
              onPress={readTrackerValue}
              disabled={isBusy}
              style={({ pressed }) => [
                styles.readButton,
                isBusy && styles.buttonDisabled,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
            >
              {isBusy ? (
                <ActivityIndicator color={colors.blue} size="small" />
              ) : (
                <Ionicons name="download-outline" size={16} color={colors.blue} />
              )}
              <Text style={styles.readText}>Read value</Text>
            </Pressable>
          </View>
        )}

        <Pressable
          onPress={isScanning ? stopScan : startScan}
          style={({ pressed }) => [styles.scanButton, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          {isScanning ? (
            <ActivityIndicator color={colors.card} />
          ) : (
            <Ionicons name="search" size={18} color={colors.card} />
          )}
          <Text style={styles.scanText}>
            {isScanning ? 'Scanning\u2026 tap to stop' : 'Scan for devices'}
          </Text>
        </Pressable>

        <FlatList
          data={devices}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <DeviceRow
              device={item}
              isConnected={connectedDevice?.id === item.id}
              isConnecting={connectingId === item.id}
              disabled={connectingId != null}
              onPress={connect}
            />
          )}
          ListHeaderComponent={
            devices.length > 0 ? (
              <Text style={styles.listTitle}>
                Found {devices.length} device{devices.length === 1 ? '' : 's'}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons
                name="bluetooth-outline"
                size={40}
                color={colors.muted}
              />
              <Text style={styles.emptyText}>
                {isScanning
                  ? 'Looking for nearby devices\u2026'
                  : 'No devices yet. Make sure your tracker is on and nearby, then start a scan.'}
              </Text>
            </View>
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: PAGE_PADDING,
    paddingTop: 24,
  },
  header: {
    marginTop: 30,
    marginBottom: 20,
  },
  greeting: {
    fontSize: 15,
    color: colors.muted,
    marginBottom: 4,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.title,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  bannerError: {
    backgroundColor: colors.dangerSoft,
  },
  bannerText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: colors.text,
  },
  connectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,

    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 2,
  },
  connectedIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  connectedInfo: {
    flex: 1,
    marginRight: 10,
  },
  connectedLabel: {
    fontSize: 12,
    color: colors.green,
    fontWeight: '600',
    marginBottom: 2,
  },
  connectedName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.title,
  },
  disconnectButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.dangerSoft,
  },
  disconnectText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.danger,
  },
  trackerCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,

    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 2,
  },
  trackerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  trackerHeaderText: {
    flex: 1,
  },
  trackerTitle: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 4,
  },
  trackerValue: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.title,
  },
  clearButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  subscriptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  dotLive: {
    backgroundColor: colors.green,
  },
  dotIdle: {
    backgroundColor: colors.muted,
  },
  subscriptionText: {
    fontSize: 11,
    color: colors.muted,
  },
  log: {
    maxHeight: 170,
    marginTop: 10,
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: colors.background,
  },
  logContent: {
    padding: 8,
    gap: 6,
  },
  logEmpty: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    paddingVertical: 14,
  },
  bubble: {
    maxWidth: '85%',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  bubbleIn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleOut: {
    alignSelf: 'flex-end',
    backgroundColor: colors.blue,
  },
  bubbleMeta: {
    fontSize: 10,
    color: colors.muted,
    marginBottom: 2,
  },
  bubbleMetaOut: {
    color: colors.blueSoft,
  },
  bubbleText: {
    fontSize: 13,
    color: colors.text,
  },
  bubbleTextOut: {
    color: colors.card,
  },
  trackerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.background,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.blue,
  },
  readButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.blueSoft,
    marginTop: 10,
  },
  readText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.blue,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.blue,
    marginBottom: 18,

    shadowColor: colors.blue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 3,
  },
  scanText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.card,
  },
  pressed: {
    opacity: 0.75,
  },
  listContent: {
    paddingBottom: 24,
    flexGrow: 1,
  },
  listTitle: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 10,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
    gap: 12,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
    textAlign: 'center',
  },
});
