// app/index.tsx — Entry point: routes to onboarding or tabs
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';
import { getOnboardingComplete } from '../lib/storage';
import { Colors } from '../lib/theme';

export default function EntryScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    (async () => {
      console.log('[PAGE: EntryScreen (app/index.tsx)] Step 1: Checking onboarding status in storage...');
      try {
        const done = await getOnboardingComplete();
        console.log('[PAGE: EntryScreen (app/index.tsx)] Step 2: Onboarding complete =', done);
        if (done) {
          console.log('[PAGE: EntryScreen (app/index.tsx)] Step 3: Navigating to /(tabs)');
          router.replace('/(tabs)');
        } else {
          console.log('[PAGE: EntryScreen (app/index.tsx)] Step 3: Navigating to /onboarding');
          router.replace('/onboarding');
        }
      } catch (err) {
        console.error('[PAGE: EntryScreen (app/index.tsx)] Failed checking onboarding:', err);
        router.replace('/(tabs)');
      } finally {
        setChecking(false);
      }
    })();
  }, [router]);

  if (checking) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primaryBlue} />
      </View>
    );
  }

  return null;
}
