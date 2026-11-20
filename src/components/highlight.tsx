import { type ReactNode } from 'react';
import { Text } from 'react-native';

import { T, type TProps } from './text';
import { matchRanges } from '@/lib/search';
import { useTheme } from '@/theme';

type HighlightProps = Omit<TProps, 'children'> & { text: string; query: string };

/** Text with the words of `query` marked like a highlighter pen. */
export function Highlight({ text, query, ...rest }: HighlightProps) {
  const c = useTheme();
  const ranges = matchRanges(text, query);
  if (!ranges.length) return <T {...rest}>{text}</T>;
  const parts: ReactNode[] = [];
  let at = 0;
  for (const r of ranges) {
    if (r.start > at) parts.push(text.slice(at, r.start));
    parts.push(
      <Text key={r.start} style={{ backgroundColor: c.highlight, color: c.ink }}>
        {text.slice(r.start, r.end)}
      </Text>,
    );
    at = r.end;
  }
  if (at < text.length) parts.push(text.slice(at));
  return <T {...rest}>{parts}</T>;
}
