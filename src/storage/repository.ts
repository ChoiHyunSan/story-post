import type { Release } from '../content/catalog';
import { findRelease } from '../content/catalog';
import { advance, GameError, initialFlags, type Flags } from '../engine/story';
import type { Connection, Database } from './database';

interface Run {
  playthrough_id: string; story_id: string; content_version: number;
  current_node_id: string; status: 'active' | 'completed' | 'abandoned';
  revision: number; created_at_ms: number; updated_at_ms: number; finished_at_ms: number | null;
}
export interface History { sequence: number; from_node_id: string; choice_id: string; to_node_id: string }
export interface EndingUnlock { ending_id: string; unlocked_at_ms: number }
export interface Snapshot { run: Run; flags: Flags; release: Release; history: History[] }
export interface Settings { text_scale: number; reduce_motion: number }
export type StorySummaryRun = Pick<Run, 'content_version' | 'status' | 'revision' | 'updated_at_ms'>;
export interface StorySummary {
  run: StorySummaryRun | null;
  endingIds: string[];
}
export const tableNames = ['story', 'story_release', 'playthrough', 'playthrough_flag', 'choice_history', 'ending_unlock', 'app_settings'] as const;
export function createRepository(database: Database, catalog: Release[], uuid: () => string, clock = Date.now) {
  function transact<T>(work: (connection: Connection) => Promise<T>): Promise<T> {
    return database.transaction(work).catch((error: unknown) => {
      if (error instanceof GameError) throw error;
      throw new GameError('storage_failure');
    });
  }
  async function snapshot(connection: Connection, run: Run): Promise<Snapshot> {
    const release = findRelease(catalog, run.story_id, run.content_version);
    const registered = await connection.getFirstAsync<{ content_hash: string }>(
      'SELECT content_hash FROM story_release WHERE story_id=? AND content_version=?', run.story_id, run.content_version);
    if (registered?.content_hash !== release.hash) throw new GameError('incompatible_content');
    const node = release.story.nodes.find(item => item.id === run.current_node_id);
    if (!node || (run.status === 'completed') !== (node.type === 'ending') ||
      run.revision >= release.story.nodes.length) throw new GameError('invalid_save');
    const flags = initialFlags(release.story);
    for (const row of await connection.getAllAsync<{ flag_id: string; value: number }>(
      'SELECT flag_id,value FROM playthrough_flag WHERE playthrough_id=?', run.playthrough_id)) {
      if (!Object.hasOwn(flags, row.flag_id)) throw new GameError('invalid_save');
      flags[row.flag_id] = row.value === 1;
    }
    const history = await connection.getAllAsync<History>(
      'SELECT sequence,from_node_id,choice_id,to_node_id FROM choice_history WHERE playthrough_id=? ORDER BY sequence', run.playthrough_id);
    if (history.length !== run.revision || history.some((item, index) => item.sequence !== index + 1)) {
      throw new GameError('invalid_save');
    }
    // The database cannot enforce references into bundled JSON. Replaying validates
    // those references and prevents corrupt history from crashing the reader later.
    let replayNodeId = release.story.startNodeId;
    let replayFlags = initialFlags(release.story);
    for (const item of history) {
      if (item.from_node_id !== replayNodeId) throw new GameError('invalid_save');
      try {
        const next = advance(release.story, replayNodeId, replayFlags, item.choice_id);
        if (next.node.id !== item.to_node_id) throw new GameError('invalid_save');
        replayNodeId = next.node.id; replayFlags = next.flags;
      } catch { throw new GameError('invalid_save'); }
    }
    if (replayNodeId !== run.current_node_id ||
      Object.keys(replayFlags).some(key => replayFlags[key] !== flags[key])) throw new GameError('invalid_save');
    return { run, flags, release, history };
  }
  return {
    async register() {
      return transact(async connection => {
        for (const release of catalog) {
          const story = release.story;
          await connection.runAsync('INSERT INTO story(story_id) VALUES (?) ON CONFLICT DO NOTHING', story.storyId);
          const existing = await connection.getFirstAsync<{ content_hash: string }>(
            'SELECT content_hash FROM story_release WHERE story_id=? AND content_version=?', story.storyId, story.version);
          if (existing && existing.content_hash !== release.hash) throw new GameError('incompatible_content');
          if (!existing) await connection.runAsync('INSERT INTO story_release VALUES (?,?,?,?,?,?)',
            story.storyId, story.version, release.hash, story.schemaVersion, story.engineContractVersion, story.startNodeId);
        }
      });
    },
    async load(storyId: string): Promise<Snapshot | null> {
      return transact(async connection => {
        const run = await connection.getFirstAsync<Run>(
          'SELECT * FROM playthrough WHERE story_id=? ORDER BY rowid DESC LIMIT 1', storyId);
        return run ? snapshot(connection, run) : null;
      });
    },
    async start(release: Release, restart = false): Promise<Snapshot> {
      return transact(async connection => {
        const active = await connection.getFirstAsync<Run>(
          "SELECT * FROM playthrough WHERE story_id=? AND status='active'", release.story.storyId);
        if (active && !restart) return snapshot(connection, active);
        const now = Math.max(clock(), active?.updated_at_ms ?? 0);
        if (active) await connection.runAsync(
          "UPDATE playthrough SET status='abandoned',updated_at_ms=?,finished_at_ms=? WHERE playthrough_id=?", now, now, active.playthrough_id);
        const run: Run = { playthrough_id: uuid(), story_id: release.story.storyId,
          content_version: release.story.version, current_node_id: release.story.startNodeId,
          status: 'active', revision: 0, created_at_ms: now, updated_at_ms: now, finished_at_ms: null };
        await connection.runAsync(`INSERT INTO playthrough
          (playthrough_id,story_id,content_version,current_node_id,status,revision,created_at_ms,updated_at_ms)
          VALUES (?,?,?,?,'active',0,?,?)`, run.playthrough_id, run.story_id, run.content_version, run.current_node_id, now, now);
        return snapshot(connection, run);
      });
    },
    async choose(expected: Snapshot, choiceId: string): Promise<Snapshot> {
      return transact(async connection => {
        const run = await connection.getFirstAsync<Run>('SELECT * FROM playthrough WHERE playthrough_id=?', expected.run.playthrough_id);
        if (!run || run.status !== 'active' || run.revision !== expected.run.revision ||
          run.current_node_id !== expected.run.current_node_id) throw new GameError('stale_revision');
        const current = await snapshot(connection, run);
        const next = advance(current.release.story, run.current_node_id, current.flags, choiceId);
        const now = Math.max(clock(), run.updated_at_ms);
        const completed = next.node.type === 'ending';
        const changed = await connection.runAsync(`UPDATE playthrough SET current_node_id=?, revision=revision+1,
          status=?, updated_at_ms=?, finished_at_ms=? WHERE playthrough_id=? AND revision=? AND status='active'`,
          next.node.id, completed ? 'completed' : 'active', now, completed ? now : null, run.playthrough_id, run.revision);
        if (changed.changes !== 1) throw new GameError('stale_revision');
        for (const [key, value] of Object.entries(next.flags)) {
          await connection.runAsync(`INSERT INTO playthrough_flag VALUES (?,?,?)
            ON CONFLICT(playthrough_id,flag_id) DO UPDATE SET value=excluded.value`, run.playthrough_id, key, Number(value));
        }
        await connection.runAsync('INSERT INTO choice_history VALUES (?,?,?,?,?,?)',
          run.playthrough_id, run.revision + 1, run.current_node_id, choiceId, next.node.id, now);
        if (next.node.type === 'ending') await connection.runAsync(`INSERT INTO ending_unlock VALUES (?,?,?,?)
          ON CONFLICT(story_id,ending_id) DO NOTHING`, run.story_id, next.node.endingId, run.content_version, now);
        return snapshot(connection, { ...run, current_node_id: next.node.id, revision: run.revision + 1,
          status: completed ? 'completed' : 'active', updated_at_ms: now, finished_at_ms: completed ? now : null });
      });
    },
    async endings(storyId: string) {
      return transact(connection => connection.getAllAsync<EndingUnlock>(
        'SELECT ending_id,unlocked_at_ms FROM ending_unlock WHERE story_id=? ORDER BY unlocked_at_ms,ending_id', storyId));
    },
    async summary(storyId: string): Promise<StorySummary> {
      return transact(async connection => {
        const run = await connection.getFirstAsync<StorySummaryRun>(
          'SELECT content_version,status,revision,updated_at_ms FROM playthrough WHERE story_id=? ORDER BY rowid DESC LIMIT 1', storyId);
        const endings = await connection.getAllAsync<{ ending_id: string }>(
          'SELECT ending_id FROM ending_unlock WHERE story_id=? ORDER BY unlocked_at_ms,ending_id', storyId);
        return {
          run: run ? { content_version: run.content_version, status: run.status,
            revision: run.revision, updated_at_ms: run.updated_at_ms } : null,
          endingIds: endings.map(ending => ending.ending_id),
        };
      });
    },
    async settings(): Promise<Settings> {
      return transact(async connection => {
        const result = await connection.getFirstAsync<Settings>('SELECT text_scale,reduce_motion FROM app_settings WHERE singleton_id=1');
        if (!result) throw new GameError('storage_failure');
        return result;
      });
    },
    async saveSettings(settings: Settings) {
      return transact(async connection => {
        await connection.runAsync('UPDATE app_settings SET text_scale=?,reduce_motion=? WHERE singleton_id=1',
          settings.text_scale, settings.reduce_motion);
      });
    },
    async reset() {
      return transact(async connection => {
        await connection.runAsync('DELETE FROM playthrough');
        await connection.runAsync('DELETE FROM ending_unlock');
        await connection.runAsync('UPDATE app_settings SET text_scale=1,reduce_motion=0 WHERE singleton_id=1');
      });
    },
    async inspect() {
      return transact(async connection => {
        const version = await connection.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
        const counts: Record<string, number> = {};
        for (const table of tableNames) {
          // Only the static allowlist above is interpolated, never user input.
          counts[table] = (await connection.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`))!.count;
        }
        return { version: version?.user_version ?? 0, counts };
      });
    },
  };
}
export type Repository = ReturnType<typeof createRepository>;
