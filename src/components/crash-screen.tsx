import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from './button';
import { BrandMark } from './empty-state';
import { LinkText } from './layout';
import { T } from './text';
import { copyText } from '@/lib/system';
import { space, useTheme } from '@/theme';

type CrashScreenProps = {
  title: string;
  message: string;
  onRetry: () => void;
};

export function CrashScreen({ title, message, onRetry }: CrashScreenProps) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  return (
    <View style={[styles.root, { backgroundColor: c.bg, paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl }]}>
      <View style={styles.body}>
        <BrandMark size={64} />
        <T variant="title">{title}</T>
        <T variant="callout" color="ink2">
          Nothing you saved has been lost. Try again, and if it keeps happening, restart the app.
        </T>
        <LinkText label={open ? 'Hide details' : 'Show details'} onPress={() => setOpen((v) => !v)} />
        {open ? (
          <ScrollView style={[styles.details, { backgroundColor: c.surface2 }]}>
            <T variant="small" color="ink2" selectable>
              {message}
            </T>
            <View style={styles.copy}>
              <LinkText label="Copy details" onPress={() => void copyText(message)} />
            </View>
          </ScrollView>
        ) : null}
      </View>
      <Button label="Try again" icon="arrow-counter-clockwise" onPress={onRetry} size="lg" full />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: space.page },
  body: { flex: 1, gap: space.md },
  details: { maxHeight: 220, borderRadius: 14, padding: space.md },
  copy: { marginTop: space.sm, alignItems: 'flex-start' },
});
