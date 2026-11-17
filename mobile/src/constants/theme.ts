/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

/** Nestly palette (Figma "palette" frame). Dark values are derived — the file only ships light. */
export const Colors = {
  light: {
    text: '#16143A', // Ink
    background: '#F7F7FC',
    backgroundElement: '#FFFFFF', // cards
    backgroundSelected: '#ECEBFF', // Tint
    textSecondary: '#8583A3', // Muted
    border: '#E6E5F2',
    track: '#F1F0F7', // progress track
    primary: '#625EFC',
    primaryDark: '#4A45E0',
    primaryLight: '#8C89FF',
    tint: '#ECEBFF',
    onPrimary: '#FFFFFF',
    hero: '#16143A', // dark summary card
    onHero: '#FFFFFF',
    danger: '#F0527A',
    dangerBackground: '#FFE4EB',
    success: '#14B886',
    successBackground: '#DCF6EC',
    warning: '#F5A524',
    warningBackground: '#FDF0D9',
    warningText: '#8A5A00',
    info: '#2CA6EE',
    infoBackground: '#DEF1FC',
  },
  dark: {
    text: '#F7F7FC',
    background: '#0E0D24',
    backgroundElement: '#1C1A3D',
    backgroundSelected: '#2A2760',
    textSecondary: '#A9A7C6',
    border: '#2C2A52',
    track: '#2C2A52',
    primary: '#8C89FF',
    primaryDark: '#625EFC',
    primaryLight: '#B3B1FF',
    tint: '#2A2760',
    onPrimary: '#16143A',
    hero: '#26236B',
    onHero: '#FFFFFF',
    danger: '#FF7D9C',
    dangerBackground: '#3D1426',
    success: '#3DD6A5',
    successBackground: '#0F3A2E',
    warning: '#FFBE55',
    warningBackground: '#3A2C0B',
    warningText: '#FFD98A',
    info: '#5CC0FF',
    infoBackground: '#0E2F45',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

export const Radius = {
  sm: 8,
  md: 13, // icon bubbles
  lg: 24, // cards
  xl: 28, // hero cards
  full: 999,
} as const;

/** Geist, loaded in the root layout. Custom fonts ignore `fontWeight` on Android, so pick the family per weight. */
export const FontFamily = {
  regular: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
  bold: 'Geist_700Bold',
} as const;

/** Soft indigo card shadow: 0 6 20 rgba(22,20,58,0.06). */
export const CardShadow = { boxShadow: '0px 6px 20px rgba(22, 20, 58, 0.06)' } as const;

/** Minimum touch target (constitution Principle VIII). */
export const MinTouchTarget = 44;

/** Avatar colors, one per `ColorKey` from @two-cents/shared/contracts. Text on them is white (light) / near-black (dark). */
export const AvatarColors = {
  light: {
    blue: '#2457D6',
    green: '#1B7F3B',
    orange: '#B54708',
    purple: '#6B3FD4',
    pink: '#B4236C',
    teal: '#0F766E',
    red: '#B3261E',
    yellow: '#8A6100',
  },
  dark: {
    blue: '#8AB4FF',
    green: '#7DD99A',
    orange: '#FFB37A',
    purple: '#C5B3FF',
    pink: '#FF9CCB',
    teal: '#6FE0D3',
    red: '#FFB4AB',
    yellow: '#FFD873',
  },
} as const;

export const AvatarTextColor = { light: '#FFFFFF', dark: '#0B0B0F' } as const;
