/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
    border: '#C9CCD3',
    primary: '#2457D6',
    onPrimary: '#FFFFFF',
    danger: '#B3261E',
    dangerBackground: '#FCE8E6',
    success: '#1B7F3B',
    warningBackground: '#FFF4D6',
    warningText: '#5C4400',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    border: '#3A3D42',
    primary: '#8AB4FF',
    onPrimary: '#0B1B3F',
    danger: '#FFB4AB',
    dangerBackground: '#3B1411',
    success: '#7DD99A',
    warningBackground: '#3A2F0B',
    warningText: '#FFE08A',
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
  md: 12,
  lg: 20,
  full: 999,
} as const;

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
