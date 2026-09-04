import React, { useContext, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import AuthField from '../components/AuthField';
import { UserContext } from '../context/userContext';
import { login } from '../services/auth';
import { colors } from '../constants/colors';

const PAGE_PADDING = 24;
const MAX_CONTENT_WIDTH = 480;

const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,30}$/;

/**
 * Sign-in form.
 *
 * onSuccess  - called with the session once the server accepts the login.
 * onSignup   - called when the user taps "Sign up" at the bottom.
 */
export default function LoginScreen({ onSuccess, onSignup }) {
  const { setUser } = useContext(UserContext);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Per-field messages, plus one for anything the server complained about.
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = () => {
    const next = {};

    if (!username.trim()) next.username = 'Enter your username.';
    else if (!USERNAME_PATTERN.test(username.trim()))
      next.username =
        'Use 3-30 letters, numbers, dots, dashes or underscores.';

    if (!password) next.password = 'Enter your password.';

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    Keyboard.dismiss();
    setFormError('');

    if (!validate() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const session = await login({ username, password });

      setUser(session.user ?? {});
      onSuccess?.(session);
    } catch (error) {
      setFormError(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.safeArea}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.logoCircle}>
              <Ionicons name="fitness" size={32} color={colors.blue} />
            </View>

            <Text style={styles.heading}>Welcome back</Text>
            <Text style={styles.subheading}>
              Sign in to see your activity and connect your tracker.
            </Text>
          </View>

          <View style={styles.card}>
            {!!formError && (
              <View style={styles.banner}>
                <Ionicons name="alert-circle" size={18} color={colors.danger} />
                <Text style={styles.bannerText}>{formError}</Text>
              </View>
            )}

            <AuthField
              label="Username"
              icon="at-outline"
              value={username}
              onChangeText={setUsername}
              error={errors.username}
              placeholder="yourname"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
              returnKeyType="next"
              editable={!isSubmitting}
            />

            <AuthField
              label="Password"
              icon="lock-closed-outline"
              value={password}
              onChangeText={setPassword}
              error={errors.password}
              placeholder="Your password"
              secure
              autoCapitalize="none"
              autoComplete="password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={handleSubmit}
              editable={!isSubmitting}
            />

            <Pressable
              onPress={handleSubmit}
              disabled={isSubmitting}
              style={({ pressed }) => [
                styles.primaryButton,
                isSubmitting && styles.buttonDisabled,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Sign in"
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.card} />
              ) : (
                <Text style={styles.primaryButtonText}>Sign in</Text>
              )}
            </Pressable>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>New here?</Text>

            <Pressable
              onPress={onSignup}
              disabled={isSubmitting}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Go to sign up"
            >
              <Text style={styles.footerLink}>Create an account</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: PAGE_PADDING,
  },
  content: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,

    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  heading: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.title,
  },
  subheading: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 20,

    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 3,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.dangerSoft,
    marginBottom: 16,
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
    color: colors.danger,
    lineHeight: 18,
  },
  primaryButton: {
    height: 50,
    borderRadius: 14,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.card,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.85,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 22,
  },
  footerText: {
    fontSize: 14,
    color: colors.muted,
  },
  footerLink: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.blue,
  },
});
