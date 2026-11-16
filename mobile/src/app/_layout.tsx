import '@/i18n';

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
import { LockScreen } from '@/lock/lock-screen';
import { useAppLock } from '@/lock/use-app-lock';

void SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const auth = useAuth();
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
      await SplashScreen.hideAsync();
    })();
    // Runs once at startup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!booted) return null;

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
      <Stack.Screen name="(links)" options={{ presentation: 'modal' }} />
    </Stack>
      </View>
      {locked ? <LockScreen /> : null}
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } });

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <SafeAreaProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
