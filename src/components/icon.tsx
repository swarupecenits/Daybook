import { memo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { glyphs, type IconName } from './icon-glyphs';

export type { IconName };
export type IconWeight = 'regular' | 'bold' | 'fill' | 'duotone';

type Glyph = { r: string; b?: string; f?: string; t?: string; d?: string };

type IconProps = {
  name: IconName;
  color: string;
  size?: number;
  weight?: IconWeight;
  style?: StyleProp<ViewStyle>;
};

function pathFor(g: Glyph, weight: IconWeight): string {
  if (weight === 'fill') return g.f ?? g.r;
  if (weight === 'bold') return g.b ?? g.r;
  if (weight === 'duotone') return g.d ?? g.r;
  return g.r;
}

function IconBase({ name, color, size = 22, weight = 'regular', style }: IconProps) {
  const glyph: Glyph = glyphs[name];
  return (
    <Svg width={size} height={size} viewBox="0 0 256 256" style={style}>
      {weight === 'duotone' && glyph.t ? <Path d={glyph.t} fill={color} opacity={0.22} /> : null}
      <Path d={pathFor(glyph, weight)} fill={color} />
    </Svg>
  );
}

export const Icon = memo(IconBase);
