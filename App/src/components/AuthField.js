import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '../constants/colors';

// One labelled text box for the login and signup forms.
// Passing `secure` adds the eye button that reveals the password.
export default function AuthField({
  label,
  icon,
  error,
  secure = false,
  style,
  ...inputProps
}) {
  const [isFocused, setIsFocused] = useState(false);
  const [isHidden, setIsHidden] = useState(secure);

  return (
    <View style={[styles.field, style]}>
      <Text style={styles.label}>{label}</Text>

      <View
        style={[
          styles.inputRow,
          isFocused && styles.inputRowFocused,
          !!error && styles.inputRowError,
        ]}
      >
        {!!icon && (
          <Ionicons
            name={icon}
            size={18}
            color={error ? colors.danger : colors.muted}
          />
        )}

        <TextInput
          {...inputProps}
          style={styles.input}
          placeholderTextColor={colors.muted}
          secureTextEntry={isHidden}
          onFocus={(event) => {
            setIsFocused(true);
            inputProps.onFocus?.(event);
          }}
          onBlur={(event) => {
            setIsFocused(false);
            inputProps.onBlur?.(event);
          }}
        />

        {secure && (
          <Pressable
            onPress={() => setIsHidden((hidden) => !hidden)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={isHidden ? 'Show password' : 'Hide password'}
          >
            <Ionicons
              name={isHidden ? 'eye-outline' : 'eye-off-outline'}
              size={18}
              color={colors.muted}
            />
          </Pressable>
        )}
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 48,
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
    fontSize: 15,
    color: colors.title,
    padding: 0,
  },
  error: {
    fontSize: 12,
    color: colors.danger,
    marginTop: 5,
  },
});
