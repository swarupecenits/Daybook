import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

import { whileAway } from '@/stores/session';

export type LockSupport = { available: boolean; label: string; icon: 'fingerprint' | 'lock' };

/** What the phone can use to unlock the app: biometrics, the device passcode, or nothing. */
export async function lockSupport(): Promise<LockSupport> {
  const none: LockSupport = { available: false, label: 'Screen lock', icon: 'lock' };
  if (Platform.OS === 'web') return none;
  try {
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    if (level === LocalAuthentication.SecurityLevel.NONE) return none;
    if (level === LocalAuthentication.SecurityLevel.SECRET) {
      return { available: true, label: Platform.OS === 'ios' ? 'Passcode' : 'Screen lock', icon: 'lock' };
    }
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    const face = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
    const label =
      Platform.OS === 'ios' ? (face ? 'Face ID' : 'Touch ID') : face ? 'Face unlock' : 'Fingerprint';
    return { available: true, label, icon: 'fingerprint' };
  } catch {
    return none;
  }
}

export type AuthResult = 'ok' | 'cancel' | 'unavailable' | 'failed';

export async function authenticate(promptMessage = 'Unlock Daybook'): Promise<AuthResult> {
  if (Platform.OS === 'web') return 'unavailable';
  try {
    const result = await whileAway(() =>
      LocalAuthentication.authenticateAsync({
        promptMessage,
        cancelLabel: 'Cancel',
        fallbackLabel: 'Use passcode',
        disableDeviceFallback: false,
      }),
    );
    if (result.success) return 'ok';
    switch (result.error) {
      case 'not_enrolled':
      case 'not_available':
      case 'passcode_not_set':
        return 'unavailable';
      case 'user_cancel':
      case 'system_cancel':
      case 'app_cancel':
      case 'user_fallback':
        return 'cancel';
      default:
        return 'failed';
    }
  } catch {
    return 'failed';
  }
}
