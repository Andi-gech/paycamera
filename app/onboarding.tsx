// app/onboarding.tsx — Full-screen dark onboarding matching reference screen 1
import React, { useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Dimensions,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { setOnboardingComplete } from '../lib/storage';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '../lib/theme';

const { width, height } = Dimensions.get('window');
const APP_LOGO = require('../assets/LikPay_Fast_Payment_Logo-removebg-preview.webp');

const features = [
  {
    icon: 'shield-checkmark' as const,
    title: 'Official verification',
    subtitle: 'Get real bank / issuer data',
    color: '#00E676',
  },
  {
    icon: 'flash' as const,
    title: 'Fast & secure',
    subtitle: 'Quick and reliable checks',
    color: '#00E5FF',
  },
  {
    icon: 'shield' as const,
    title: 'Trusted by thousands',
    subtitle: 'For your peace of mind',
    color: '#29B6F6',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();

  useEffect(() => {
    console.log('[PAGE: Onboarding (app/onboarding.tsx)] Mounted');
  }, []);

  const handleGetStarted = async () => {
    console.log('[PAGE: Onboarding] "Get Started" pressed, setting onboarding complete...');
    await setOnboardingComplete();
    console.log('[PAGE: Onboarding] Navigating to /(tabs)');
    router.replace('/(tabs)');
  };

  return (
    <View style={styles.container}>
      {/* Native Pure CSS Layered Waves (no unlinked native libraries) */}
      <View style={styles.waveOverlay} pointerEvents="none">
        <View style={styles.waveLayer1} />
        <View style={styles.waveLayer2} />
        <View style={styles.waveLayer3} />
        <View style={styles.waveCircle1} />
        <View style={styles.waveCircle2} />
      </View>

      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          {/* Official LikPay Brand Logo */}
          <View style={styles.logoWrap}>
            <View style={styles.onboardingLogoBox}>
              <Image
                source={APP_LOGO}
                style={styles.onboardingLogo}
                resizeMode="contain"
              />
            </View>
          </View>

          <Text style={styles.tagline}>
            Verify your transactions{'\n'}with confidence
          </Text>

          {/* Feature List */}
          <View style={styles.featureList}>
            {features.map((f, i) => (
              <View key={i} style={styles.featureItem}>
                <View style={[styles.featureIconWrap, { backgroundColor: f.color + '22' }]}>
                  <Ionicons name={f.icon} size={22} color={f.color} />
                </View>
                <View style={styles.featureText}>
                  <Text style={styles.featureTitle}>{f.title}</Text>
                  <Text style={styles.featureSubtitle}>{f.subtitle}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Bottom CTA Actions */}
        <View style={styles.bottomArea}>
          <TouchableOpacity
            style={styles.getStartedBtn}
            onPress={handleGetStarted}
            activeOpacity={0.88}
          >
            <Text style={styles.getStartedText}>Get Started</Text>
            <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleGetStarted}
            style={styles.loginLink}
            activeOpacity={0.7}
          >
            <Text style={styles.loginLinkText}>I already have an account</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A1D37',
  },
  waveOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  waveLayer1: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '60%',
    backgroundColor: '#0A1D37',
  },
  waveLayer2: {
    position: 'absolute',
    top: '35%',
    left: 0,
    right: 0,
    height: '40%',
    backgroundColor: '#0F3460',
    opacity: 0.85,
  },
  waveLayer3: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '35%',
    backgroundColor: '#059669',
    opacity: 0.95,
  },
  waveCircle1: {
    position: 'absolute',
    bottom: -width * 0.35,
    left: -width * 0.3,
    width: width * 1.6,
    height: width * 1.6,
    borderRadius: (width * 1.6) / 2,
    backgroundColor: '#059669',
    opacity: 0.5,
  },
  waveCircle2: {
    position: 'absolute',
    bottom: -width * 0.55,
    right: -width * 0.35,
    width: width * 1.7,
    height: width * 1.7,
    borderRadius: (width * 1.7) / 2,
    backgroundColor: '#10B981',
    opacity: 0.35,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'center',
    paddingTop: 10,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 20,
  },
  onboardingLogoBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 22,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 4,
  },
  onboardingLogo: {
    width: 170,
    height: 75,
  },
  tagline: {
    fontSize: 16,
    color: '#CBD5E1',
    textAlign: 'center',
    lineHeight: 23,
    marginBottom: 38,
  },
  featureList: {
    gap: 22,
    paddingHorizontal: 4,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  featureIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  featureSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
  },
  bottomArea: {
    paddingHorizontal: 28,
    paddingBottom: 24,
    alignItems: 'center',
  },
  getStartedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#10B981',
    borderRadius: 28,
    paddingVertical: 16,
    width: '100%',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 4,
  },
  getStartedText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  loginLink: {
    marginTop: 16,
    paddingVertical: 6,
  },
  loginLinkText: {
    fontSize: 14,
    color: '#94A3B8',
  },
});
