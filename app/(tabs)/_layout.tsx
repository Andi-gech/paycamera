// app/(tabs)/_layout.tsx — Crisp, Functional Bottom Tab Navigation
import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../lib/AppContext';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { colors, t, isDark } = useApp();

  // Generous, natural breathing room above home gestures and navigation bars
  const bottomInset = Math.max(insets.bottom, 14);
  const tabHeight = 62 + bottomInset;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.inkFaint,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: -2,
          letterSpacing: 0.1,
        },
        tabBarStyle: {
          backgroundColor: colors.tabGround,
          borderTopWidth: 1,
          borderTopColor: colors.tabBorder,
          height: tabHeight,
          paddingBottom: bottomInset,
          paddingTop: 8,
          elevation: 0,
          shadowOpacity: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t.tabHome,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'shield-checkmark' : 'shield-checkmark-outline'}
              size={size - 1}
              color={color as string}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: t.tabHistory,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'file-tray-full' : 'file-tray-outline'}
              size={size - 1}
              color={color as string}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t.tabSettings,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'options' : 'options-outline'}
              size={size - 1}
              color={color as string}
            />
          ),
        }}
      />
    </Tabs>
  );
}
