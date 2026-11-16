import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function AuthLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal', headerTitle: '', headerShadowVisible: false }}>
      <Stack.Screen name="welcome" options={{ headerShown: false, title: t('common.appName') }} />
    </Stack>
  );
}
