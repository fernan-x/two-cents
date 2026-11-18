import type { TFunction } from 'i18next';
import { Alert } from 'react-native';

export type ClosedMonthChoice = 'reopen' | 'moveToCurrent' | 'cancel';

/** A write landed in a closed month (FR-044): reopen it (when allowed), record it this month, or wait. */
export function askClosedMonth(t: TFunction, canReopen: boolean): Promise<ClosedMonthChoice> {
  return new Promise((resolve) => {
    Alert.alert(
      t('tracking.closedMonth.title'),
      t('tracking.closedMonth.body'),
      [
        ...(canReopen ? [{ text: t('tracking.closedMonth.reopen'), onPress: () => resolve('reopen' as const) }] : []),
        { text: t('tracking.closedMonth.moveToCurrent'), onPress: () => resolve('moveToCurrent') },
        { text: t('tracking.closedMonth.cancel'), style: 'cancel' as const, onPress: () => resolve('cancel') },
      ],
      { cancelable: true, onDismiss: () => resolve('cancel') },
    );
  });
}
