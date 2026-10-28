import React from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

interface BackgroundSvgProps {
  isDark: boolean;
}

/**
 * Clean, quiet ambient ground for banking interface.
 * Strictly adheres to anti-slop guidelines:
 * - No floating constellation dots
 * - No harsh glowing neon orbs
 * - Quiet, refined tone steps that let receipts and bank branding take center stage
 */
export function BackgroundSvg({ isDark }: BackgroundSvgProps) {
  const { width, height } = useWindowDimensions();

  const ground = isDark
    ? {
        accentAura: 'rgba(56, 189, 248, 0.035)',
        borderAura: 'rgba(255, 255, 255, 0.02)',
      }
    : {
        accentAura: 'rgba(2, 132, 199, 0.025)',
        borderAura: 'rgba(15, 23, 42, 0.015)',
      };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Subtle top-right ambient wash */}
      <View
        style={[
          styles.ambientWash,
          {
            width: width * 1.2,
            height: width * 1.2,
            borderRadius: (width * 1.2) / 2,
            backgroundColor: ground.accentAura,
            top: -width * 0.4,
            right: -width * 0.4,
          },
        ]}
      />

      {/* Quiet architectural arc */}
      <View
        style={[
          styles.quietArc,
          {
            width: width * 1.4,
            height: width * 1.4,
            borderRadius: (width * 1.4) / 2,
            borderColor: ground.borderAura,
            top: -width * 0.5,
            right: -width * 0.3,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  ambientWash: {
    position: 'absolute',
  },
  quietArc: {
    position: 'absolute',
    borderWidth: 1,
  },
});
