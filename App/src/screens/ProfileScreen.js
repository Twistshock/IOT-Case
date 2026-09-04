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
import { toProfile, updateProfile, SEX_OPTIONS } from '../services/profile';
import { colors } from '../constants/colors';

const PAGE_PADDING = 20;
const MAX_CONTENT_WIDTH = 600;

const MIN_HEIGHT_CM = 30;
const MAX_HEIGHT_CM = 272;

const MIN_WEIGHT_KG = 2;
const MAX_WEIGHT_KG = 640;

// A decimal keyboard hands us "72,5" wherever the comma is the decimal mark,
// and Number() only understands the dot.
function toWeightNumber(value) {
  return Number(value.trim().replace(',', '.'));
}


export default function ProfileScreen({ onBack }) {
  const { user, setUser } = useContext(UserContext);
  const profile = toProfile(user);

  const [displayname, setDisplayname] = useState(profile.displayname);
  const [sex, setSex] = useState(profile.sex);
  const [height, setHeight] = useState(
    profile.height_cm == null ? '' : String(profile.height_cm)
  );
  const [weight, setWeight] = useState(
    profile.weight_kg == null ? '' : String(profile.weight_kg)
  );

  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const validate = () => {
    const next = {};

    if (!displayname.trim()) next.displayname = 'Enter a display name.';
    else if (displayname.trim().length > 40)
      next.displayname = 'Keep it under 40 characters.';

    // Height is optional, but a number that is there has to make sense.
    if (height.trim()) {
      const parsed = Number(height.trim());

      if (!Number.isFinite(parsed))
        next.height_cm = 'Enter your height as a number.';
      else if (parsed < MIN_HEIGHT_CM || parsed > MAX_HEIGHT_CM)
        next.height_cm = `Enter a height between ${MIN_HEIGHT_CM} and ${MAX_HEIGHT_CM} cm.`;
    }

    // Weight is optional in the same way, and may carry decimals.
    if (weight.trim()) {
      const parsed = toWeightNumber(weight);

      if (!Number.isFinite(parsed))
        next.weight_kg = 'Enter your weight as a number.';
      else if (parsed < MIN_WEIGHT_KG || parsed > MAX_WEIGHT_KG)
        next.weight_kg = `Enter a weight between ${MIN_WEIGHT_KG} and ${MAX_WEIGHT_KG} kg.`;
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    Keyboard.dismiss();
    setFormError('');
    setIsSaved(false);

    if (!validate() || isSaving) return;

    setIsSaving(true);
    try {
      const updated = await updateProfile({
        display_name: displayname.trim(),
        sex: sex || null,
        height_cm: height.trim() ? Number(height.trim()) : null,
        weight_kg: weight.trim() ? toWeightNumber(weight) : null,
      });

      setUser(updated ?? {});
      setIsSaved(true);
    } catch (error) {
      setFormError(error.message || 'Could not save your profile.');
    } finally {
      setIsSaving(false);
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
        <View style={styles.header}>
          <Pressable
            onPress={onBack}
            hitSlop={10}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Back to settings"
          >
            <Ionicons name="chevron-back" size={22} color={colors.title} />
          </Pressable>

          <Text style={styles.heading}>Profile</Text>
        </View>

        <View style={styles.avatarBlock}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(displayname.trim() || user?.username || '?')
                .charAt(0)
                .toUpperCase()}
            </Text>
          </View>

          <Text style={styles.username}>@{user?.username || 'user'}</Text>
        </View>

        <View style={styles.card}>
          {!!formError && (
            <View style={styles.banner}>
              <Ionicons name="alert-circle" size={18} color={colors.danger} />
              <Text style={styles.bannerText}>{formError}</Text>
            </View>
          )}

          {isSaved && !formError && (
            <View style={[styles.banner, styles.bannerOk]}>
              <Ionicons name="checkmark-circle" size={18} color={colors.green} />
              <Text style={[styles.bannerText, styles.bannerTextOk]}>
                Profile saved.
              </Text>
            </View>
          )}

          <AuthField
            label="Display name"
            icon="person-outline"
            value={displayname}
            onChangeText={setDisplayname}
            error={errors.displayname}
            placeholder="How your name is shown"
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="next"
            editable={!isSaving}
          />

          <View style={styles.field}>
            <Text style={styles.label}>Sex</Text>

            <View style={styles.options}>
              {SEX_OPTIONS.map((option) => {
                const isSelected = sex === option;

                return (
                  <Pressable
                    key={option}
                    // Tapping the selected one again clears it, so nobody is
                    // stuck with a value they picked by accident.
                    onPress={() => setSex(isSelected ? '' : option)}
                    disabled={isSaving}
                    style={[styles.option, isSelected && styles.optionActive]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={option}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        isSelected && styles.optionTextActive,
                      ]}
                    >
                      {option}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <AuthField
            label="Height (cm)"
            icon="resize-outline"
            value={height}
            onChangeText={setHeight}
            error={errors.height_cm}
            placeholder="170"
            keyboardType="number-pad"
            returnKeyType="next"
            editable={!isSaving}
          />

          <AuthField
            label="Weight (kg)"
            icon="barbell-outline"
            value={weight}
            onChangeText={setWeight}
            error={errors.weight_kg}
            placeholder="70"
            keyboardType="decimal-pad"
            returnKeyType="done"
            editable={!isSaving}
            onSubmitEditing={handleSave}
          />

          <Pressable
            onPress={handleSave}
            disabled={isSaving}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              isSaving && styles.buttonDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Save profile"
          >
            {isSaving ? (
              <ActivityIndicator color={colors.card} />
            ) : (
              <Text style={styles.buttonText}>Save changes</Text>
            )}
          </Pressable>
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
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: PAGE_PADDING,
    paddingTop: 24,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 32,
    marginBottom: 20,
  },
  backButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.title,
  },
  avatarBlock: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.blue,
  },
  username: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 10,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.dangerSoft,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  bannerOk: {
    backgroundColor: colors.greenSoft,
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
    color: colors.danger,
  },
  bannerTextOk: {
    color: colors.green,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 6,
  },
  options: {
    flexDirection: 'row',
    gap: 8,
  },
  option: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  optionActive: {
    borderColor: colors.blue,
    backgroundColor: colors.blueSoft,
  },
  optionText: {
    fontSize: 14,
    color: colors.muted,
    textTransform: 'capitalize',
  },
  optionTextActive: {
    color: colors.blue,
    fontWeight: '600',
  },
  button: {
    height: 50,
    borderRadius: 14,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.card,
  },
});
