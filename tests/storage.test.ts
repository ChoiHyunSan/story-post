import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCatalog, latestReleases, libraryReleases } from '../src/content/catalog';
import { GameError } from '../src/engine/story';
import { migrations } from '../src/generated/migrations';
import { createDatabase, type Connection } from '../src/storage/database';
import { migrate } from '../src/storage/migrate';
import { createRepository } from '../src/storage/repository';
const cleanup: (() => void)[] = [];
afterEach(() => { while (cleanup.length) cleanup.pop()!(); });
function connection(db: DatabaseSync): Connection {
  return {
    async execAsync(sql) { db.exec(sql); },
    async runAsync(sql, ...params) { return { changes: Number(db.prepare(sql).run(...params).changes) }; },
    async getFirstAsync<T>(sql: string, ...params: (string | number | null)[]) { return (db.prepare(sql).get(...params) as T | undefined) ?? null; },
    async getAllAsync<T>(sql: string, ...params: (string | number | null)[]) { return db.prepare(sql).all(...params) as T[]; },
  };
}
async function setup(path = ':memory:') {
  const native = new DatabaseSync(path); cleanup.push(() => native.close());
  const sql = connection(native); const database = await createDatabase(sql); await migrate(database);
  let id = 0; let time = 1000;
  const catalog = createCatalog(true);
  const repository = createRepository(database, catalog, () => `run-${++id}`, () => time++);
  await repository.register();
  return { native, sql, database, repository, release: catalog[0], catalog };
}
function code(expected: string) { return (error: unknown) => error instanceof GameError && error.code === expected; }
test('migration is repeatable and rejects a newer database without resetting it', async () => {
  const { database, native } = await setup(); await migrate(database);
  native.exec('PRAGMA user_version=3');
  await assert.rejects(migrate(database), code('incompatible_content'));
  assert.equal(native.prepare('PRAGMA user_version').get()?.user_version, 3);
});
test('version 1 settings migrate without losing supported preferences', async () => {
  const native = new DatabaseSync(':memory:'); cleanup.push(() => native.close());
  native.exec(migrations[0].sql);
  native.exec('PRAGMA user_version=1');
  native.prepare('UPDATE app_settings SET text_scale=1.5,sound_enabled=0,reduce_motion=1 WHERE singleton_id=1').run();
  const database = await createDatabase(connection(native));
  await migrate(database);
  assert.equal(native.prepare('PRAGMA user_version').get()?.user_version, 2);
  assert.deepEqual({ ...native.prepare('SELECT text_scale,reduce_motion FROM app_settings').get() },
    { text_scale: 1.5, reduce_motion: 1 });
  assert.deepEqual(native.prepare('PRAGMA table_info(app_settings)').all().map(row => row.name),
    ['singleton_id', 'text_scale', 'reduce_motion']);
});
test('file-backed save resumes after database close and reopen', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'story-post-test-')); cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'game.db'); const first = await setup(path);
  const start = await first.repository.start(first.release);
  await first.repository.choose(start, 'open');
  cleanup.pop()!(); // Close before reopening to model a new app lifetime.
  const second = await setup(path); const restored = await second.repository.load('foundation-check');
  assert.equal(restored?.run.current_node_id, 'reply'); assert.equal(restored?.flags.opened, true);
  assert.equal(restored?.history[0].choice_id, 'open');
});
test('story summary reports progress and collected endings for the library', async () => {
  const { repository, release } = await setup();
  assert.deepEqual(await repository.summary(release.story.storyId), { run: null, endingIds: [] });
  let run = await repository.start(release);
  run = await repository.choose(run, 'open');
  assert.deepEqual(await repository.summary(release.story.storyId), {
    run: { content_version: 1, status: 'active', revision: 1, updated_at_ms: run.run.updated_at_ms },
    endingIds: [],
  });
  run = await repository.choose(run, 'read');
  assert.deepEqual(await repository.summary(release.story.storyId), {
    run: { content_version: 1, status: 'completed', revision: 2, updated_at_ms: run.run.updated_at_ms },
    endingIds: ['letter-read'],
  });
});
test('little post office resumes mid-route after reopen and records its ending', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'story-post-content-test-'));
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'game.db');
  const first = await setup(path);
  const release = first.catalog.find(item => item.story.storyId === 'little-post-office' && item.story.version === 1)!;
  let snapshot = await first.repository.start(release);
  for (const choice of ['accept-first-letter', 'show-warning', 'go-with-sora']) {
    snapshot = await first.repository.choose(snapshot, choice);
  }
  assert.equal(snapshot.run.current_node_id, 'lighthouse-road');
  cleanup.pop()!();
  const second = await setup(path);
  const restored = await second.repository.load('little-post-office');
  assert.equal(restored?.run.current_node_id, 'lighthouse-road');
  assert.equal(restored?.flags['with-sora'], true);
  const lastLetter = await second.repository.choose(restored!, 'enter-together');
  const ending = await second.repository.choose(lastLetter, 'return-ledger');
  assert.equal(ending.run.status, 'completed');
  assert.equal(ending.run.current_node_id, 'returned-ending');
  const unlocks = await second.repository.endings('little-post-office');
  assert.equal(unlocks.length, 1);
  assert.equal(unlocks[0].ending_id, 'letters-returned');
  assert.ok(unlocks[0].unlocked_at_ms >= restored!.run.updated_at_ms);
});
test('little post office v2 resumes its expanded route after reopen', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'story-post-v2-content-test-'));
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'game.db');
  const first = await setup(path);
  const release = first.catalog.find(item => item.story.storyId === 'little-post-office' && item.story.version === 2)!;
  let snapshot = await first.repository.start(release);
  for (const choice of ['accept-first-letter', 'show-warning', 'enter-bookshop-together',
    'read-address-book', 'leave-before-answer', 'walk-with-sora']) {
    snapshot = await first.repository.choose(snapshot, choice);
  }
  assert.equal(snapshot.run.current_node_id, 'lighthouse-room');
  assert.equal(snapshot.run.content_version, 2);
  cleanup.pop()!();
  const second = await setup(path);
  let restored = (await second.repository.load('little-post-office'))!;
  assert.equal(restored.run.current_node_id, 'lighthouse-room');
  assert.equal(restored.release.story.version, 2);
  for (const choice of ['sort-undelivered-mail', 'leave-sealed', 'let-sora-turn-key',
    'take-final-mail-together', 'return-ledger']) {
    restored = await second.repository.choose(restored, choice);
  }
  assert.equal(restored.run.status, 'completed');
  assert.equal(restored.run.current_node_id, 'returned-ending');
  assert.equal((await second.repository.endings('little-post-office'))[0].ending_id, 'letters-returned');
});
test('two rapid choices commit only one transition', async () => {
  const { repository, release } = await setup(); const run = await repository.start(release);
  const results = await Promise.allSettled([repository.choose(run, 'open'), repository.choose(run, 'wait')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await repository.load(release.story.storyId))?.run.revision, 1);
});
test('failed history insert rolls back node and flag updates, queue remains usable', async () => {
  const { repository, release, sql } = await setup(); const run = await repository.start(release);
  const original = sql.runAsync.bind(sql);
  sql.runAsync = async (query, ...params) => { if (query.startsWith('INSERT INTO choice_history')) throw new Error('disk failure'); return original(query, ...params); };
  await assert.rejects(repository.choose(run, 'open'), code('storage_failure'));
  sql.runAsync = original;
  const restored = await repository.load(release.story.storyId);
  assert.equal(restored?.run.current_node_id, 'arrival'); assert.equal(restored?.flags.opened, false); assert.equal(restored?.run.revision, 0);
  assert.equal((await repository.choose(restored!, 'open')).run.revision, 1);
});
test('ending failure rolls back completion and the second selection', async () => {
  const { repository, release, sql } = await setup(); const run = await repository.choose(await repository.start(release), 'open');
  const original = sql.runAsync.bind(sql);
  sql.runAsync = async (query, ...params) => { if (query.startsWith('INSERT INTO ending_unlock')) throw new Error('disk failure'); return original(query, ...params); };
  await assert.rejects(repository.choose(run, 'read'), code('storage_failure'));
  sql.runAsync = original;
  assert.equal((await repository.load(release.story.storyId))?.run.status, 'active');
  assert.equal((await repository.load(release.story.storyId))?.run.revision, 1);
  assert.equal((await repository.endings(release.story.storyId)).length, 0);
});
test('restarting preserves endings and reset clears player data only', async () => {
  const { repository, release, catalog } = await setup();
  const first = await repository.start(release); const middle = await repository.choose(first, 'open');
  await repository.choose(middle, 'read'); await repository.start(release, true);
  assert.equal((await repository.endings(release.story.storyId)).length, 1);
  await repository.saveSettings({ text_scale: 1.5, reduce_motion: 1 });
  assert.equal((await repository.settings()).text_scale, 1.5);
  await repository.reset();
  const report = await repository.inspect();
  assert.equal(report.counts.story_release, catalog.length); assert.equal(report.counts.playthrough, 0);
  assert.equal(report.counts.choice_history, 0); assert.equal(report.counts.ending_unlock, 0);
  assert.equal((await repository.settings()).text_scale, 1);
});
test('invalid settings roll back and preserve the previous preferences', async () => {
  const { repository } = await setup();
  await assert.rejects(repository.saveSettings({ text_scale: 3, reduce_motion: 0 }),
    code('storage_failure'));
  const settings = await repository.settings();
  assert.deepEqual({ ...settings }, { text_scale: 1, reduce_motion: 0 });
});
test('failed restart keeps old active playthrough', async () => {
  const { repository, release, sql } = await setup(); const run = await repository.start(release);
  const original = sql.runAsync.bind(sql);
  sql.runAsync = async (query, ...params) => { if (query.startsWith('INSERT INTO playthrough')) throw new Error('disk failure'); return original(query, ...params); };
  await assert.rejects(repository.start(release, true), code('storage_failure'));
  sql.runAsync = original;
  assert.equal((await repository.load(release.story.storyId))?.run.playthrough_id, run.run.playthrough_id);
  assert.equal((await repository.load(release.story.storyId))?.run.status, 'active');
});
test('immutable content mismatch and unavailable old content preserve saved progress', async () => {
  const { repository, database, release } = await setup(); await repository.start(release);
  const changed = createRepository(database, [{ ...release, hash: 'b'.repeat(64) }], () => 'other');
  await assert.rejects(changed.register(), code('incompatible_content'));
  const missing = createRepository(database, [], () => 'other');
  await assert.rejects(missing.load(release.story.storyId), code('incompatible_content'));
  assert.equal((await repository.load(release.story.storyId))?.run.revision, 0);
});
test('invalid choice never writes and old saves remain pinned when a version is added', async () => {
  const { repository, release, database } = await setup(); const run = await repository.start(release);
  await assert.rejects(repository.choose(run, 'missing'), code('invalid_choice'));
  const nextRelease = { ...release, hash: 'b'.repeat(64), story: { ...release.story, version: 2 } };
  const updated = createRepository(database, [release, nextRelease], () => 'new-version'); await updated.register();
  assert.equal((await updated.load(release.story.storyId))?.release.story.version, 1);
  assert.equal((await updated.start(nextRelease, true)).release.story.version, 2);
});
test('release catalog hides all development content in production', () => {
  const development = createCatalog(true);
  assert.equal(createCatalog(false).length, 0);
  assert.deepEqual(development.map(release => `${release.story.storyId}@${release.story.version}`),
    ['foundation-check@1', 'little-post-office@1', 'little-post-office@2', 'little-post-office@3']);
  assert.deepEqual(latestReleases(development).map(release => `${release.story.storyId}@${release.story.version}`),
    ['foundation-check@1', 'little-post-office@3']);
  assert.deepEqual(libraryReleases(development).map(release => `${release.story.storyId}@${release.story.version}`),
    ['little-post-office@3']);
});

test('partial migration failure rolls back DDL and schema version, then can retry', async () => {
  const native = new DatabaseSync(':memory:'); cleanup.push(() => native.close());
  const sql = connection(native); const database = await createDatabase(sql);
  const original = sql.execAsync.bind(sql);
  sql.execAsync = async query => {
    if (query.includes('CREATE TABLE story')) {
      await original('CREATE TABLE partial_write(id INTEGER)');
      throw new Error('migration interrupted');
    }
    return original(query);
  };
  await assert.rejects(migrate(database), /migration interrupted/);
  assert.equal(native.prepare('PRAGMA user_version').get()?.user_version, 0);
  assert.equal(native.prepare("SELECT name FROM sqlite_master WHERE name='partial_write'").get(), undefined);
  sql.execAsync = original;
  await migrate(database);
  assert.equal(native.prepare('PRAGMA user_version').get()?.user_version, 2);
});

test('corrupt saved history is rejected without deleting the original run', async () => {
  const { repository, release, native } = await setup();
  await repository.choose(await repository.start(release), 'open');
  native.prepare("UPDATE choice_history SET to_node_id='missing-node'").run();
  await assert.rejects(repository.load(release.story.storyId), code('invalid_save'));
  assert.equal(native.prepare('SELECT COUNT(*) AS count FROM playthrough').get()?.count, 1);
  assert.equal(native.prepare('SELECT to_node_id FROM choice_history').get()?.to_node_id, 'missing-node');
});
test('save flags and current node must agree with replayed choices', async () => {
  const { repository, release, native } = await setup();
  await repository.choose(await repository.start(release), 'open');
  native.prepare('UPDATE playthrough_flag SET value=0').run();
  await assert.rejects(repository.load(release.story.storyId), code('invalid_save'));
  native.prepare('UPDATE playthrough_flag SET value=1').run();
  native.prepare("UPDATE playthrough SET current_node_id='arrival'").run();
  await assert.rejects(repository.load(release.story.storyId), code('invalid_save'));
});
test('corrupt choice and sequence are reported as invalid saved data', async () => {
  const { repository, release, native } = await setup();
  await repository.choose(await repository.start(release), 'open');
  native.prepare("UPDATE choice_history SET choice_id='missing-choice'").run();
  await assert.rejects(repository.load(release.story.storyId), code('invalid_save'));
  native.prepare("UPDATE choice_history SET choice_id='open', sequence=2").run();
  await assert.rejects(repository.load(release.story.storyId), code('invalid_save'));
});
test('explicit recovery abandons a corrupt run and starts clean without deleting the original', async () => {
  const { repository, release, native } = await setup();
  const corrupt = await repository.choose(await repository.start(release), 'open');
  native.prepare("UPDATE choice_history SET choice_id='missing-choice'").run();
  await assert.rejects(repository.load(release.story.storyId), code('invalid_save'));
  const recovered = await repository.start(release, true);
  assert.equal(recovered.run.current_node_id, release.story.startNodeId);
  assert.equal(recovered.run.revision, 0);
  assert.notEqual(recovered.run.playthrough_id, corrupt.run.playthrough_id);
  const runs = native.prepare('SELECT playthrough_id,status FROM playthrough ORDER BY rowid').all()
    .map(row => ({ playthrough_id: row.playthrough_id, status: row.status }));
  assert.deepEqual(runs, [
    { playthrough_id: corrupt.run.playthrough_id, status: 'abandoned' },
    { playthrough_id: recovered.run.playthrough_id, status: 'active' },
  ]);
  assert.equal(native.prepare('SELECT choice_id FROM choice_history WHERE playthrough_id=?')
    .get(corrupt.run.playthrough_id)?.choice_id, 'missing-choice');
});
