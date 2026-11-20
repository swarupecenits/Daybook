import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { ledgerRepairs, rebuildLinked, useLedger } from './ledger';
import { useLogs } from './logs';
import { useNotes } from './notes';
import { persist } from './persist';
import { useSession, whileAway } from './session';
import { applySettings, settingsOf, useSettings } from './settings';
import { afterTasksReplaced, resetTaskRuntime, useTasks } from './tasks';
import { upsertAll, withoutIds } from './util';
import { freshSettings } from './boot';
import { db } from '@/db/adapter';
import {
  entriesTable,
  eraseAllRows,
  expensesTable,
  logsTable,
  notesTable,
  peopleTable,
  tasksTable,
} from '@/db/repos';
import {
  type BackupData,
  type BackupError,
  backupFileName,
  buildBackup,
  type ParsedBackup,
  parseBackup,
} from '@/lib/backup';
import { LIMITS } from '@/lib/limits';
import { cancelAllReminders } from '@/lib/reminders';
import { DEFAULT_SETTINGS } from '@/lib/settings';
import type { Entry, Settings } from '@/lib/types';

export function currentData(): BackupData {
  const { notes } = useNotes.getState();
  const { tasks } = useTasks.getState();
  const { logs } = useLogs.getState();
  const { people, entries, expenses } = useLedger.getState();
  return { notes, tasks, logs, people, entries, expenses };
}

export type ExportResult = 'shared' | 'downloaded' | 'unavailable';

export async function exportBackup(): Promise<ExportResult> {
  const text = buildBackup(currentData(), settingsOf(useSettings.getState()));
  const name = backupFileName();

  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2_000);
    return 'downloaded';
  }

  if (!(await Sharing.isAvailableAsync())) return 'unavailable';
  clearOldExports();
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  await file.write(text);
  await whileAway(() =>
    Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      UTI: 'public.json',
      dialogTitle: 'Save your Daybook backup',
    }),
  );
  return 'shared';
}

/** Backups are staged in the app's private cache only for the share sheet; keep just the latest. */
function clearOldExports() {
  try {
    for (const item of new Directory(Paths.cache).list()) {
      if (item instanceof File && /^daybook-.*\.json$/.test(item.name)) item.delete();
    }
  } catch {
    // The OS clears caches on its own.
  }
}

export async function pickBackup(): Promise<ParsedBackup | BackupError | null> {
  const result = await whileAway(() =>
    DocumentPicker.getDocumentAsync({
      type: Platform.OS === 'android' ? '*/*' : ['application/json', 'text/plain'],
      copyToCacheDirectory: true,
      multiple: false,
    }),
  );
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  if (asset.size !== undefined && asset.size > LIMITS.backupBytes) {
    return { ok: false, error: 'This file is larger than 25 MB.' };
  }
  let text: string;
  try {
    if (Platform.OS === 'web') {
      if (!asset.file) throw new Error('no file');
      text = await asset.file.text();
    } else {
      const file = new File(asset.uri);
      text = await file.text();
      try {
        file.delete();
      } catch {
        // A copy in the cache; the OS cleans it up eventually.
      }
    }
  } catch {
    return { ok: false, error: "Couldn't read that file." };
  }
  return parseBackup(text, new Set(useLedger.getState().people.map((p) => p.id)));
}

export type MergeSummary = { added: number; updated: number; unchanged: number; skipped: number };

/**
 * Merges a parsed backup into this device. For every record the newer edit wins, nothing is
 * deleted, and an expense's ledger rows are rebuilt from the expense itself rather than trusted.
 */
export function mergeBackup(parsed: ParsedBackup): MergeSummary | null {
  const incoming = parsed.data;
  const local = currentData();
  const summary: MergeSummary = { added: 0, updated: 0, unchanged: 0, skipped: parsed.skipped };

  const winners = <T extends { id: string; updatedAt: number }>(mine: readonly T[], theirs: readonly T[]) => {
    const byId = new Map(mine.map((x) => [x.id, x]));
    const out: T[] = [];
    for (const row of theirs) {
      const current = byId.get(row.id);
      if (!current) summary.added += 1;
      else if (row.updatedAt > current.updatedAt) summary.updated += 1;
      else {
        summary.unchanged += 1;
        continue;
      }
      out.push(row);
    }
    return out;
  };

  const notes = winners(local.notes, incoming.notes);
  const tasks = winners(local.tasks, incoming.tasks);
  const logs = winners(local.logs, incoming.logs);
  const people = winners(local.people, incoming.people);
  const expenses = winners(local.expenses, incoming.expenses);

  const allPeople = upsertAll(local.people, people);
  const personIds = new Set(allPeople.map((p) => p.id));
  const localLinked = new Set(local.entries.filter((e) => e.expenseId !== null).map((e) => e.id));
  const standaloneIn = incoming.entries.filter((e) => {
    const ok = e.expenseId === null && personIds.has(e.personId) && !localLinked.has(e.id);
    // Linked rows are rebuilt from their expense below, so they're neither counted nor trusted.
    if (!ok && e.expenseId === null) summary.skipped += 1;
    return ok;
  });
  const standalone = winners(local.entries, standaloneIn);

  const linked: Entry[] = [];
  const stale: string[] = [];
  for (const expense of expenses) {
    const rebuilt = rebuildLinked(expense, allPeople, local.entries, expense.updatedAt);
    linked.push(...rebuilt.fresh);
    stale.push(...rebuilt.stale);
  }

  const ok = persist(() =>
    db().tx(() => {
      for (const p of people) peopleTable.save(p);
      for (const e of expenses) expensesTable.save(e);
      entriesTable.destroy(stale);
      for (const e of [...standalone, ...linked]) entriesTable.save(e);
      for (const n of notes) notesTable.save(n);
      for (const t of tasks) tasksTable.save(t);
      for (const l of logs) logsTable.save(l);
    }),
  );
  if (!ok) return null;

  let entries = upsertAll(withoutIds(local.entries, stale), [...standalone, ...linked]);
  const mergedExpenses = upsertAll(local.expenses, expenses);
  const repairs = ledgerRepairs(allPeople, entries, mergedExpenses);
  if (repairs.length && persist(() => db().tx(() => repairs.forEach((e) => entriesTable.save(e))))) {
    entries = upsertAll(entries, repairs);
  }

  useNotes.setState({ notes: upsertAll(local.notes, notes) });
  useLogs.setState({ logs: upsertAll(local.logs, logs) });
  useLedger.setState({ people: allPeople, entries, expenses: mergedExpenses });
  useTasks.setState({ tasks: upsertAll(local.tasks, tasks) });
  afterTasksReplaced(
    local.tasks,
    tasks.map((t) => t.id),
  );

  applyBackupSettings(parsed.settings, local);
  return summary;
}

/** Fills in preferences this device hasn't customised yet; never switches currency under existing money. */
function applyBackupSettings(incoming: ParsedBackup['settings'], local: BackupData) {
  const current = useSettings.getState();
  const patch: Partial<Settings> = {};
  const hasMoney = local.people.length + local.entries.length + local.expenses.length > 0;
  for (const key of Object.keys(incoming) as (keyof typeof incoming)[]) {
    const value = incoming[key];
    if (value === undefined) continue;
    if (key === 'currency') {
      if (!hasMoney) patch.currency = value as string;
    } else if (key === 'name') {
      if (!current.name.trim()) patch.name = value as string;
    } else if (current[key] === DEFAULT_SETTINGS[key]) {
      (patch as Record<string, unknown>)[key] = value;
    }
  }
  current.update(patch);
}

/** Deletes every record and preference on this device and returns to onboarding. */
export async function eraseEverything(): Promise<boolean> {
  await cancelAllReminders();
  if (!persist(() => eraseAllRows())) return false;
  await db().flush();
  resetTaskRuntime();
  useNotes.setState({ notes: [] });
  useTasks.setState({ tasks: [] });
  useLogs.setState({ logs: [] });
  useLedger.setState({ people: [], entries: [], expenses: [] });
  const fresh = freshSettings();
  useSettings.setState(fresh);
  applySettings(fresh);
  useSession.setState({ locked: false });
  return true;
}
