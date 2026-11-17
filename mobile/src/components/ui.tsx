/**
 * Nestly-style building blocks (Figma "Nestly – UI Screens"): white rounded cards with a soft
 * indigo shadow, tinted icon bubbles, thin progress bars and a dark hero card.
 */
import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { Pressable, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { CardShadow, FontFamily, MinTouchTarget, Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Accent families of the palette; each has a strong color and a pale background. */
export type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'info';

const TONES: Record<Tone, { fg: ThemeColor; bg: ThemeColor }> = {
  primary: { fg: 'primary', bg: 'tint' },
  success: { fg: 'success', bg: 'successBackground' },
  warning: { fg: 'warning', bg: 'warningBackground' },
  danger: { fg: 'danger', bg: 'dangerBackground' },
  info: { fg: 'info', bg: 'infoBackground' },
};

export function Card({
  children,
  style,
  accessibilityLabel,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[styles.card, CardShadow, { backgroundColor: theme.backgroundElement }, style]}>
      {children}
    </View>
  );
}

/** A 40×40 rounded square holding an icon, tinted by tone. */
export function IconBubble({ icon, tone = 'primary', size = 40 }: { icon: IconName; tone?: Tone; size?: number }) {
  const theme = useTheme();
  const { fg, bg } = TONES[tone];
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.bubble, { width: size, height: size, backgroundColor: theme[bg] }]}>
      <Icon name={icon} size={Math.round(size / 2)} color={theme[fg]} />
    </View>
  );
}

/** `value` from 0 to 1; clamped. Decorative: callers announce the numbers in text. */
export function ProgressBar({
  value,
  tone = 'primary',
  height = 6,
  trackColor,
}: {
  value: number;
  tone?: Tone;
  height?: number;
  trackColor?: string;
}) {
  const theme = useTheme();
  const pct = `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` as const;
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.track, { height, borderRadius: height / 2, backgroundColor: trackColor ?? theme.track }]}>
      <View style={{ width: pct, height, borderRadius: height / 2, backgroundColor: theme[TONES[tone].fg] }} />
    </View>
  );
}

/** The dark summary card at the top of a screen: label, big figure, bar and a footer line. */
export function HeroCard({
  label,
  amount,
  amountSuffix,
  progress,
  footerStart,
  footerEnd,
  accessibilityLabel,
}: {
  label: string;
  amount: string;
  amountSuffix?: string;
  progress?: number;
  footerStart?: string;
  footerEnd?: string;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      style={[styles.hero, { backgroundColor: theme.hero }]}>
      <View style={[styles.heroDecor, { backgroundColor: theme.onHero }]} />
      <ThemedText style={[styles.heroLabel, { color: theme.onHero }]}>{label}</ThemedText>
      <View style={styles.heroAmountRow}>
        <ThemedText style={[styles.heroAmount, { color: theme.onHero }]} numberOfLines={1} adjustsFontSizeToFit>
          {amount}
        </ThemedText>
        {amountSuffix ? (
          <ThemedText style={[styles.heroSuffix, { color: theme.onHero }]}>{amountSuffix}</ThemedText>
        ) : null}
      </View>
      {progress != null ? <ProgressBar value={progress} height={10} trackColor="rgba(255,255,255,0.14)" /> : null}
      {footerStart || footerEnd ? (
        <View style={styles.heroFooter}>
          <ThemedText style={[styles.heroFooterStart, { color: theme.primaryLight }]}>{footerStart}</ThemedText>
          <ThemedText style={[styles.heroFooterEnd, { color: theme.onHero }]}>{footerEnd}</ThemedText>
        </View>
      ) : null}
    </View>
  );
}

/** 44pt white circle button, used in headers (back, +, switch). */
export function CircleIconButton({
  icon,
  accessibilityLabel,
  onPress,
}: {
  icon: IconName;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [
        styles.circle,
        CardShadow,
        { backgroundColor: theme.backgroundElement, transform: [{ scale: pressed ? 0.94 : 1 }] },
      ]}>
      <Icon name={icon} size={20} />
    </Pressable>
  );
}

/** "Your goals ........ See all" */
export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const theme = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <ThemedText accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </ThemedText>
      {action && onAction ? (
        <Pressable accessibilityRole="button" accessibilityLabel={action} hitSlop={12} onPress={onAction}>
          <ThemedText style={[styles.sectionAction, { color: theme.primary }]}>{action}</ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A tappable row inside a Card: bubble, title, optional detail, chevron. */
export function ListRow({
  icon,
  tone,
  title,
  detail,
  onPress,
  divider,
}: {
  icon: IconName;
  tone?: Tone;
  title: string;
  detail?: string;
  onPress: () => void;
  divider?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={detail ? `${title}, ${detail}` : title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
        { opacity: pressed ? 0.7 : 1 },
      ]}>
      <IconBubble icon={icon} tone={tone} />
      <View style={styles.rowText}>
        <ThemedText style={styles.rowTitle}>{title}</ThemedText>
        {detail ? (
          <ThemedText themeColor="textSecondary" style={styles.rowDetail}>
            {detail}
          </ThemedText>
        ) : null}
      </View>
      <Icon name="chevR" themeColor="textSecondary" />
    </Pressable>
  );
}

/** A short status line led by an icon: "✓ Active", "● This device". */
export function IconLabel({ icon, label, color }: { icon: IconName; label: string; color?: string }) {
  const theme = useTheme();
  const tint = color ?? theme.text;
  return (
    <View style={styles.inline}>
      <Icon name={icon} size={16} color={tint} />
      <ThemedText type="small" style={{ color: tint }}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.lg, padding: Spacing.three, gap: Spacing.two + Spacing.one },
  bubble: { borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  track: { width: '100%', overflow: 'hidden' },
  hero: { borderRadius: Radius.xl, padding: 20, gap: Spacing.two + Spacing.one, overflow: 'hidden' },
  heroDecor: { position: 'absolute', width: 170, height: 170, borderRadius: 85, right: -48, top: -60, opacity: 0.06 },
  heroLabel: { fontSize: 13, lineHeight: 18, fontFamily: FontFamily.medium, opacity: 0.7 },
  heroAmountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' },
  heroAmount: { fontSize: 32, lineHeight: 40, fontFamily: FontFamily.bold, letterSpacing: -0.64, flexShrink: 1 },
  heroSuffix: { fontSize: 14, lineHeight: 20, fontFamily: FontFamily.medium, opacity: 0.55 },
  heroFooter: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  heroFooterStart: { fontSize: 12.5, lineHeight: 18, fontFamily: FontFamily.semibold, flexShrink: 1 },
  heroFooterEnd: { fontSize: 12.5, lineHeight: 18, fontFamily: FontFamily.medium, opacity: 0.7 },
  circle: { width: MinTouchTarget, height: MinTouchTarget, borderRadius: MinTouchTarget / 2, alignItems: 'center', justifyContent: 'center' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.two },
  sectionTitle: { fontSize: 18, lineHeight: 24, fontFamily: FontFamily.bold },
  sectionAction: { fontSize: 13, lineHeight: 18, fontFamily: FontFamily.semibold },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + Spacing.one, minHeight: MinTouchTarget, paddingVertical: Spacing.two },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, lineHeight: 20, fontFamily: FontFamily.semibold },
  rowDetail: { fontSize: 12.5, lineHeight: 17, fontFamily: FontFamily.regular },
  inline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
});
