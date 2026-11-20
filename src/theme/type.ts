import type { TextStyle } from 'react-native';

export const fonts = {
  serif: 'Fraunces_600SemiBold',
  serifItalic: 'Fraunces_400Regular_Italic',
  sans: 'Figtree_400Regular',
  sansMedium: 'Figtree_500Medium',
  sansSemi: 'Figtree_600SemiBold',
  sansBold: 'Figtree_700Bold',
  mono: 'IBMPlexMono_500Medium',
} as const;

export const typo = {
  hero: { fontFamily: fonts.serif, fontSize: 46, lineHeight: 52, letterSpacing: -1 },
  display: { fontFamily: fonts.serif, fontSize: 36, lineHeight: 42, letterSpacing: -0.8 },
  title: { fontFamily: fonts.serif, fontSize: 28, lineHeight: 34, letterSpacing: -0.4 },
  heading: { fontFamily: fonts.serif, fontSize: 21, lineHeight: 27, letterSpacing: -0.2 },
  italic: { fontFamily: fonts.serifItalic, fontSize: 19, lineHeight: 25 },
  headline: { fontFamily: fonts.sansSemi, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: fonts.sans, fontSize: 16, lineHeight: 23 },
  bodyMedium: { fontFamily: fonts.sansMedium, fontSize: 16, lineHeight: 23 },
  callout: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 21 },
  calloutMedium: { fontFamily: fonts.sansMedium, fontSize: 15, lineHeight: 21 },
  caption: { fontFamily: fonts.sansMedium, fontSize: 13, lineHeight: 17 },
  small: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 16 },
  label: {
    fontFamily: fonts.mono,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  amount: { fontFamily: fonts.sansSemi, fontSize: 16, lineHeight: 22, fontVariant: ['tabular-nums'] },
  amountLarge: {
    fontFamily: fonts.sansSemi,
    fontSize: 22,
    lineHeight: 28,
    fontVariant: ['tabular-nums'],
  },
  button: { fontFamily: fonts.sansSemi, fontSize: 16, lineHeight: 20 },
} satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof typo;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  page: 20,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const springs = {
  snappy: { damping: 20, stiffness: 320, mass: 0.7 },
  gentle: { damping: 22, stiffness: 190, mass: 0.9 },
  sheet: { damping: 26, stiffness: 260, mass: 0.9 },
} as const;
