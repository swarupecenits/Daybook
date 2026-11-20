import { memo } from 'react';
import { Text, View } from 'react-native';

import { fonts, PAPER_COLORS, useTheme } from '@/theme';

const TONES = PAPER_COLORS.filter((p) => p !== 'plain');

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((w) => Array.from(w)[0]?.toUpperCase() ?? '');
  return letters.join('') || '?';
}

function hash(text: string): number {
  let h = 7;
  for (const ch of text.toLowerCase()) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return h;
}

/** Initials on a paper tone picked from the name, so a friend keeps the same colour everywhere. */
function AvatarBase({ name, size = 42 }: { name: string; size?: number }) {
  const c = useTheme();
  const tone = TONES[hash(name) % TONES.length];
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: c.paper[tone],
        borderColor: `${c.paperEdge[tone]}66`,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text
        allowFontScaling={false}
        style={{ fontFamily: fonts.serif, fontSize: Math.round(size * 0.38), lineHeight: Math.round(size * 0.5), color: c.ink }}>
        {initials(name)}
      </Text>
    </View>
  );
}

export const Avatar = memo(AvatarBase);
