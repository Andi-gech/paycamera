// app/(tabs)/profile.tsx — Anti-Slop Architectural Settings & Rules (Taste-Skill v2 Compliant)
import React, { useState, useEffect, useCallback } from 'react';
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
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../lib/AppContext';
import {
  getHistoryStats,
  clearAllHistory,
  resetOnboarding,
} from '../../lib/storage';
import { BankLogo } from '../../src/components/BankLogos';
import type { VerificationRules, AppLanguage, AppTheme } from '../../lib/rules';

export default function ProfileScreen() {
  const router = useRouter();
  const { rules, updateRules, t, colors, isDark, setLanguage, setTheme } = useApp();
  const [localRules, setLocalRules] = useState<VerificationRules>(rules);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [stats, setStats] = useState({ total: 0, verified: 0, successRate: 100 });

  const loadStats = useCallback(async () => {
    try {
      const data = await getHistoryStats();
      setStats(data);
    } catch {
      // Keep defaults
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    setLocalRules(rules);
  }, [rules]);

  const updateRuleField = <K extends keyof VerificationRules>(
    key: K,
    value: VerificationRules[K]
  ) => {
    setLocalRules((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateRules(localRules);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2400);
      Alert.alert(t.settings, t.savedSuccess);
    } catch {
      Alert.alert('Error', 'Unable to save settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearHistory = () => {
    Alert.alert(
      t.profileClearConfirmTitle,
      t.profileClearConfirmSub,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: t.profileClearHistory,
          style: 'destructive',
          onPress: async () => {
            await clearAllHistory();
            await loadStats();
            Alert.alert(t.settings, t.profileClearSuccess);
          },
        },
      ],
      { cancelable: true }
    );
  };

  const handleReplayTour = async () => {
    await resetOnboarding();
    router.replace('/onboarding');
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header Title Row */}
          <View style={styles.headerRow}>
            <View>
              <Text style={[styles.title, { color: colors.textPrimary }]}>
                {t.profileTitle}
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {t.profileSubtitle}
              </Text>
            </View>
            <View
              style={[
                styles.terminalBadge,
                {
                  backgroundColor: isDark ? '#111111' : '#F1F5F9',
                  borderColor: isDark ? '#222222' : '#CBD5E1',
                },
              ]}
            >
              <Text
                style={[
                  styles.terminalBadgeText,
                  { color: isDark ? '#A1A1AA' : '#475569' },
                ]}
              >
                TERMINAL · v1.2
              </Text>
            </View>
          </View>

          {/* KPI Summary Block (Divided Container, No Icons in Circles) */}
          <View
            style={[
              styles.kpiContainer,
              {
                backgroundColor: colors.surface,
                borderColor: colors.surfaceBorder,
              },
            ]}
          >
            <View style={styles.kpiCell}>
              <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>
                {t.profileTotalVerified}
              </Text>
              <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>
                {stats.total}
              </Text>
            </View>

            <View
              style={[styles.kpiDivider, { backgroundColor: colors.divider }]}
            />

            <View style={styles.kpiCell}>
              <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>
                {t.profileSuccessRate}
              </Text>
              <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>
                {stats.successRate}%
              </Text>
            </View>

            <View
              style={[styles.kpiDivider, { backgroundColor: colors.divider }]}
            />

            <View style={styles.kpiCell}>
              <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>
                {t.profileSupportedBanks}
              </Text>
              <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>
                5 Banks
              </Text>
            </View>
          </View>

          {/* Section: Receiver Protection Rules */}
          <View style={styles.sectionHeadingBox}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              {t.profileSectionRules}
            </Text>
            <Text style={[styles.sectionMeta, { color: colors.textSecondary }]}>
              {t.customRulesSub}
            </Text>
          </View>

          <View
            style={[
              styles.panel,
              {
                backgroundColor: colors.surface,
                borderColor: colors.surfaceBorder,
              },
            ]}
          >
            {/* CBE Expected Receiver Rule */}
            <View style={styles.fieldGroup}>
              <View style={styles.fieldLabelRow}>
                <BankLogo bankId="cbe" size={16} />
                <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>
                  {t.cbeReceiverRule}
                </Text>
              </View>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    backgroundColor: colors.inputBg,
                    borderColor: colors.inputBorder,
                    color: colors.textPrimary,
                  },
                ]}
                value={localRules.cbeExpectedReceiverName}
                onChangeText={(val) => updateRuleField('cbeExpectedReceiverName', val)}
                placeholder={t.cbeReceiverHint}
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="words"
              />
            </View>

            {/* CBE Account Digits */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>
                {t.cbeLegacyDigits}
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    backgroundColor: colors.inputBg,
                    borderColor: colors.inputBorder,
                    color: colors.textPrimary,
                  },
                ]}
                value={localRules.cbeLegacyReceiverDigits}
                onChangeText={(val) =>
                  updateRuleField('cbeLegacyReceiverDigits', val.replace(/\D/g, ''))
                }
                placeholder={t.cbeLegacyHint}
                placeholderTextColor={colors.textTertiary}
                keyboardType="number-pad"
                maxLength={16}
              />
            </View>

            {/* Telebirr Expected Receiver Rule */}
            <View style={styles.fieldGroup}>
              <View style={styles.fieldLabelRow}>
                <BankLogo bankId="telebirr" size={16} />
                <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>
                  {t.telebirrReceiverRule}
                </Text>
              </View>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    backgroundColor: colors.inputBg,
                    borderColor: colors.inputBorder,
                    color: colors.textPrimary,
                  },
                ]}
                value={localRules.telebirrExpectedReceiverName}
                onChangeText={(val) =>
                  updateRuleField('telebirrExpectedReceiverName', val)
                }
                placeholder={t.telebirrReceiverHint}
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="words"
              />
            </View>

            {/* Enforce Receiver Match Switch Row */}
            <View
              style={[
                styles.switchContainer,
                { borderTopColor: colors.divider },
              ]}
            >
              <View style={styles.switchTextBox}>
                <View style={styles.switchTitleLine}>
                  <Text style={[styles.switchTitle, { color: colors.textPrimary }]}>
                    {t.enforceMatch}
                  </Text>
                  {localRules.enforceReceiverMatch && (
                    <View
                      style={[
                        styles.activeTag,
                        {
                          backgroundColor: isDark ? '#062615' : '#ECFDF5',
                          borderColor: isDark ? 'rgba(5, 150, 105, 0.2)' : '#A7F3D0',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.activeTagText,
                          { color: colors.primaryBlue },
                        ]}
                      >
                        Enforced
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.switchDesc, { color: colors.textSecondary }]}>
                  {t.enforceMatchSub}
                </Text>
              </View>
              <Switch
                value={localRules.enforceReceiverMatch}
                onValueChange={(val) => updateRuleField('enforceReceiverMatch', val)}
                trackColor={{
                  false: isDark ? '#262626' : '#CBD5E1',
                  true: colors.primaryBlue,
                }}
                thumbColor="#FFFFFF"
              />
            </View>

            {/* Live Substance Preview Box */}
            <View
              style={[
                styles.previewBox,
                {
                  backgroundColor: colors.surfaceSubtle,
                  borderColor: colors.surfaceBorder,
                },
              ]}
            >
              <Text style={[styles.previewHeading, { color: colors.textSecondary }]}>
                Live Rule Matching Output
              </Text>
              <Text style={[styles.previewDetail, { color: colors.textPrimary }]}>
                Expected Receiver:{' '}
                <Text style={{ fontWeight: '600' }}>
                  {localRules.cbeExpectedReceiverName.trim()
                    ? localRules.cbeExpectedReceiverName
                    : 'Not configured'}
                </Text>
              </Text>
              <Text style={[styles.previewDetail, { color: colors.textSecondary }]}>
                Audit Mode:{' '}
                {localRules.enforceReceiverMatch
                  ? 'Strict Match Required'
                  : 'Flexible Notification'}
              </Text>
            </View>
          </View>

          {/* Section: Appearance & Preferences */}
          <View style={styles.sectionHeadingBox}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              {t.profileSectionAppearance}
            </Text>
          </View>

          <View
            style={[
              styles.panel,
              {
                backgroundColor: colors.surface,
                borderColor: colors.surfaceBorder,
              },
            ]}
          >
            {/* Theme Selector */}
            <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>
              {t.theme}
            </Text>
            <View
              style={[
                styles.segmentGroup,
                {
                  backgroundColor: colors.surfaceSubtle,
                  borderColor: colors.surfaceBorder,
                },
              ]}
            >
              {(['light', 'dark', 'system'] as AppTheme[]).map((themeOpt) => {
                const isSelected = localRules.theme === themeOpt;
                return (
                  <TouchableOpacity
                    key={themeOpt}
                    style={[
                      styles.segmentItem,
                      isSelected && {
                        backgroundColor: isDark ? '#262626' : '#FFFFFF',
                        borderWidth: 1,
                        borderColor: isDark ? '#333333' : '#CBD5E1',
                      },
                    ]}
                    onPress={async () => {
                      updateRuleField('theme', themeOpt);
                      await setTheme(themeOpt);
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={
                        themeOpt === 'light'
                          ? 'sunny-outline'
                          : themeOpt === 'dark'
                          ? 'moon-outline'
                          : 'phone-portrait-outline'
                      }
                      size={14}
                      color={
                        isSelected
                          ? colors.textPrimary
                          : colors.textSecondary
                      }
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={[
                        styles.segmentLabel,
                        {
                          color: isSelected
                            ? colors.textPrimary
                            : colors.textSecondary,
                          fontWeight: isSelected ? '600' : '400',
                        },
                      ]}
                    >
                      {themeOpt === 'light'
                        ? 'Light'
                        : themeOpt === 'dark'
                        ? 'Dark'
                        : 'System'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Language Selector */}
            <Text
              style={[
                styles.fieldLabel,
                { color: colors.textPrimary, marginTop: 16 },
              ]}
            >
              {t.language}
            </Text>
            <View
              style={[
                styles.segmentGroup,
                {
                  backgroundColor: colors.surfaceSubtle,
                  borderColor: colors.surfaceBorder,
                },
              ]}
            >
              {[
                { id: 'en' as AppLanguage, label: 'English' },
                { id: 'am' as AppLanguage, label: 'አማርኛ' },
                { id: 'om' as AppLanguage, label: 'Afaan Oromoo' },
              ].map((langOpt) => {
                const isSelected = localRules.language === langOpt.id;
                return (
                  <TouchableOpacity
                    key={langOpt.id}
                    style={[
                      styles.segmentItem,
                      isSelected && {
                        backgroundColor: isDark ? '#262626' : '#FFFFFF',
                        borderWidth: 1,
                        borderColor: isDark ? '#333333' : '#CBD5E1',
                      },
                    ]}
                    onPress={async () => {
                      updateRuleField('language', langOpt.id);
                      await setLanguage(langOpt.id);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.segmentLabel,
                        {
                          color: isSelected
                            ? colors.textPrimary
                            : colors.textSecondary,
                          fontWeight: isSelected ? '600' : '400',
                        },
                      ]}
                    >
                      {langOpt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Primary Save Action Button */}
          <TouchableOpacity
            style={[
              styles.saveButton,
              {
                backgroundColor: isDark ? '#FFFFFF' : '#0F172A',
              },
            ]}
            onPress={handleSave}
            activeOpacity={0.85}
            disabled={isSaving}
          >
            <Text
              style={[
                styles.saveButtonText,
                { color: isDark ? '#000000' : '#FFFFFF' },
              ]}
            >
              {savedSuccess ? t.savedSuccess : t.saveRules}
            </Text>
          </TouchableOpacity>

          {/* Section: Data & Maintenance (Destructive Actions in dedicated section) */}
          <View style={styles.sectionHeadingBox}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              {t.profileSectionData}
            </Text>
          </View>

          <View
            style={[
              styles.panel,
              {
                backgroundColor: colors.surface,
                borderColor: colors.surfaceBorder,
              },
            ]}
          >
            {/* Replay Welcome Tour */}
            <TouchableOpacity
              style={styles.utilityRow}
              onPress={handleReplayTour}
              activeOpacity={0.7}
            >
              <View style={styles.utilityTextContainer}>
                <Text style={[styles.utilityTitle, { color: colors.textPrimary }]}>
                  {t.profileReplayTour}
                </Text>
                <Text style={[styles.utilityDesc, { color: colors.textSecondary }]}>
                  {t.profileReplayTourSub}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>

            <View
              style={[styles.utilityDivider, { backgroundColor: colors.divider }]}
            />

            {/* Clear Verification History (Destructive) */}
            <TouchableOpacity
              style={styles.utilityRow}
              onPress={handleClearHistory}
              activeOpacity={0.7}
            >
              <View style={styles.utilityTextContainer}>
                <Text style={styles.destructiveTitle}>
                  {t.profileClearHistory}
                </Text>
                <Text style={[styles.utilityDesc, { color: colors.textSecondary }]}>
                  {t.profileClearConfirmSub}
                </Text>
              </View>
              <Ionicons name="trash-outline" size={16} color="#DC2626" />
            </TouchableOpacity>
          </View>

          {/* Architecture & Engine Specifications Well */}
          <View
            style={[
              styles.specWell,
              {
                backgroundColor: colors.surfaceSubtle,
                borderColor: colors.surfaceBorder,
              },
            ]}
          >
            <View style={styles.specRow}>
              <Text style={[styles.specLabel, { color: colors.textSecondary }]}>
                {t.profileEngineLabel}
              </Text>
              <Text style={[styles.specValue, { color: colors.textPrimary }]}>
                {t.profileEngineVal}
              </Text>
            </View>

            <View style={styles.specRow}>
              <Text style={[styles.specLabel, { color: colors.textSecondary }]}>
                {t.profileStorageLabel}
              </Text>
              <Text style={[styles.specValue, { color: colors.textPrimary }]}>
                {t.profileStorageVal}
              </Text>
            </View>

            <View style={styles.specRow}>
              <Text style={[styles.specLabel, { color: colors.textSecondary }]}>
                {t.profileVersionLabel}
              </Text>
              <Text style={[styles.specValue, { color: colors.textPrimary }]}>
                v1.2.0 (Build 2026.11)
              </Text>
            </View>
          </View>
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
    paddingHorizontal: 18,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  terminalBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  terminalBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  // KPI Divided Container
  kpiContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    marginBottom: 20,
    alignItems: 'center',
  },
  kpiCell: {
    flex: 1,
    alignItems: 'center',
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  kpiDivider: {
    width: 1,
    height: 28,
  },
  // Section Headings
  sectionHeadingBox: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  sectionMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  // Panel
  panel: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
  },
  fieldGroup: {
    marginBottom: 14,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    marginTop: 4,
  },
  switchTextBox: {
    flex: 1,
    paddingRight: 12,
  },
  switchTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  switchTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  activeTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  activeTagText: {
    fontSize: 10,
    fontWeight: '600',
  },
  switchDesc: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  previewBox: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    marginTop: 14,
    gap: 3,
  },
  previewHeading: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  previewDetail: {
    fontSize: 12,
  },
  // Segmented Groups
  segmentGroup: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    padding: 2,
    gap: 2,
    marginTop: 6,
  },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 6,
  },
  segmentLabel: {
    fontSize: 12,
  },
  saveButton: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Utility Items
  utilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  utilityTextContainer: {
    flex: 1,
    paddingRight: 12,
  },
  utilityTitle: {
    fontSize: 13,
    fontWeight: '500',
  },
  destructiveTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#DC2626',
  },
  utilityDesc: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  utilityDivider: {
    height: 1,
    marginVertical: 8,
  },
  // Spec Well
  specWell: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  specLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  specValue: {
    fontSize: 11,
    fontWeight: '500',
  },
});
