import { tasksTable } from '@/db/repos';
import { toTimestamp } from '@/lib/dates';
import type { ReminderRequest } from '@/lib/reminders';
import { reconcileReminders, resetTaskRuntime, setTaskEffects, useTasks } from '@/stores/tasks';
import { freshDevice, tick } from '@/test/device';

let seq = 0;
const schedule = jest.fn((_req: ReminderRequest): Promise<string | null> => Promise.resolve(`n${++seq}`));
const cancel = jest.fn((_id: string): Promise<void> => Promise.resolve());
const scheduled = jest.fn((): Promise<Set<string> | null> => Promise.resolve(new Set<string>()));

const tasks = () => useTasks.getState();
const task = (id: string) => tasks().tasks.find((t) => t.id === id)!;

beforeEach(async () => {
  await freshDevice();
  seq = 0;
  schedule.mockReset().mockImplementation(() => Promise.resolve(`n${++seq}`));
  cancel.mockReset().mockImplementation(() => Promise.resolve());
  scheduled.mockReset().mockImplementation(() => Promise.resolve(new Set<string>()));
  setTaskEffects({ schedule, cancel, scheduled, today: () => '2026-03-10' });
});

it('cleans up drafts before saving', () => {
  const t = tasks().create({
    title: '  Plan   the sprint ',
    tag: '#Work Stuff',
    dueTime: '10:00',
    remind: true,
    subtasks: [
      { id: '', title: '   ', done: false },
      { id: '', title: 'Board', done: false },
    ],
  })!;
  expect(t).toMatchObject({ title: 'Plan the sprint', tag: 'work-stuff', dueDate: null, dueTime: null, remind: false });
  expect(t.subtasks.map((s) => s.title)).toEqual(['Board']);
  expect(tasks().create({ title: '   ' })).toBeNull();
  expect(tasks().create({ title: 'Standup', repeat: 'daily' })!.dueDate).toBe('2026-03-10');
});

it('queues the next occurrence of a repeating task and takes it back on reopen', async () => {
  const t = tasks().create({
    title: 'Pay rent',
    dueDate: '2026-03-31',
    repeat: 'monthly',
    subtasks: [{ id: 's', title: 'Transfer', done: false }],
  })!;
  tasks().toggleSubtask(t.id, 's');
  const next = tasks().complete(t.id)!;
  expect(next).toMatchObject({ title: 'Pay rent', dueDate: '2026-04-30', anchorDay: 31, doneAt: null });
  expect(next.subtasks[0].done).toBe(false);
  expect(await tasksTable.loadAll()).toHaveLength(2);

  tasks().reopen(t.id);
  const rows = await tasksTable.loadAll();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ id: t.id, doneAt: null });
  expect(tasks().tasks.map((x) => x.id)).toEqual([t.id]);
});

it('keeps a spawned occurrence once it has been edited', () => {
  const t = tasks().create({ title: 'Water plants', dueDate: '2026-03-10', repeat: 'weekly' })!;
  const next = tasks().complete(t.id)!;
  expect(next.dueDate).toBe('2026-03-17');
  tasks().update(next.id, { title: 'Water the plants' });
  tasks().reopen(t.id);
  expect(tasks().tasks).toHaveLength(2);
});

it('re-plans a reminder only when its time or text changes', async () => {
  const t = tasks().create({ title: 'Call bank', dueDate: '2099-01-05', dueTime: '10:00', remind: true })!;
  await tick();
  expect(schedule).toHaveBeenCalledTimes(1);
  expect(schedule).toHaveBeenLastCalledWith(
    expect.objectContaining({ taskId: t.id, title: 'Call bank', at: toTimestamp('2099-01-05', '10:00') }),
  );
  expect(task(t.id).notifId).toBe('n1');

  tasks().update(t.id, { notes: 'Ask about the card' });
  await tick();
  expect(schedule).toHaveBeenCalledTimes(1);

  tasks().update(t.id, { dueTime: '11:30' });
  await tick();
  expect(cancel).toHaveBeenCalledWith('n1');
  expect(task(t.id).notifId).toBe('n2');

  tasks().complete(t.id);
  await tick();
  expect(cancel).toHaveBeenCalledWith('n2');
  expect(task(t.id).notifId).toBeNull();
  expect((await tasksTable.loadAll())[0].notifId).toBeNull();
});

it('cancels a reminder that finishes scheduling after a newer edit', async () => {
  const pending: ((id: string) => void)[] = [];
  schedule.mockImplementation(() => new Promise<string | null>((resolve) => pending.push(resolve)));
  const t = tasks().create({ title: 'A', dueDate: '2099-01-05', remind: true })!;
  tasks().update(t.id, { title: 'B' });
  expect(pending).toHaveLength(2);
  pending[0]('old');
  pending[1]('new');
  await tick();
  expect(cancel).toHaveBeenCalledWith('old');
  expect(task(t.id).notifId).toBe('new');
});

it('cancels reminders of tasks that are deleted', async () => {
  const t = tasks().create({ title: 'A', dueDate: '2099-01-05', remind: true })!;
  await tick();
  tasks().remove(t.id);
  await tick();
  expect(cancel).toHaveBeenCalledWith('n1');
  tasks().restore(t.id);
  await tick();
  expect(task(t.id).notifId).toBe('n2');
  tasks().destroy(t.id);
  expect(cancel).toHaveBeenCalledWith('n2');
  expect(await tasksTable.loadAll()).toEqual([]);
});

it('re-queues lost reminders and cancels strays on start-up', async () => {
  const t = tasks().create({ title: 'A', dueDate: '2099-01-05', remind: true })!;
  await tick();
  resetTaskRuntime();
  scheduled.mockImplementation(() => Promise.resolve(new Set(['stray'])));
  await reconcileReminders();
  await tick();
  expect(cancel).toHaveBeenCalledWith('stray');
  expect(task(t.id).notifId).toBe('n2');
});
