import { openDatabaseAsync, deleteDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { randomUUID } from 'expo-crypto';
import { createCatalog } from '../content/catalog';
import { createDatabase } from './database';
import { migrate } from './migrate';
import { createRepository } from './repository';
import type { Connection } from './database';

function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Native storage check: ${message}`);
}
// Opt-in development verification. The uniquely named temporary database never
// shares a file with player progress and is removed even when a check fails.
export async function runNativeStorageCheck() {
  if (!__DEV__) return;
  const name = `story-post-check-${randomUUID()}.db`;
  let connection: SQLiteDatabase | undefined;
  const catalog = createCatalog(true); const release = catalog.find(item => item.story.storyId === 'foundation-check');
  check(Boolean(release), 'missing technical fixture');
  const fixture = release!;
  let checkpoints = 0;
  try {
    connection = await openDatabaseAsync(name);
    const database = await createDatabase(connection); await migrate(database); await migrate(database);
    const repository = createRepository(database, catalog, randomUUID);
    await repository.register();
    const run = await repository.start(fixture);
    await repository.choose(run, 'open'); checkpoints++;
    await connection.closeAsync(); connection = undefined;
    connection = await openDatabaseAsync(name);
    // Fault injection wraps only this temporary connection's writes.
    let shouldFail = false;
    const real = connection;
    const adapter: Connection = {
      execAsync: sql => real.execAsync(sql),
      getFirstAsync: (sql, ...params) => real.getFirstAsync(sql, ...params),
      getAllAsync: (sql, ...params) => real.getAllAsync(sql, ...params),
      runAsync: (sql, ...params) => {
        if (shouldFail && sql.startsWith('INSERT INTO choice_history')) throw new Error('simulated write failure');
        return real.runAsync(sql, ...params);
      },
    };
    const reopened = await createDatabase(adapter); await migrate(reopened);
    const restoredRepository = createRepository(reopened, catalog, randomUUID);
    await restoredRepository.register();
    const restored = await restoredRepository.load(fixture.story.storyId);
    check(restored?.run.current_node_id === 'reply' && restored.flags.opened, 'close/reopen must restore progress'); checkpoints++;
    shouldFail = true;
    let rejected = false;
    try { await restoredRepository.choose(restored, 'read'); } catch { rejected = true; }
    shouldFail = false;
    const rolledBack = await restoredRepository.load(fixture.story.storyId);
    check(rejected && rolledBack?.run.revision === 1 && rolledBack.run.status === 'active', 'failed write must roll back'); checkpoints++;
    await restoredRepository.choose(rolledBack, 'read');
    check((await restoredRepository.endings(fixture.story.storyId)).length === 1, 'completion unlocks ending'); checkpoints++;
    const restarted = await restoredRepository.start(fixture, true);
    const outcomes = await Promise.allSettled([
      restoredRepository.choose(restarted, 'wait'), restoredRepository.choose(restarted, 'open'),
    ]);
    check(outcomes.filter(result => result.status === 'fulfilled').length === 1, 'duplicate input commits once'); checkpoints++;
    const kept = await restoredRepository.load(fixture.story.storyId);
    check(kept?.run.current_node_id === 'reply', 'second run restored');
    await restoredRepository.choose(kept, 'keep');
    check((await restoredRepository.endings(fixture.story.storyId)).length === 2, 'restart keeps prior ending'); checkpoints++;
    await restoredRepository.saveSettings({ text_scale: 1.5, reduce_motion: 1 });
    check((await restoredRepository.settings()).text_scale === 1.5, 'settings persisted'); checkpoints++;
    await restoredRepository.reset();
    const report = await restoredRepository.inspect();
    check(report.counts.playthrough === 0 && report.counts.ending_unlock === 0 && report.counts.story_release > 0,
      'reset only removes player data'); checkpoints++;
  } finally {
    if (connection) await connection.closeAsync();
    await deleteDatabaseAsync(name);
  }
  console.info(`[StoryPost] NATIVE_STORAGE_CHECK_PASS checkpoints=${checkpoints}`);
}
