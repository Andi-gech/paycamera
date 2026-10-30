// src/components/NoNetworkModal.tsx — Compact Dynamic Island Network Pill
import React, { useEffect, useRef } from 'react';
import {
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Platform,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../lib/AppContext';
import { useNetwork } from '../../lib/NetworkContext';

export function NoNetworkModal() {
  const insets = useSafeAreaInsets();
  const { colors, t, isDark } = useApp();
  const {
    isModalVisible,
    checkConnection,
    isChecking,
    justRestored,
  } = useNetwork();

  const translateY = useRef(new Animated.Value(-100)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation for the offline indicator dot
  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;
    if (isModalVisible && !justRestored) {
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.3,
            duration: 750,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 750,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
    } else {
      pulseAnim.setValue(1);
    }
    return () => {
      animation?.stop();
    };
  }, [isModalVisible, justRestored, pulseAnim]);

  // Slide in / slide out animation
  useEffect(() => {
    if (isModalVisible) {
      Animated.spring(translateY, {
        toValue: 0,
        damping: 14,
        mass: 0.8,
        stiffness: 140,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(translateY, {
        toValue: -120,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
  }, [isModalVisible, translateY]);

  const handleRetry = async () => {
    if (isChecking) return;
    await checkConnection();
  };

  if (!isModalVisible) {
    return null;
  }

  const topPosition = Math.max(insets.top + (Platform.OS === 'ios' ? 4 : 8), 10);

  // Dynamic Island when connection was just restored
  if (justRestored) {
    return (
      <Animated.View
        style={[
          styles.container,
          {
            top: topPosition,
            transform: [{ translateY }],
          },
        ]}
      >
        <View
          style={[
            styles.islandPill,
            isDark ? styles.restoredDark : styles.restoredLight,
          ]}
        >
          <View style={styles.restoredBadge}>
            <Ionicons name="checkmark" size={13} color="#FFFFFF" />
          </View>
          <Text
            style={[
              styles.pillText,
              { color: isDark ? '#ECFDF5' : '#065F46' },
            ]}
            numberOfLines={1}
          >
            {t.networkRestored || 'Back Online'}
          </Text>
        </View>
      </Animated.View>
    );
  }

  // Compact Offline Island View
  return (
    <Animated.View
      style={[
        styles.container,
        {
          top: topPosition,
          transform: [{ translateY }],
        },
      ]}
    >
      <TouchableOpacity
        style={[
          styles.islandPill,
          isDark ? styles.offlineDark : styles.offlineLight,
        ]}
        activeOpacity={0.85}
        onPress={handleRetry}
      >
        {/* Pulsing Offline Indicator */}
        <Animated.View
          style={[
            styles.dotOuter,
            {
              opacity: pulseAnim,
              backgroundColor: isDark
                ? 'rgba(239, 68, 68, 0.25)'
                : 'rgba(239, 68, 68, 0.15)',
            },
          ]}
        >
          <View style={styles.dotInner} />
        </Animated.View>

        {/* Localized Label */}
        <Text
          style={[
            styles.pillText,
            { color: isDark ? '#F4F4F5' : '#0F172A' },
          ]}
          numberOfLines={1}
        >
          {t.noNetworkTitle}
        </Text>

        {/* Retry Symbol Button */}
        <TouchableOpacity
          style={[
            styles.retryIconBtn,
            {
              backgroundColor: isDark ? '#27272A' : '#F1F5F9',
            },
          ]}
          onPress={handleRetry}
          disabled={isChecking}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          {isChecking ? (
            <ActivityIndicator
              size="small"
              color={isDark ? '#F87171' : '#DC2626'}
              style={{ transform: [{ scale: 0.65 }] }}
            />
          ) : (
            <Ionicons
              name="refresh"
              size={13}
              color={isDark ? '#F87171' : '#DC2626'}
            />
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 999999,
    pointerEvents: 'box-none',
  },
  islandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 22,
    borderWidth: 1,
    minHeight: 38,
    maxWidth: 320,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 8,
  },
  // Offline Styles
  offlineLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    shadowOpacity: 0.12,
  },
  offlineDark: {
    backgroundColor: '#121214',
    borderColor: '#27272A',
    shadowOpacity: 0.45,
  },
  // Restored Styles
  restoredLight: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    shadowOpacity: 0.1,
  },
  restoredDark: {
    backgroundColor: '#052E16',
    borderColor: '#14532D',
    shadowOpacity: 0.35,
  },
  // Indicator dot
  dotOuter: {
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  dotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },
  // Restored badge
  restoredBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  pillText: {
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginRight: 10,
  },
  retryIconBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
