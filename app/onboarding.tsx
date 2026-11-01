// app/onboarding.tsx — Impeccable, Fully Resolved First-Run Experience
import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { setOnboardingComplete } from '../lib/storage';
import { useApp } from '../lib/AppContext';
import { BankLogo } from '../src/components/BankLogos';
import type { AppLanguage } from '../lib/rules';

const APP_LOGO = require('../assets/LikPay_Fast_Payment_Logo-removebg-preview.webp');

export default function OnboardingScreen() {
  const router = useRouter();
  const { t, language, setLanguage, colors, isDark } = useApp();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleGetStarted = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await setOnboardingComplete();
      router.replace('/(tabs)');
    } catch {
      router.replace('/(tabs)');
    } finally {
      setIsSubmitting(false);
    }
  };

  const languages: { id: AppLanguage; label: string }[] = [
    { id: 'en', label: 'English' },
    { id: 'am', label: 'አማርኛ' },
    { id: 'om', label: 'Oromoo' },
  ];

  const highlights = [
    {
      icon: 'shield-checkmark-outline' as const,
      title: t.onboardingSlide1Title,
      subtitle: t.onboardingSlide1Sub,
    },
    {
      icon: 'server-outline' as const,
      title: t.onboardingSlide2Title,
      subtitle: t.onboardingSlide2Sub,
    },
    {
      icon: 'lock-closed-outline' as const,
      title: t.onboardingSlide3Title,
      subtitle: t.onboardingSlide3Sub,
    },
  ];

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      {/* Top Bar: Brand Logo, Generous Language Selector, Skip Action */}
      <View style={styles.topBar}>
        <View
          style={[
            styles.brandBox,
            {
              backgroundColor: isDark ? '#141414' : '#FFFFFF',
              borderColor: colors.surfaceBorder,
            },
          ]}
        >
          <Image
            source={APP_LOGO}
            style={styles.brandImage}
            resizeMode="contain"
          />
        </View>

        <View style={styles.topRightActions}>
          {/* Trilingual Segmented Switcher with >=44px Effective Touch Target */}
          <View
            style={[
              styles.langSegment,
              {
                backgroundColor: colors.surfaceSubtle,
                borderColor: colors.surfaceBorder,
              },
            ]}
          >
            {languages.map((l) => {
              const isSelected = language === l.id;
              return (
                <TouchableOpacity
                  key={l.id}
                  style={[
                    styles.langPill,
                    isSelected && {
                      backgroundColor: colors.surface,
                      borderWidth: 1,
                      borderColor: colors.surfaceBorder,
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: isDark ? 0 : 0.08,
                      shadowRadius: 2,
                      elevation: isDark ? 0 : 1,
                    },
                  ]}
                  onPress={() => setLanguage(l.id)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Switch language to ${l.label}`}
                >
                  <Text
                    style={[
                      styles.langText,
                      {
                        color: isSelected
                          ? colors.textPrimary
                          : colors.textSecondary,
                        fontWeight: isSelected ? '600' : '400',
                      },
                    ]}
                  >
                    {l.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Skip Link with Accessible HitSlop */}
          <TouchableOpacity
            style={styles.skipBtn}
            onPress={handleGetStarted}
            activeOpacity={0.7}
            disabled={isSubmitting}
            hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Skip onboarding"
          >
            <Text style={[styles.skipText, { color: colors.textSecondary }]}>
              {t.onboardingSkip}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Hero Section: Unified Color Tokens & Executive Presence */}
        <View style={styles.heroSection}>
          <View
            style={[
              styles.heroEmblem,
              {
                backgroundColor: colors.primaryLight,
                borderColor: colors.surfaceBorder,
              },
            ]}
          >
            <Ionicons
              name="shield-checkmark"
              size={32}
              color={colors.primaryBlue}
            />
          </View>

          <Text style={[styles.headline, { color: colors.textPrimary }]}>
            {t.onboardingHeadline}
          </Text>
          <Text style={[styles.subheadline, { color: colors.textSecondary }]}>
            {t.onboardingSubtitle}
          </Text>
        </View>

        {/* 3 Value Pillars */}
        <View style={styles.featureList}>
          {highlights.map((item, idx) => (
            <View
              key={idx}
              style={[
                styles.featureCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.surfaceBorder,
                },
              ]}
            >
              <View
                style={[
                  styles.featureIconWrap,
                  {
                    backgroundColor: colors.surfaceSubtle,
                    borderColor: colors.surfaceBorder,
                  },
                ]}
              >
                <Ionicons
                  name={item.icon}
                  size={20}
                  color={colors.primaryBlue}
                />
              </View>
              <View style={styles.featureTextWrap}>
                <Text
                  style={[styles.featureTitle, { color: colors.textPrimary }]}
                >
                  {item.title}
                </Text>
                <Text
                  style={[
                    styles.featureSubtitle,
                    { color: colors.textSecondary },
                  ]}
                >
                  {item.subtitle}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Supported Banking Channels Strip */}
        <View style={styles.supportedBanksWrap}>
          <Text style={[styles.supportedLabel, { color: colors.textSecondary }]}>
            Supported Banks & Gateways
          </Text>
          <View style={styles.bankPillsRow}>
            {(['telebirr', 'cbe', 'awash', 'boa', 'dashen'] as const).map(
              (bankId) => (
                <View
                  key={bankId}
                  style={[
                    styles.bankPill,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.surfaceBorder,
                    },
                  ]}
                >
                  <BankLogo bankId={bankId} size={22} />
                </View>
              )
            )}
          </View>
        </View>
      </ScrollView>

      {/* Bottom CTA Area: Loading State + Reassuring Local-First Trust Microcopy */}
      <View
        style={[
          styles.bottomArea,
          {
            backgroundColor: colors.background,
            borderTopColor: colors.divider,
          },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.ctaButton,
            {
              backgroundColor: isDark ? '#FFFFFF' : '#0F172A',
              opacity: isSubmitting ? 0.75 : 1,
            },
          ]}
          onPress={handleGetStarted}
          activeOpacity={0.88}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator
              size="small"
              color={isDark ? '#000000' : '#FFFFFF'}
            />
          ) : (
            <>
              <Text
                style={[
                  styles.ctaButtonText,
                  { color: isDark ? '#000000' : '#FFFFFF' },
                ]}
              >
                {t.onboardingGetStarted}
              </Text>
              <Ionicons
                name="arrow-forward"
                size={16}
                color={isDark ? '#000000' : '#FFFFFF'}
              />
            </>
          )}
        </TouchableOpacity>

        {/* Reassuring Offline / Local-First Microcopy (Replaces Fake Account Link) */}
        <View style={styles.privacyNoteRow}>
          <Ionicons
            name="lock-closed-outline"
            size={13}
            color={colors.textSecondary}
          />
          <Text style={[styles.privacyNoteText, { color: colors.textSecondary }]}>
            {t.onboardingPrivacyNote}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 8,
  },
  brandBox: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  brandImage: {
    width: 66,
    height: 24,
  },
  topRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  langSegment: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    padding: 2,
    gap: 2,
  },
  langPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  langText: {
    fontSize: 12,
  },
  skipBtn: {
    paddingVertical: 6,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  heroSection: {
    alignItems: 'center',
    textAlign: 'center',
    marginBottom: 26,
  },
  heroEmblem: {
    width: 64,
    height: 64,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  headline: {
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: -0.4,
    textAlign: 'center',
    marginBottom: 6,
  },
  subheadline: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    maxWidth: 320,
  },
  featureList: {
    gap: 12,
    marginBottom: 26,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  featureIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTextWrap: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 3,
  },
  featureSubtitle: {
    fontSize: 12,
    lineHeight: 17,
  },
  supportedBanksWrap: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  supportedLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 10,
  },
  bankPillsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  bankPill: {
    width: 38,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomArea: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    paddingVertical: 15,
    width: '100%',
    minHeight: 48,
  },
  ctaButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  privacyNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  privacyNoteText: {
    fontSize: 12,
    fontWeight: '400',
  },
});
