import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { Screen, TopBar } from '@/components/layout';

export default function NotFound() {
  return (
    <Screen>
      <TopBar onBack={() => router.replace('/')} />
      <View style={styles.body}>
        <EmptyState
          icon="tray"
          title="This page isn’t in your daybook"
          body="It may have been deleted, or the link is out of date."
          action={{ label: 'Go to Today', icon: 'sun-horizon', onPress: () => router.replace('/') }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', paddingBottom: 80 },
});
