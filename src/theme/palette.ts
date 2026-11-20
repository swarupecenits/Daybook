export type Scheme = 'light' | 'dark';

export type PaperColor = 'plain' | 'butter' | 'sage' | 'sky' | 'blush' | 'lilac' | 'sand';

export const PAPER_COLORS: readonly PaperColor[] = [
  'plain',
  'butter',
  'sage',
  'sky',
  'blush',
  'lilac',
  'sand',
];

export type Palette = {
  scheme: Scheme;
  bg: string;
  surface: string;
  surface2: string;
  raised: string;
  ink: string;
  ink2: string;
  ink3: string;
  line: string;
  lineStrong: string;
  accent: string;
  onAccent: string;
  accentSoft: string;
  positive: string;
  positiveSoft: string;
  negative: string;
  negativeSoft: string;
  warning: string;
  warningSoft: string;
  highlight: string;
  scrim: string;
  shadow: string;
  paper: Record<PaperColor, string>;
  paperEdge: Record<PaperColor, string>;
};

const light: Palette = {
  scheme: 'light',
  bg: '#F3EFE7',
  surface: '#FBF9F5',
  surface2: '#EAE5DA',
  raised: '#FFFFFF',
  ink: '#1C1B18',
  ink2: '#5E5A52',
  ink3: '#8F8A80',
  line: '#E2DCCF',
  lineStrong: '#CFC6B4',
  accent: '#3047D8',
  onAccent: '#FFFFFF',
  accentSoft: '#E2E6FA',
  positive: '#1F7A4D',
  positiveSoft: '#DDEFE3',
  negative: '#C8371F',
  negativeSoft: '#F8E1DB',
  warning: '#A86A12',
  warningSoft: '#F6E8CC',
  highlight: '#FFE27A',
  scrim: 'rgba(28,27,24,0.36)',
  shadow: '#5B4A2E',
  paper: {
    plain: '#FBF9F5',
    butter: '#FBEFC5',
    sage: '#DDEBD6',
    sky: '#D8E6F5',
    blush: '#F7DCD6',
    lilac: '#E6DDF3',
    sand: '#EDE3D1',
  },
  paperEdge: {
    plain: '#CFC6B4',
    butter: '#E2C55C',
    sage: '#86B07E',
    sky: '#79A1D2',
    blush: '#DB8775',
    lilac: '#A08BCB',
    sand: '#BCA27A',
  },
};

const dark: Palette = {
  scheme: 'dark',
  bg: '#141311',
  surface: '#1D1C19',
  surface2: '#27251F',
  raised: '#2A2823',
  ink: '#F2EEE6',
  ink2: '#B8B2A6',
  ink3: '#857F74',
  line: '#2F2D28',
  lineStrong: '#3F3C35',
  accent: '#8EA0FF',
  onAccent: '#0E1120',
  accentSoft: '#232A4A',
  positive: '#5BD69A',
  positiveSoft: '#173126',
  negative: '#FF7A5C',
  negativeSoft: '#3A1D16',
  warning: '#E8B04B',
  warningSoft: '#3A2D14',
  highlight: 'rgba(255,226,122,0.30)',
  scrim: 'rgba(0,0,0,0.56)',
  shadow: '#000000',
  paper: {
    plain: '#1D1C19',
    butter: '#3A331D',
    sage: '#23302A',
    sky: '#1E2A38',
    blush: '#3A2522',
    lilac: '#2C2538',
    sand: '#312B22',
  },
  paperEdge: {
    plain: '#4A463E',
    butter: '#C9A93E',
    sage: '#6FA87A',
    sky: '#6C9AD6',
    blush: '#D7806F',
    lilac: '#A08BD6',
    sand: '#B49A70',
  },
};

export const palettes: Record<Scheme, Palette> = { light, dark };
