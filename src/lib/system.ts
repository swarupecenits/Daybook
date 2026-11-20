import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { Alert, Linking, Platform, Share } from 'react-native';

import { whileAway } from '@/stores/session';
import { toast } from '@/stores/toast';

export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export async function copyText(text: string, message = 'Copied') {
  try {
    await Clipboard.setStringAsync(text);
    toast({ message, icon: 'copy', tone: 'success' });
  } catch {
    toast({ message: "Couldn't copy that.", tone: 'danger', icon: 'warning' });
  }
}

export async function shareText(text: string, title?: string) {
  if (Platform.OS === 'web') {
    const nav = globalThis.navigator as Navigator | undefined;
    if (typeof nav?.share === 'function') {
      try {
        await nav.share({ text, title });
        return;
      } catch (error) {
        if ((error as Error | undefined)?.name === 'AbortError') return;
      }
    }
    await copyText(text, 'Copied to clipboard');
    return;
  }
  try {
    await whileAway(() => Share.share(title ? { message: text, title } : { message: text }));
  } catch {
    await copyText(text, 'Copied to clipboard');
  }
}

export async function openExternal(url: string, failMessage = 'No app on this phone can open that.') {
  try {
    await whileAway(() => Linking.openURL(url));
    return true;
  } catch {
    toast({ message: failMessage, tone: 'danger', icon: 'warning' });
    return false;
  }
}

type ConfirmOptions = {
  title: string;
  message?: string;
  confirm: string;
  cancel?: string;
  destructive?: boolean;
};

/** Native confirmation dialog. Resolves true only when the confirm button is chosen. */
export function confirm(opts: ConfirmOptions): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm([opts.title, opts.message].filter(Boolean).join('\n\n')));
  }
  return new Promise((resolve) => {
    Alert.alert(
      opts.title,
      opts.message,
      [
        { text: opts.cancel ?? 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        {
          text: opts.confirm,
          style: opts.destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
