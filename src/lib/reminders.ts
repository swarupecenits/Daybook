import { Platform } from 'react-native';

type NotificationsModule = typeof import('expo-notifications');

const CHANNEL = 'reminders';

let loading: Promise<NotificationsModule | null> | null = null;
let openHandler: ((taskId: string) => void) | null = null;
let handledLaunch = false;

function taskIdOf(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const id = (data as Record<string, unknown>).taskId;
  return typeof id === 'string' ? id : null;
}

/**
 * expo-notifications is loaded on first use only. Importing it inside Expo Go prints a
 * "not fully supported" notice, so people who never set a reminder never see it.
 */
export function loadNotifications(): Promise<NotificationsModule | null> {
  if (Platform.OS === 'web') return Promise.resolve(null);
  loading ??= import('expo-notifications')
    .then(async (N) => {
      N.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
      if (Platform.OS === 'android') {
        await N.setNotificationChannelAsync(CHANNEL, {
          name: 'Task reminders',
          importance: N.AndroidImportance.HIGH,
          vibrationPattern: [0, 160, 120, 160],
          lightColor: '#3047D8',
        });
      }
      N.addNotificationResponseReceivedListener((response) => {
        const id = taskIdOf(response.notification.request.content.data);
        if (id) openHandler?.(id);
      });
      if (!handledLaunch) {
        handledLaunch = true;
        const launch = N.getLastNotificationResponse();
        const id = launch ? taskIdOf(launch.notification.request.content.data) : null;
        if (id) setTimeout(() => openHandler?.(id), 0);
      }
      return N;
    })
    .catch(() => null);
  return loading;
}

export function setReminderOpenHandler(handler: ((taskId: string) => void) | null) {
  openHandler = handler;
}

export async function ensureReminderPermission(): Promise<boolean> {
  const N = await loadNotifications();
  if (!N) return false;
  try {
    const current = await N.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const next = await N.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
    return next.granted;
  } catch {
    return false;
  }
}

export type ReminderRequest = { taskId: string; title: string; body: string; at: number };

export async function scheduleReminder(req: ReminderRequest): Promise<string | null> {
  if (!Number.isFinite(req.at) || req.at <= Date.now() + 5_000) return null;
  const N = await loadNotifications();
  if (!N || !(await ensureReminderPermission())) return null;
  try {
    return await N.scheduleNotificationAsync({
      content: { title: req.title, body: req.body, data: { taskId: req.taskId }, sound: 'default' },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: req.at, channelId: CHANNEL },
    });
  } catch {
    return null;
  }
}

export async function cancelReminder(id: string | null): Promise<void> {
  if (!id) return;
  const N = await loadNotifications();
  if (!N) return;
  try {
    await N.cancelScheduledNotificationAsync(id);
  } catch {
    // Already fired or removed.
  }
}

export async function cancelAllReminders(): Promise<void> {
  const N = await loadNotifications();
  try {
    await N?.cancelAllScheduledNotificationsAsync();
  } catch {
    // Nothing scheduled.
  }
}

/** Identifiers the OS still has queued, or null when notifications are unavailable. */
export async function scheduledReminderIds(): Promise<Set<string> | null> {
  const N = await loadNotifications();
  if (!N) return null;
  try {
    const requests = await N.getAllScheduledNotificationsAsync();
    return new Set(requests.map((r) => r.identifier));
  } catch {
    return null;
  }
}
