// app/(tabs)/profile.tsx — Settings & Custom Rules with theme, language & bottom safe inset
import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Switch,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../lib/AppContext';
import type { VerificationRules, AppLanguage, AppTheme } from '../../lib/rules';

export default function SettingsScreen() {
  const { rules, updateRules, t, colors, isDark, setLanguage, setTheme } = useApp();
  const [localRules, setLocalRules] = useState<VerificationRules>(rules);

  useEffect(() => {
    setLocalRules(rules);
  }, [rules]);

  const handleSave = async () => {
    await updateRules(localRules);
    Alert.alert(t.settings, t.savedSuccess);
  };

  const updateRuleField = <K extends keyof VerificationRules>(key: K, value: VerificationRules[K]) => {
    setLocalRules((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.headerRow}>
            <View>
              <Text style={[styles.title, { color: colors.textPrimary }]}>{t.settings}</Text>
              <Text style={[styles.subTitle, { color: colors.textSecondary }]}>{t.customRulesSub}</Text>
            </View>
            <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="options-outline" size={24} color={colors.primaryBlue} />
            </View>
          </View>

          {/* Section: Custom Rules */}
          <Text style={[styles.sectionHeader, { color: colors.textPrimary }]}>{t.customRules}</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
            {/* CBE Expected Receiver Rule */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>{t.cbeReceiverRule}</Text>
              <TextInput
                style={[
                  styles.textInput,
                  { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.textPrimary },
                ]}
                value={localRules.cbeExpectedReceiverName}
                onChangeText={(val) => updateRuleField('cbeExpectedReceiverName', val)}
                placeholder={t.cbeReceiverHint}
                placeholderTextColor={colors.textTertiary}
              />
            </View>

            {/* CBE Legacy Account Config */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>{t.cbeLegacyDigits}</Text>
              <TextInput
                style={[
                  styles.textInput,
                  { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.textPrimary },
                ]}
                value={localRules.cbeLegacyReceiverDigits}
                onChangeText={(val) => updateRuleField('cbeLegacyReceiverDigits', val.replace(/\D/g, ''))}
                placeholder={t.cbeLegacyHint}
                placeholderTextColor={colors.textTertiary}
                keyboardType="number-pad"
                maxLength={16}
              />
            </View>

            {/* Telebirr Expected Receiver Rule */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>{t.telebirrReceiverRule}</Text>
              <TextInput
                style={[
                  styles.textInput,
                  { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.textPrimary },
                ]}
                value={localRules.telebirrExpectedReceiverName}
                onChangeText={(val) => updateRuleField('telebirrExpectedReceiverName', val)}
                placeholder={t.telebirrReceiverHint}
                placeholderTextColor={colors.textTertiary}
              />
            </View>

            {/* Enforce Receiver Match Toggle */}
            <View style={[styles.switchRow, { borderTopColor: colors.divider }]}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={[styles.switchTitle, { color: colors.textPrimary }]}>{t.enforceMatch}</Text>
                <Text style={[styles.switchSub, { color: colors.textSecondary }]}>{t.enforceMatchSub}</Text>
              </View>
              <Switch
                value={localRules.enforceReceiverMatch}
                onValueChange={(val) => updateRuleField('enforceReceiverMatch', val)}
                trackColor={{ false: isDark ? '#333333' : '#CBD5E1', true: colors.primaryBlue }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>

          {/* Section: Appearance & Theme */}
          <Text style={[styles.sectionHeader, { color: colors.textPrimary }]}>{t.appearance}</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
            <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>{t.theme}</Text>
            <View style={[styles.segmentedRow, { backgroundColor: colors.surfaceSubtle }]}>
              {(['light', 'dark', 'system'] as AppTheme[]).map((themeOpt) => {
                const isSelected = localRules.theme === themeOpt;
                return (
                  <TouchableOpacity
                    key={themeOpt}
                    style={[styles.segmentBtn, isSelected && { backgroundColor: colors.primaryBlue }]}
                    onPress={async () => {
                      updateRuleField('theme', themeOpt);
                      await setTheme(themeOpt);
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={
                        themeOpt === 'light'
                          ? 'sunny-outline'
                          : themeOpt === 'dark'
                          ? 'moon-outline'
                          : 'phone-portrait-outline'
                      }
                      size={15}
                      color={isSelected ? '#FFFFFF' : colors.textSecondary}
                      style={{ marginRight: 4 }}
                    />
                    <Text style={[styles.segmentText, { color: isSelected ? '#FFFFFF' : colors.textSecondary }]}>
                      {themeOpt === 'light' ? 'Light' : themeOpt === 'dark' ? 'Dark' : 'System'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Section: Language */}
            <Text style={[styles.fieldLabel, { color: colors.textPrimary, marginTop: 16 }]}>{t.language}</Text>
            <View style={[styles.segmentedRow, { backgroundColor: colors.surfaceSubtle }]}>
              {[
                { id: 'en' as AppLanguage, label: 'English' },
                { id: 'am' as AppLanguage, label: 'አማርኛ' },
                { id: 'om' as AppLanguage, label: 'Afaan Oromoo' },
              ].map((langOpt) => {
                const isSelected = localRules.language === langOpt.id;
                return (
                  <TouchableOpacity
                    key={langOpt.id}
                    style={[styles.segmentBtn, isSelected && { backgroundColor: colors.primaryBlue }]}
                    onPress={async () => {
                      updateRuleField('language', langOpt.id);
                      await setLanguage(langOpt.id);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.segmentText, { color: isSelected ? '#FFFFFF' : colors.textSecondary }]}>
                      {langOpt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Save Action Button */}
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.primaryBlue }]}
            onPress={handleSave}
            activeOpacity={0.88}
          >
            <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />
            <Text style={styles.saveBtnText}>{t.saveRules}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subTitle: {
    fontSize: 12,
    marginTop: 2,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
    marginTop: 6,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 16,
    marginBottom: 20,
  },
  fieldGroup: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
  },
  switchTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  switchSub: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  segmentedRow: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '600',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 28,
    paddingVertical: 15,
    marginTop: 6,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
