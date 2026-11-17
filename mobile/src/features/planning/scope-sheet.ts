import type { Scope } from '@two-cents/shared/contracts';
import type { TFunction } from 'i18next';
import { ActionSheetIOS, Alert, Platform } from 'react-native';

/**
 * "From this month on" or "this month only" (FR-024), asked when the amounts of a recurring line
 * change. Resolves null when the person cancels.
 */
export function askScope(t: TFunction): Promise<Scope | null> {
  const options: { label: string; scope: Scope | null }[] = [
    { label: t('planning.scope.fromThisMonthOn'), scope: 'from_this_month_on' },
    { label: t('planning.scope.thisMonthOnly'), scope: 'this_month_only' },
    { label: t('planning.scope.cancel'), scope: null },
  ];
  return new Promise((resolve) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: t('planning.scope.title'), options: options.map((o) => o.label), cancelButtonIndex: 2 },
        (index) => resolve(options[index]?.scope ?? null),
      );
      return;
    }
    Alert.alert(
      t('planning.scope.title'),
      undefined,
      [
        { text: options[2].label, style: 'cancel', onPress: () => resolve(null) },
        { text: options[1].label, onPress: () => resolve('this_month_only') },
        { text: options[0].label, onPress: () => resolve('from_this_month_on') },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}
