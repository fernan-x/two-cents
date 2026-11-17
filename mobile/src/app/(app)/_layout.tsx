import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { setupOnlineManager } from '@/features/planning/online';
import { registerForPush } from '@/notifications/push-registration';
import { useNotificationLinks } from '@/notifications/use-notification-links';

// Connectivity drives TanStack Query's online state (spec 003 research R17).
setupOnlineManager();

export default function AppLayout() {
  const { t } = useTranslation();
  useNotificationLinks(true);
  // Signed in: refresh this session's push token when the permission was already given (R8).
  useEffect(() => {
    void registerForPush({ prompt: false });
  }, []);
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="onboarding/choose" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding/join-code" options={{ title: '' }} />
      <Stack.Screen name="budgets/new" options={{ title: t('budgets.new.title') }} />
      <Stack.Screen
        name="budgets/picker"
        options={{
          title: t('budgets.picker.title'),
          presentation: 'formSheet',
          sheetAllowedDetents: [0.6, 1],
          sheetGrabberVisible: true,
        }}
      />
      <Stack.Screen name="budgets/[budgetId]" options={{ headerShown: false }} />
    </Stack>
  );
}
