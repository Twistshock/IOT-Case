import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '../constants/colors';

const MIN_GOAL = 100;
const MAX_GOAL = 100000;

/**
 * Asks the user how many steps they want to walk today.
 *
 * The modal owns only the text being typed; the saved goal itself stays with
 * the caller, so the screen decides where it is stored (context, database...).
 *
 * Props:
 *  - visible      show or hide the modal
 *  - initialGoal  goal to prefill the input with, e.g. 8000 (optional)
 *  - onSubmit     called with the goal as a number when "Set goal" is pressed
 *  - onClose      called when the user dismisses the modal
 *  - saving       true while onSubmit is still working; disables the button
 */
export default function StepGoalModal({
  visible,
  initialGoal,
  onSubmit,
  onClose,
  saving = false,
}) {
  const [goal, setGoal] = useState('');
  const [error, setError] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  // Start from the current goal every time the modal opens, so reopening it
  // never shows what was half-typed and abandoned last time.
  useEffect(() => {
    if (!visible) return;

    setGoal(initialGoal ? String(initialGoal) : '');
    setError('');
    setIsFocused(false);
  }, [visible, initialGoal]);

  const handleChange = (text) => {
    // Numeric keyboards still let some characters through, so strip anything
    // that is not a digit instead of trusting keyboardType alone.
    setGoal(text.replace(/[^0-9]/g, ''));
    if (error) setError('');
  };

  const handleSubmit = () => {
    const value = Number(goal);

    if (!goal) {
      setError('Enter a step goal for today.');
      return;
    }

    if (!Number.isFinite(value) || value < MIN_GOAL) {
      setError(`Pick a goal of at least ${MIN_GOAL} steps.`);
      return;
    }

    if (value > MAX_GOAL) {
      setError(`That is a lot - keep it under ${MAX_GOAL.toLocaleString()}.`);
      return;
    }

    onSubmit?.(value);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Tapping the dimmed area behind the card closes the modal. */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.centered}
        >
          {/* Swallow the press so a tap inside the card does not dismiss it. */}
          <Pressable style={styles.card} onPress={() => {}}>
            <View style={styles.iconCircle}>
              <Ionicons name="footsteps" size={22} color={colors.blue} />
            </View>

            <Text style={styles.title}>Today's step goal</Text>
            <Text style={styles.subtitle}>
              How many steps do you want to walk today?
            </Text>

            <View
              style={[
                styles.inputRow,
                isFocused && styles.inputRowFocused,
                !!error && styles.inputRowError,
              ]}
            >
              <TextInput
                value={goal}
                onChangeText={handleChange}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                onSubmitEditing={handleSubmit}
                style={styles.input}
                placeholder="8000"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                returnKeyType="done"
                maxLength={6}
                autoFocus
              />
              <Text style={styles.unit}>steps</Text>
            </View>

            {!!error && <Text style={styles.error}>{error}</Text>}

            <Pressable
              onPress={handleSubmit}
              disabled={saving}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.button,
                pressed && styles.buttonPressed,
                saving && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.buttonText}>
                {saving ? 'Saving...' : 'Set goal'}
              </Text>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(31, 41, 55, 0.45)',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 24,

    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 6,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.title,
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 6,
    marginBottom: 18,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 52,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  inputRowFocused: {
    borderColor: colors.blue,
  },
  inputRowError: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
  },
  input: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
    color: colors.title,
    padding: 0,
  },
  unit: {
    fontSize: 14,
    color: colors.muted,
  },
  error: {
    fontSize: 12,
    color: colors.danger,
    marginTop: 6,
  },
  button: {
    height: 50,
    borderRadius: 12,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.card,
  },
});
