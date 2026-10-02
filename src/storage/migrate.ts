import { GameError } from '../engine/story';
import { migrations } from '../generated/migrations';
import type { Database } from './database';
export async function migrate(database: Database) {
  await database.transaction(async connection => {
    const row = await connection.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    const current = row?.user_version ?? 0;
    if (current > migrations.length) throw new GameError('incompatible_content', 'Newer database');
    for (const item of migrations) {
      if (item.version <= current) continue;
      await connection.execAsync(item.sql);
      await connection.execAsync(`PRAGMA user_version = ${item.version}`);
    }
  });
}
