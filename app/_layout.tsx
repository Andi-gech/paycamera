// app/_layout.tsx — Root Stack navigator with AppProvider and NetworkProvider
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProvider, useApp } from '../lib/AppContext';
import { NetworkProvider } from '../lib/NetworkContext';
import { NoNetworkModal } from '../src/components/NoNetworkModal';

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
        <Stack.Screen
          name="batch-verify"
          options={{ animation: 'slide_from_bottom' }}
        />
      </Stack>
      <NoNetworkModal />
    </>
  );
}

export default function RootLayout() {
  return (
    <AppProvider>
      <NetworkProvider>
        <InnerLayout />
      </NetworkProvider>
    </AppProvider>
  );
}

