import '@/i18n';

import {
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
  useFonts,
} from '@expo-google-fonts/geist';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SessionEndReason } from '@two-cents/shared/contracts';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setRefresher, setSessionEndedHandler } from '@/auth/api-client';
import { AuthProvider, useAuth } from '@/auth/auth-store';
import { bootstrapSession, refreshTokens } from '@/auth/bootstrap';
import { Colors } from '@/constants/theme';
import { LockScreen } from '@/lock/lock-screen';
import { useAppLock } from '@/lock/use-app-lock';

void SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const auth = useAuth();
  const [fontsLoaded, fontError] = useFonts({ Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold });
  const fontsReady = fontsLoaded || fontError != null;
  const [booted, setBooted] = useState(false);
  useAppLock();

  useEffect(() => {
    setSessionEndedHandler((reason) => void auth.signOutLocally(reason ?? 'expired'));
    setRefresher(async () => {
      try {
        return await refreshTokens();
      } catch (error) {
        const reason = (error as { details?: { reason?: SessionEndReason } }).details?.reason;
        await auth.signOutLocally(reason ?? 'expired');
        return false;
      }
    });
    void (async () => {
      const result = await bootstrapSession();
      if (result.kind === 'signedIn') auth.dispatch({ type: 'signedIn', me: result.me });
      else if (result.kind === 'ended') await auth.signOutLocally(result.reason);
      else auth.dispatch({ type: 'signedOut' });
      setBooted(true);
    })();
    // Runs once at startup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ready = booted && fontsReady;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  const signedIn = auth.status === 'signedIn' || auth.status === 'locked';
  const locked = auth.status === 'locked';
  return (
    <View style={styles.fill}>
      <View
        style={styles.fill}
        importantForAccessibility={locked ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={locked}>
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={auth.status === 'pendingDeletion'}>
        <Stack.Screen name="pending-deletion" />
      </Stack.Protected>
      <Stack.Protected guard={auth.status === 'signedOut'}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Screen name="l" options={{ presentation: 'modal' }} />
      {/* Invitation links work signed in or out (FR-015). */}
      <Stack.Screen name="i/[code]" />
    </Stack>
      </View>
      {locked ? <LockScreen /> : null}
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } });

const navLight = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, primary: Colors.light.primary, background: Colors.light.background, card: Colors.light.background, text: Colors.light.text, border: Colors.light.border },
};
const navDark = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, primary: Colors.dark.primary, background: Colors.dark.background, card: Colors.dark.background, text: Colors.dark.text, border: Colors.dark.border },
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <SafeAreaProvider>
      <ThemeProvider value={colorScheme === 'dark' ? navDark : navLight}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
