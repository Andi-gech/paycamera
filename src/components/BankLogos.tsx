// src/components/BankLogos.tsx — Optimized Bank Icon component using local WebP assets
import React from 'react';
import { View, Image, StyleSheet, ImageSourcePropType } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BankId } from '../../lib/types';

// Pre-resolved static WebP asset map for zero runtime lookups and instant bundle caching
const BANK_ICONS: Record<string, ImageSourcePropType> = {
  telebirr: require('../../assets/banks/telebirr.webp'),
  cbe: require('../../assets/banks/cbe.webp'),
  dashen: require('../../assets/banks/dashnbank.webp'),
  awash: require('../../assets/banks/awash.webp'),
};

interface BankLogoProps {
  bankId: BankId | string;
  size?: number;
  style?: object;
}

export const BankLogo = React.memo(function BankLogo({
  bankId,
  size = 40,
  style,
}: BankLogoProps) {
  const normalizedId = (bankId || '').toLowerCase().trim();
  const iconSource = BANK_ICONS[normalizedId];

  if (iconSource) {
    return (
      <View style={[styles.container, { width: size, height: size }, style]}>
        <Image
          source={iconSource}
          style={[styles.image, { width: size, height: size }]}
          resizeMode="cover"
        />
      </View>
    );
  }

  // Fallback icon for other/generic banks
  return (
    <View
      style={[
        styles.container,
        styles.fallbackContainer,
        { width: size, height: size, borderRadius: size * 0.28 },
        style,
      ]}
    >
      <Ionicons name="business" size={size * 0.52} color="#FFFFFF" />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  image: {
    borderRadius: 12,
  },
  fallbackContainer: {
    backgroundColor: '#64748B',
  },
});
