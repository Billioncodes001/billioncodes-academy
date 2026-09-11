import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StorageCell, type DeviceStorage } from '../src/storage';

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};

function memory() {
  const data = new Map<string, string>();
  const events: string[] = [];
  const storage: DeviceStorage = {
    async getItem(key) { events.push(`get:${key}`); return data.get(key) ?? null; },
    async setItem(key, raw) { events.push(`set:${key}`); data.set(key, raw); },
    async removeItem(key) { events.push(`remove:${key}`); data.delete(key); },
  };
  return { data, events, storage };
}

test('hydration does not overwrite saved state with defaults, including delayed reads', async () => {
  const mem = memory();
  const read = deferred<string | null>();
  mem.storage.getItem = () => read.promise;
  const cell = new StorageCell(mem.storage, 'progress', 0, JSON.parse);
  const first = cell.hydrate();
  assert.equal(cell.hydrate(), first);
  assert.equal(await cell.update(() => 99), false);
  assert.equal(await cell.reset(), false);
  read.resolve('42');
  await first;
  assert.equal(cell.getSnapshot().value, 42);
  assert.equal(mem.events.length, 0);
});

test('empty storage becomes ready without an automatic write', async () => {
  const mem = memory();
  const cell = new StorageCell(mem.storage, 'progress', 0, JSON.parse);
  await cell.hydrate();
  assert.equal(cell.getSnapshot().phase, 'ready');
  assert.deepEqual(mem.events, ['get:progress']);
});

test('failed and malformed reads remain blocked until explicit recovery', async () => {
  const mem = memory();
  mem.data.set('progress', '{bad');
  const cell = new StorageCell(mem.storage, 'progress', 0, JSON.parse);
  await cell.hydrate();
  assert.equal(cell.getSnapshot().phase, 'blocked');
  assert.equal(await cell.update(() => 2), false);
  assert.equal(mem.data.get('progress'), '{bad');
  mem.data.set('progress', '3');
  await cell.hydrate();
  assert.equal(cell.getSnapshot().value, 3);
});

test('explicit reset can recover unreadable storage, never clears another key', async () => {
  const mem = memory();
  mem.data.set('progress', '{bad'); mem.data.set('catalog', 'keep');
  const cell = new StorageCell(mem.storage, 'progress', 0, JSON.parse);
  await cell.hydrate();
  assert.equal(await cell.reset(), true);
  assert.equal(mem.data.has('progress'), false);
  assert.equal(mem.data.get('catalog'), 'keep');
});

test('writes serialize: older pending drafts cannot resurrect after reset', async () => {
  const mem = memory();
  const gate = deferred<void>();
  const set = mem.storage.setItem;
  let first = true;
  mem.storage.setItem = async (key, raw) => { if (first) { first = false; await gate.promise; } await set(key, raw); };
  const cell = new StorageCell(mem.storage, 'progress', 0, JSON.parse);
  await cell.hydrate();
  const write1 = cell.update(value => value + 1);
  const write2 = cell.update(value => value + 1);
  const reset = cell.reset();
  assert.equal(cell.getSnapshot().value, 0);
  assert.equal(cell.getSnapshot().pending, 3);
  gate.resolve();
  await Promise.all([write1, write2, reset]);
  assert.equal(mem.data.has('progress'), false);
  assert.equal(cell.getSnapshot().pending, 0);
  assert.deepEqual(mem.events, ['get:progress', 'set:progress', 'set:progress', 'remove:progress']);
});

test('a failed write preserves the latest in-memory value and is retryable', async () => {
  const mem = memory();
  const set = mem.storage.setItem;
  mem.storage.setItem = async () => { throw new Error('Disk full'); };
  const cell = new StorageCell(mem.storage, 'progress', 0, JSON.parse);
  await cell.hydrate();
  assert.equal(await cell.update(() => 12), false);
  assert.equal(cell.getSnapshot().value, 12);
  assert.match(cell.getSnapshot().error!, /memory only/);
  mem.storage.setItem = set;
  assert.equal(await cell.retryWrite(), true);
  assert.equal(mem.data.get('progress'), '12');
  assert.equal(cell.getSnapshot().error, null);
});

test('failed removal retries removal rather than writing a replacement default', async () => {
  const mem = memory();
  mem.data.set('catalog', '12');
  const remove = mem.storage.removeItem;
  mem.storage.removeItem = async () => { throw new Error('Unavailable'); };
  const cell = new StorageCell(mem.storage, 'catalog', null, JSON.parse);
  await cell.hydrate();
  assert.equal(await cell.reset(), false);
  mem.storage.removeItem = remove;
  assert.equal(await cell.retryWrite(), true);
  assert.equal(mem.data.has('catalog'), false);
});

test('subscribers see immutable snapshots and can unsubscribe', async () => {
  const mem = memory();
  const cell = new StorageCell(mem.storage, 'progress', 0, JSON.parse);
  let updates = 0;
  const initial = cell.getSnapshot();
  const off = cell.subscribe(() => updates++);
  await cell.hydrate(); off();
  const count = updates;
  await cell.update(() => 1);
  assert.equal(updates, count);
  assert.equal(initial.phase, 'loading');
});
