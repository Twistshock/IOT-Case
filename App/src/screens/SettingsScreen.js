import React, { useContext, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { UserContext } from '../context/userContext';
import { logout } from '../services/auth';
import { deleteAccount, toProfile } from '../services/profile';
import { colors } from '../constants/colors';

const PAGE_PADDING = 20;
const MAX_CONTENT_WIDTH = 600;

/**
 * Account settings: the way in to the profile, plus signing out and
 * deleting the account.
 *
 * onOpenProfile - called when the profile row is tapped.
 * onSignedOut   - called once the session is gone, so the app can go back to
 *                 the login screen.
 */
export default function SettingsScreen({ onOpenProfile, onSignedOut }) {
  const { user, setUser } = useContext(UserContext);
  const profile = toProfile(user);

  // Which destructive action is running, so only that row shows a spinner.
  const [busy, setBusy] = useState(null);

  const handleLogout = () => {
    Alert.alert('Log out', 'You will need to sign in again next time.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          setBusy('logout');
          try {
            await logout();
            setUser({});
            onSignedOut?.();
          } catch (error) {
            Alert.alert('Could not log out', error.message ?? 'Try again.');
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete account',
      'This removes your account and its data. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusy('delete');
            try {
              await deleteAccount();
              setUser({});
              onSignedOut?.();
            } catch (error) {
              Alert.alert(
                'Could not delete your account',
                error.message ?? 'Try again.'
              );
            } finally {
              setBusy(null);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.heading}>Settings</Text>
          <Text style={styles.subheading}>Your account and this app.</Text>
        </View>

        <Text style={styles.sectionTitle}>Account</Text>

        <View style={styles.card}>
          <Row
            icon="person-outline"
            iconColor={colors.blue}
            iconBackground={colors.blueSoft}
            title="Profile"
            subtitle={
              profile.displayname || user?.username || 'Add your details'
            }
            onPress={onOpenProfile}
            disabled={!!busy}
          />
        </View>

        <Text style={styles.sectionTitle}>Session</Text>

        <View style={styles.card}>
          <Row
            icon="log-out-outline"
            iconColor={colors.orange}
            iconBackground={colors.orangeSoft}
            title="Log out"
            subtitle="Sign out on this phone"
            onPress={handleLogout}
            disabled={!!busy}
            isBusy={busy === 'logout'}
          />

          <View style={styles.divider} />

          <Row
            icon="trash-outline"
            iconColor={colors.danger}
            iconBackground={colors.dangerSoft}
            title="Delete account"
            subtitle="Remove your account for good"
            titleStyle={styles.dangerTitle}
            onPress={handleDeleteAccount}
            disabled={!!busy}
            isBusy={busy === 'delete'}
          />
        </View>
      </ScrollView>
    </View>
  );
}

/** One tappable line in a settings card. */
function Row({
  icon,
  iconColor,
  iconBackground,
  title,
  subtitle,
  titleStyle,
  onPress,
  disabled = false,
  isBusy = false,
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.row,
        pressed && styles.rowPressed,
        disabled && styles.rowDisabled,
      ]}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={[styles.rowIcon, { backgroundColor: iconBackground }]}>
        <Ionicons name={icon} size={19} color={iconColor} />
      </View>

      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, titleStyle]}>{title}</Text>
        {!!subtitle && (
          <Text style={styles.rowSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>

      {isBusy ? (
        <ActivityIndicator size="small" color={colors.muted} />
      ) : (
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: PAGE_PADDING,
    paddingTop: 24,
    paddingBottom: 32,
  },
  header: {
    marginTop: 32,
    marginBottom: 24,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.title,
  },
  subheading: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 6,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowPressed: {
    backgroundColor: colors.background,
  },
  rowDisabled: {
    opacity: 0.6,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.title,
  },
  dangerTitle: {
    color: colors.danger,
  },
  rowSubtitle: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 66,
  },
});
