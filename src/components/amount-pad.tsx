import { StyleSheet, Text, View } from 'react-native';

import { Icon } from './icon';
import { Press } from './press';
import { T } from './text';
import { type CalcKey, evaluate, formatExpression, hasOperator } from '@/lib/calc';
import { currencyInfo } from '@/lib/money';
import { fonts, radius, space, useCurrency, useMoney, useTheme } from '@/theme';

const ROWS: CalcKey[][] = [
  ['7', '8', '9', '÷'],
  ['4', '5', '6', '×'],
  ['1', '2', '3', '-'],
  ['.', '0', 'back', '+'],
];

const OPERATOR = new Set<CalcKey>(['÷', '×', '-', '+']);
const SPOKEN: Partial<Record<CalcKey, string>> = {
  '÷': 'divide',
  '×': 'times',
  '-': 'minus',
  '+': 'plus',
  '.': 'decimal point',
  back: 'delete',
};

type AmountPadProps = {
  onKey: (key: CalcKey) => void;
};

/** Calculator keypad: amounts can be typed as sums like 1200+350. Long-press delete clears. */
export function AmountPad({ onKey }: AmountPadProps) {
  const c = useTheme();
  return (
    <View style={styles.pad}>
      {ROWS.map((row) => (
        <View key={row.join('')} style={styles.row}>
          {row.map((key) => {
            const op = OPERATOR.has(key);
            return (
              <Press
                key={key}
                onPress={() => onKey(key)}
                onLongPress={key === 'back' ? () => onKey('clear') : undefined}
                haptic="tap"
                scale={0.92}
                accessibilityLabel={SPOKEN[key] ?? key}
                testID={`key-${key}`}
                style={[styles.key, { backgroundColor: op ? c.surface2 : c.surface }]}>
                {key === 'back' ? (
                  <Icon name="backspace" size={24} color={c.ink} />
                ) : (
                  <Text
                    allowFontScaling={false}
                    style={[styles.keyText, { color: op ? c.accent : c.ink, fontFamily: op ? fonts.sansMedium : fonts.sans }]}>
                    {key === '-' ? '−' : key}
                  </Text>
                )}
              </Press>
            );
          })}
        </View>
      ))}
    </View>
  );
}

type AmountDisplayProps = {
  expr: string;
  color?: string;
  label?: string;
};

/** Big live amount, with the running sum underneath while an expression is being typed. */
export function AmountDisplay({ expr, color, label }: AmountDisplayProps) {
  const c = useTheme();
  const money = useMoney();
  const currency = useCurrency();
  const value = evaluate(expr);
  const empty = value === null;
  const text = empty ? `${currencyInfo(currency).symbol.trim()}0` : money(value, { fixed: expr.includes('.') && !hasOperator(expr) });
  return (
    <View style={styles.display} accessible accessibilityLabel={`${label ?? 'Amount'} ${empty ? 'empty' : text}`} accessibilityLiveRegion="polite">
      {label ? (
        <T variant="label" color="ink3" align="center">
          {label}
        </T>
      ) : null}
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.5}
        allowFontScaling={false}
        testID="amount-display"
        style={[styles.amount, { color: empty ? c.ink3 : (color ?? c.ink) }]}>
        {text}
      </Text>
      <T variant="callout" color="ink3" align="center" numberOfLines={1} style={styles.expr}>
        {hasOperator(expr) ? `${formatExpression(expr)} =` : ' '}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm },
  key: { flex: 1, height: 56, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontSize: 26, lineHeight: 32, fontVariant: ['tabular-nums'] },
  display: { alignItems: 'center', paddingHorizontal: space.page, gap: 2 },
  amount: { fontFamily: fonts.serif, fontSize: 56, lineHeight: 66, letterSpacing: -1.5, fontVariant: ['tabular-nums'], textAlign: 'center' },
  expr: { minHeight: 21 },
});
