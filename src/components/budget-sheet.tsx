import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AmountDisplay, AmountPad } from './amount-pad';
import { Button } from './button';
import { LinkText } from './layout';
import { Sheet } from './sheet';
import { T } from './text';
import { evaluate, minorToInput, pressKey } from '@/lib/calc';
import { haptic } from '@/lib/haptics';
import { useSettings } from '@/stores/settings';
import { toast } from '@/stores/toast';
import { space, useMoney } from '@/theme';

/** Sets or clears the monthly spending budget with the calculator keypad. */
export function BudgetSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const money = useMoney();
  const budget = useSettings((s) => s.budget);
  const [expr, setExpr] = useState(() => (budget ? minorToInput(budget) : ''));
  const [shown, setShown] = useState(visible);
  if (shown !== visible) {
    setShown(visible);
    if (visible) setExpr(budget ? minorToInput(budget) : '');
  }
  const value = evaluate(expr);

  const save = (next: number) => {
    if (!useSettings.getState().update({ budget: next })) return;
    haptic('success');
    toast({
      message: next ? `Budget set to ${money(next)} a month` : 'Budget removed',
      icon: 'target',
      tone: 'success',
    });
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Monthly budget"
      testID="budget-sheet"
      right={budget ? <LinkText label="Remove" color="negative" onPress={() => save(0)} testID="budget-remove" /> : null}>
      <T variant="small" color="ink3" style={styles.hint}>
        Only your share of split bills counts towards it.
      </T>
      <AmountDisplay expr={expr} />
      <View style={styles.pad}>
        <AmountPad onKey={(key) => setExpr((e) => pressKey(e, key))} />
      </View>
      <Button
        label={value ? `Set ${money(value)} a month` : 'Enter an amount'}
        onPress={() => {
          if (value) save(value);
        }}
        disabled={!value}
        variant="ink"
        size="lg"
        full
        testID="budget-save"
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  hint: { marginTop: -space.sm, marginBottom: space.md },
  pad: { marginTop: space.md, marginBottom: space.lg },
});
