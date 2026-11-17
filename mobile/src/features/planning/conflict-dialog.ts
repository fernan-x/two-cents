import type { TFunction } from 'i18next';
import { Alert } from 'react-native';

import { ApiError } from '@/auth/api-client';

/** The up-to-date resource of a 409 STALE_STATE (FR-034), or null for any other error. */
export function staleCurrent<T extends { version: number }>(error: unknown): T | null {
  if (error instanceof ApiError && error.code === 'STALE_STATE' && error.details.current)
    return error.details.current as T;
  return null;
}

/**
 * Someone else saved first (FR-034): show their value next to ours and let the person keep theirs
 * (re-send on top of the new version) or keep the other one (discard the edit).
 */
export function askConflict(t: TFunction, values: { theirs: string; mine: string }): Promise<'mine' | 'theirs'> {
  return new Promise((resolve) => {
    Alert.alert(
      t('planning.conflict.title'),
      t('planning.conflict.body', values),
      [
        { text: t('planning.conflict.keepTheirs'), style: 'cancel', onPress: () => resolve('theirs') },
        { text: t('planning.conflict.keepMine'), onPress: () => resolve('mine') },
      ],
      { cancelable: true, onDismiss: () => resolve('theirs') },
    );
  });
}
