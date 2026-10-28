import React from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  View,
} from 'react-native';

interface VerificationLoadingOverlayProps {
  visible: boolean;
  bankName: string;
  isDark: boolean;
  reference?: string;
}

/**
 * Honest, anti-slop verification loading state.
 * Inspired by Apple Pay and Stripe: calm, quiet, and truthful.
 * No sci-fi radar rings, no fake cryptographic step rotators, no looping vanity bars.
 */
export function VerificationLoadingOverlay({
  visible,
  bankName,
  isDark,
  reference,
}: VerificationLoadingOverlayProps) {
  if (!visible) return null;

  const bgModal = isDark ? 'rgba(0, 0, 0, 0.75)' : 'rgba(15, 23, 42, 0.45)';
  const cardBg = isDark ? '#141417' : '#FFFFFF';
  const cardBorder = isDark ? '#27272A' : '#E2E8F0';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const spinnerColor = isDark ? '#38BDF8' : '#0284C7';

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={[styles.backdrop, { backgroundColor: bgModal }]}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: cardBg,
              borderColor: cardBorder,
            },
          ]}
        >
          {/* Restrained, precise activity indicator */}
          <View style={styles.spinnerWrapper}>
            <ActivityIndicator size="small" color={spinnerColor} />
          </View>

          {/* Direct, honest copy */}
          <Text style={[styles.title, { color: textPrimary }]}>
            Verifying Receipt
          </Text>

          <Text style={[styles.subtitle, { color: textSecondary }]}>
            {bankName
              ? `Checking official portal with ${bankName}…`
              : 'Checking official bank portal…'}
          </Text>

          {reference ? (
            <View
              style={[
                styles.referenceBadge,
                {
                  backgroundColor: isDark ? '#1F1F23' : '#F1F5F9',
                  borderColor: isDark ? '#2E2E33' : '#E2E8F0',
                },
              ]}
            >
              <Text style={[styles.referenceText, { color: textSecondary }]}>
                {reference}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

/**
 * Clean, restrained scan indicator.
 * No 90s sci-fi laser sweeps — just clean reticle awareness.
 */
export function ViewfinderLaserBeam({ active }: { active: boolean }) {
  // Purposefully quiet: returning null removes the cheesy laser sweep,
  // letting the clean viewfinder corner reticles and status copy speak for themselves.
  if (!active) return null;
  return null;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 300,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: 'center',
    // Quiet elevation - no dramatic glowing neon dropshadows
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  spinnerWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
    textAlign: 'center',
  },
  referenceBadge: {
    marginTop: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  referenceText: {
    fontSize: 11,
    fontWeight: '500',
    fontFamily: 'monospace',
    letterSpacing: 0.5,
  },
});
