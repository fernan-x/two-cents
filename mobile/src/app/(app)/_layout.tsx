import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="onboarding/choose" options={{ headerShown: false }} />
    </Stack>
  );
}
