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
      const done = await getOnboardingComplete();
      // Replace so user can't go "back" to the splash
      if (done) {
        router.replace('/(tabs)');
      } else {
        router.replace('/onboarding');
      }
      setChecking(false);
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
