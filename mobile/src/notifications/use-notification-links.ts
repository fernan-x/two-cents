import * as Notifications from 'expo-notifications';
import { type Href, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

/** Opens the screen a tapped push points to (`data.url`, contracts/links-and-notifications.md). */
function useNativeNotificationLinks(enabled: boolean): void {
  const router = useRouter();
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !response) return;
    const id = response.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    const url = response.notification.request.content.data?.url;
    if (typeof url === 'string' && url.startsWith('/')) router.push(url as Href);
  }, [enabled, response, router]);
}

/** No push notifications on web: nothing to open. */
export const useNotificationLinks: (enabled: boolean) => void =
  Platform.OS === 'web' ? () => undefined : useNativeNotificationLinks;
