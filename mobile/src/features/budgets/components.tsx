import type { MemberView, Role } from '@two-cents/shared/contracts';
import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { formatMoney } from './format';
import { roleLabel } from './role-label';

/** A rounded group of rows, the same surface as 001's settings cards. */
export function Card({ children, accessibilityLabel }: { children: ReactNode; accessibilityLabel?: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]} accessibilityLabel={accessibilityLabel}>
      {children}
    </View>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return (
    <ThemedText type="smallBold" themeColor="textSecondary" accessibilityRole="header" style={styles.section}>
      {children}
    </ThemedText>
  );
}

/** One choice of a single-choice list; selection is shown by a mark and announced, not by color alone. */
export function ChoiceRow({
  label,
  detail,
  selected,
  onPress,
  disabled,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      disabled={disabled}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [
        styles.choice,
        { borderColor: selected ? theme.primary : theme.border, opacity: disabled ? 0.6 : pressed ? 0.85 : 1 },
      ]}>
      <ThemedText style={[styles.mark, { color: selected ? theme.primary : theme.textSecondary }]}>
        {selected ? '●' : '○'}
      </ThemedText>
      <View style={styles.choiceText}>
        <ThemedText type="smallBold">{label}</ThemedText>
        {detail ? (
          <ThemedText type="small" themeColor="textSecondary">
            {detail}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

/** − 28 + : the start day, 1 to 28 (FR-001). */
export function DayStepper({
  value,
  onChange,
  label,
  disabled,
}: {
  value: number;
  onChange: (day: number) => void;
  label: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const set = (day: number) => {
    if (day < 1 || day > 28) return;
    void Haptics.selectionAsync();
    onChange(day);
  };
  return (
    <View style={styles.stepperBlock}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <View
        style={styles.stepper}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: 1, max: 28, now: value, text: t('budgets.new.startDayValue', { day: value }) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => set(e.nativeEvent.actionName === 'increment' ? value + 1 : value - 1)}>
        <StepButton label="−" a11y={t('budgets.new.decrease')} disabled={disabled || value <= 1} onPress={() => set(value - 1)} />
        <ThemedText type="subtitle" style={[styles.stepValue, { color: theme.text }]}>
          {value}
        </ThemedText>
        <StepButton label="+" a11y={t('budgets.new.increase')} disabled={disabled || value >= 28} onPress={() => set(value + 1)} />
      </View>
    </View>
  );
}

function StepButton({ label, a11y, onPress, disabled }: { label: string; a11y: string; onPress: () => void; disabled: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityLabel={a11y}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.stepButton, { backgroundColor: theme.backgroundSelected, opacity: disabled ? 0.4 : 1 }]}>
      <ThemedText type="subtitle">{label}</ThemedText>
    </Pressable>
  );
}

/** A person in the budget: avatar, name, role in words, and this month's income (visible to all, FR-025a). */
export function MemberRow({ member, onPress }: { member: MemberView; onPress?: () => void }) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const income = member.role === 'viewer' ? null : member.currentMonthIncome;
  const name = member.isMe ? `${member.displayName} (${t('budgets.me')})` : member.displayName;
  const incomeText = member.role === 'viewer' ? '' : income ? formatMoney(income, i18n.language) : t('budgets.home.noIncome');
  const content = (
    <>
      <Avatar firstName={member.displayName} avatarKey={member.avatarKey} colorKey={member.colorKey} size={40} />
      <View style={styles.memberText}>
        <ThemedText type="smallBold">{name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {roleLabel(t, member.role)}
          {incomeText ? ` · ${incomeText}` : ''}
        </ThemedText>
      </View>
      {onPress ? <ThemedText themeColor="textSecondary">›</ThemedText> : null}
    </>
  );
  const label = `${name}, ${roleLabel(t, member.role)}${incomeText ? `, ${incomeText}` : ''}`;
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.member, { opacity: pressed ? 0.7 : 1, borderColor: theme.border }]}>
      {content}
    </Pressable>
  ) : (
    <View accessible accessibilityLabel={label} style={[styles.member, { borderColor: theme.border }]}>
      {content}
    </View>
  );
}

export function RoleChoices({
  value,
  onChange,
  roles = ['member', 'admin', 'viewer'],
}: {
  value: Exclude<Role, 'owner'>;
  onChange: (role: Exclude<Role, 'owner'>) => void;
  roles?: Exclude<Role, 'owner'>[];
}) {
  const { t } = useTranslation();
  return (
    <View accessibilityRole="radiogroup" style={styles.choices}>
      {roles.map((role) => (
        <ChoiceRow
          key={role}
          label={roleLabel(t, role)}
          detail={t(`budgets.roleHelp.${role}`)}
          selected={value === role}
          onPress={() => onChange(role)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.md, padding: Spacing.three, gap: Spacing.two },
  section: { marginTop: Spacing.two, textTransform: 'uppercase' },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1.5,
    borderRadius: Radius.md,
    padding: Spacing.three,
    minHeight: MinTouchTarget,
  },
  mark: { fontSize: 18, width: 22 },
  choiceText: { flex: 1, gap: Spacing.half },
  choices: { gap: Spacing.two },
  stepperBlock: { gap: Spacing.one },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  stepButton: {
    width: MinTouchTarget + Spacing.two,
    height: MinTouchTarget + Spacing.two,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: { minWidth: 48, textAlign: 'center' },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: MinTouchTarget,
  },
  memberText: { flex: 1, gap: Spacing.half },
});
