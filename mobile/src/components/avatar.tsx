import type { AvatarKey, ColorKey } from '@two-cents/shared/contracts';
import { StyleSheet, Text, useColorScheme, View } from 'react-native';

import { AvatarColors, AvatarTextColor } from '@/constants/theme';

const GLYPHS: Record<Exclude<AvatarKey, 'initials'>, string> = {
  leaf: '🌿',
  sun: '☀️',
  moon: '🌙',
  star: '⭐️',
  heart: '❤️',
  coffee: '☕️',
  house: '🏠',
};

/** A person's avatar: preset glyph or initial on their color (FR-039). Labelled with their name. */
export function Avatar({ firstName, avatarKey, colorKey, size = 48 }: { firstName: string; avatarKey: AvatarKey; colorKey: ColorKey; size?: number }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const content = avatarKey === 'initials' ? Array.from(firstName.trim())[0]?.toUpperCase() ?? '?' : GLYPHS[avatarKey];
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={firstName}
      style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: AvatarColors[scheme][colorKey] }]}>
      <Text allowFontScaling={false} style={{ fontSize: size * 0.45, fontWeight: '600', color: AvatarTextColor[scheme] }}>
        {content}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({ circle: { alignItems: 'center', justifyContent: 'center' } });
