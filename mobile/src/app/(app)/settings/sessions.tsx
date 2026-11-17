import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RevokeOthersResponse, SessionsResponse } from '@two-cents/shared/contracts';
import * as Haptics from 'expo-haptics';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { apiRequest } from '@/auth/api-client';
import { errorMessage } from '@/auth/error-message';
import { Button, ErrorBanner, FormScreen } from '@/components/form';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { IconLabel } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const QUERY_KEY = ['me', 'sessions'];

/** US7: see signed-in devices and sign them out. */
export default function Sessions() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const sessions = useQuery({ queryKey: QUERY_KEY, queryFn: () => apiRequest('GET', '/v1/me/sessions', { schema: SessionsResponse }) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const revokeOne = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/v1/me/sessions/${id}`),
    onSuccess: refresh,
  });
  const revokeOthers = useMutation({
    mutationFn: () => apiRequest('POST', '/v1/me/sessions/revoke-others', { schema: RevokeOthersResponse }),
    onSuccess: async () => {
      setConfirming(false);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refresh();
    },
  });

  const date = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  const error = revokeOne.error ?? revokeOthers.error ?? sessions.error;
  const others = sessions.data?.sessions.filter((s) => !s.current) ?? [];

  return (
    <FormScreen>
      <Stack.Screen options={{ title: t('sessions.title') }} />
      {sessions.isPending ? <ActivityIndicator accessibilityLabel={t('common.loading')} /> : null}
      {sessions.data?.sessions.map((s) => (
        <View key={s.id} style={[styles.card, { backgroundColor: theme.backgroundElement }]} accessible accessibilityLabel={`${s.deviceName}, ${t(`sessions.platform.${s.platform}`)}${s.current ? `, ${t('sessions.thisDevice')}` : ''}`}>
          <View style={styles.cardHeader}>
            <View style={styles.device}>
              <Icon name={s.platform === 'web' ? 'globe' : 'phone'} size={18} />
              <ThemedText type="smallBold">{s.deviceName}</ThemedText>
            </View>
            {s.current ? (
              <IconLabel icon="check" label={t('sessions.thisDevice')} color={theme.success} />
            ) : null}
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {t(`sessions.platform.${s.platform}`)} · {t('sessions.signedIn', { date: date(s.signedInAt) })}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('sessions.lastActive', { date: date(s.lastActiveAt) })}
          </ThemedText>
          {!s.current ? (
            <Button
              label={t('sessions.signOutDevice')}
              variant="link"
              loading={revokeOne.isPending && revokeOne.variables === s.id}
              onPress={() => revokeOne.mutate(s.id)}
            />
          ) : null}
        </View>
      ))}
      <ErrorBanner message={error ? errorMessage(t, error) : null} />
      {others.length > 0 ? (
        confirming ? (
          <View style={styles.confirm}>
            <ThemedText>{t('sessions.confirmOthers', { count: others.length })}</ThemedText>
            <Button label={t('sessions.signOutOthers')} variant="danger" loading={revokeOthers.isPending} onPress={() => revokeOthers.mutate()} />
            <Button label={t('common.cancel')} variant="link" onPress={() => setConfirming(false)} />
          </View>
        ) : (
          <Button label={t('sessions.signOutOthers')} variant="secondary" onPress={() => setConfirming(true)} />
        )
      ) : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  device: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, flexShrink: 1 },
  card: { borderRadius: Radius.md, padding: Spacing.three, gap: Spacing.half },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  confirm: { gap: Spacing.two },
});
