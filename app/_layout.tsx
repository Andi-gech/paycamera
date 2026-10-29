// app/_layout.tsx — Root Stack navigator with AppProvider
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProvider, useApp } from '../lib/AppContext';

function InnerLayout() {
  const { isDark } = useApp();
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="verify-result"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="receipt-details"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="scan-upload"
          options={{ animation: 'slide_from_bottom' }}
        />
      </Stack>
    </>
  );
}



export default function RootLayout() {
  return (
    <AppProvider>
      <InnerLayout />
    </AppProvider>
  );
}

