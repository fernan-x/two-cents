import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { FontFamily, Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'link' | 'linkPrimary' | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  const color = theme[themeColor ?? (type === 'linkPrimary' ? 'primary' : 'text')];
  return <Text style={[{ color }, styles[type], style]} {...rest} />;
}

const styles = StyleSheet.create({
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FontFamily.medium,
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FontFamily.bold,
  },
  default: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: FontFamily.medium,
  },
  title: {
    fontSize: 48,
    fontFamily: FontFamily.semibold,
    lineHeight: 52,
  },
  subtitle: {
    fontSize: 32,
    lineHeight: 44,
    fontFamily: FontFamily.semibold,
  },
  link: {
    lineHeight: 30,
    fontSize: 14,
    fontFamily: FontFamily.medium,
  },
  linkPrimary: {
    lineHeight: 30,
    fontSize: 14,
    fontFamily: FontFamily.semibold,
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
});
