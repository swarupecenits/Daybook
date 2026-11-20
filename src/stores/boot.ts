import { Platform } from 'react-native';

import { ledgerRepairs, useLedger } from './ledger';
import { useLogs } from './logs';
import { useNotes } from './notes';
import { useSession } from './session';
import { applySettings, useSettings } from './settings';
import { reconcileReminders, useTasks } from './tasks';
import { type Db, setDb } from '@/db/adapter';
import {
  destroyRows,
  entriesTable,
  expensesTable,
  loadSettingsRows,
  logsTable,
  notesTable,
  peopleTable,
  tasksTable,
} from '@/db/repos';
import { migrate } from '@/db/schema';
import type { BackupData } from '@/lib/backup';
import { setClock24 } from '@/lib/dates';
import { deviceDefaults } from '@/lib/locale';
import { isBlank } from '@/lib/notes';
import { DEFAULT_SETTINGS, readSettings } from '@/lib/settings';
import { DAY_MS, planSize, TRASH_DAYS, type TrashPlan, trashPlan, withoutPlan } from '@/lib/trash';
import type { Settings } from '@/lib/types';

const newestFirst = <T extends { updatedAt: number }>(rows: T[]) => rows.sort((a, b) => b.updatedAt - a.updatedAt);

/**
 * What to delete for good: anything in the trash longer than 30 days, rows that hang off it,
 * and notes that were opened but never written in.
 */
export function purgePlan(data: BackupData, now: number): TrashPlan {
  const plan = trashPlan(data, now - TRASH_DAYS * DAY_MS);
  const listed = new Set(plan.notes);
  for (const n of data.notes) if (isBlank(n) && !listed.has(n.id)) plan.notes.push(n.id);
  return plan;
}

function purge(data: BackupData, now: number): BackupData {
  const plan = purgePlan(data, now);
  if (!planSize(plan)) return data;
  try {
    destroyRows(plan);
  } catch (error) {
    // Clearing old trash is housekeeping; never block start-up on it.
    if (__DEV__) console.warn('[daybook] purge failed', error);
    return data;
  }
  return withoutPlan(data, plan);
}

/** Settings for a fresh install, seeded from the device locale. */
export function freshSettings(): Settings {
  const device = deviceDefaults();
  return { ...DEFAULT_SETTINGS, currency: device.currency, weekStart: device.weekStart };
}

export async function boot(database: Db, now: number = Date.now()): Promise<void> {
  setDb(database);
  await migrate(database);

  // Sequential on purpose: the web driver serialises requests anyway.
  const loaded: BackupData = {
    notes: await notesTable.loadAll(),
    tasks: await tasksTable.loadAll(),
    logs: await logsTable.loadAll(),
    people: await peopleTable.loadAll(),
    entries: await entriesTable.loadAll(),
    expenses: await expensesTable.loadAll(),
  };
  const stored = await loadSettingsRows();

  const device = deviceDefaults();
  setClock24(device.clock24);
  const settings = readSettings(stored, { ...DEFAULT_SETTINGS, currency: device.currency, weekStart: device.weekStart });

  const data = purge(loaded, now);
  const repairs = ledgerRepairs(data.people, data.entries, data.expenses);
  if (repairs.length) {
    try {
      database.tx(() => {
        for (const e of repairs) entriesTable.save(e);
      });
      const fixed = new Map(repairs.map((e) => [e.id, e]));
      data.entries = data.entries.map((e) => fixed.get(e.id) ?? e);
    } catch (error) {
      if (__DEV__) console.warn('[daybook] ledger repair failed', error);
    }
  }

  useNotes.setState({ notes: newestFirst(data.notes) });
  useTasks.setState({ tasks: newestFirst(data.tasks) });
  useLogs.setState({ logs: newestFirst(data.logs) });
  useLedger.setState({
    people: newestFirst(data.people),
    entries: newestFirst(data.entries),
    expenses: newestFirst(data.expenses),
  });
  useSettings.setState(settings);
  applySettings(settings);
  useSession.setState({ locked: settings.lock && settings.onboarded && Platform.OS !== 'web' });

  void reconcileReminders().catch((error: unknown) => {
    if (__DEV__) console.warn('[daybook] reminder sync failed', error);
  });
}
