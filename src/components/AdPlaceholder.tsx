// src/components/AdPlaceholder.tsx — Clean, Impeccable Google AdMob Placeholder
import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../lib/AppContext';

export type AdVariant = 'banner' | 'native' | 'rectangle';

interface AdPlaceholderProps {
  variant?: AdVariant;
  style?: ViewStyle;
}

export const AdPlaceholder = React.memo(function AdPlaceholder({
  variant = 'banner',
  style,
}: AdPlaceholderProps) {
  const { colors, isDark } = useApp();

  if (variant === 'native') {
    return (
      <View
        style={[
          styles.nativeContainer,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
          style,
        ]}
      >
        {/* Top Meta Header: Ad Badge & Sponsor info */}
        <View style={styles.metaRow}>
          <View style={[styles.adBadge, { backgroundColor: isDark ? '#262626' : '#E2E8F0' }]}>
            <Text style={[styles.adBadgeText, { color: colors.inkMuted }]}>AD</Text>
          </View>
          <Text style={[styles.sponsoredText, { color: colors.inkFaint }]}>Google AdMob Sponsored</Text>
        </View>

        {/* Content Body */}
        <View style={styles.nativeContent}>
          <View style={[styles.adMediaBox, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
            <Ionicons name="sparkles" size={18} color={colors.accent} />
          </View>

          <View style={styles.nativeTextWrap}>
            <Text style={[styles.adHeadline, { color: colors.ink }]} numberOfLines={1}>
              Sponsored Merchant Service
            </Text>
            <Text style={[styles.adBodyText, { color: colors.inkMuted }]} numberOfLines={1}>
              Fast business tools & instant settlement
            </Text>
          </View>

          <View style={[styles.ctaPill, { backgroundColor: colors.accentSubtle, borderColor: colors.accent }]}>
            <Text style={[styles.ctaText, { color: colors.accent }]}>Install</Text>
          </View>
        </View>
      </View>
    );
  }

  if (variant === 'rectangle') {
    return (
      <View
        style={[
          styles.rectangleContainer,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
          style,
        ]}
      >
        <View style={styles.metaRow}>
          <View style={[styles.adBadge, { backgroundColor: isDark ? '#262626' : '#E2E8F0' }]}>
            <Text style={[styles.adBadgeText, { color: colors.inkMuted }]}>SPONSORED</Text>
          </View>
          <Text style={[styles.sponsoredText, { color: colors.inkFaint }]}>Google AdMob (300 × 120)</Text>
        </View>

        <View style={[styles.rectInner, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
          <Ionicons name="megaphone-outline" size={24} color={colors.accent} style={{ marginBottom: 6 }} />
          <Text style={[styles.adHeadline, { color: colors.ink }]}>Google Mobile Ads Placeholder</Text>
          <Text style={[styles.adSubSmall, { color: colors.inkFaint }]}>
            Targeted native ad will render seamlessly here
          </Text>
        </View>
      </View>
    );
  }

  // Default: Adaptive Banner (320 × 50 / 360 × 60)
  return (
    <View
      style={[
        styles.bannerContainer,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      <View style={[styles.adBadge, { backgroundColor: isDark ? '#262626' : '#E2E8F0' }]}>
        <Text style={[styles.adBadgeText, { color: colors.inkMuted }]}>AD</Text>
      </View>

      <View style={styles.bannerCenter}>
        <Text style={[styles.bannerTitle, { color: colors.ink }]}>
          Google AdMob Adaptive Banner
        </Text>
        <Text style={[styles.bannerSub, { color: colors.inkFaint }]}>
          Reserved monetization space (320 × 50)
        </Text>
      </View>

      <Ionicons name="open-outline" size={15} color={colors.inkFaint} style={{ marginRight: 2 }} />
    </View>
  );
});

const styles = StyleSheet.create({
  // Banner Variant
  bannerContainer: {
    width: '100%',
    height: 56,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 10,
  },
  bannerCenter: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  bannerSub: {
    fontSize: 10.5,
    marginTop: 1,
  },

  // Native In-Feed Variant
  nativeContainer: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  adBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 3.5,
  },
  adBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  sponsoredText: {
    fontSize: 10,
    fontWeight: '500',
  },
  nativeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  adMediaBox: {
    width: 38,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nativeTextWrap: {
    flex: 1,
  },
  adHeadline: {
    fontSize: 12.5,
    fontWeight: '600',
    marginBottom: 2,
  },
  adBodyText: {
    fontSize: 11,
  },
  ctaPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  ctaText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // Rectangle Variant
  rectangleContainer: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  rectInner: {
    width: '100%',
    height: 96,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  adSubSmall: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 2,
  },
});

