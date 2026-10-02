import { openDatabaseAsync } from 'expo-sqlite';
import { randomUUID } from 'expo-crypto';
import { createCatalog } from '../content/catalog';
import { createDatabase } from './database';
import { migrate } from './migrate';
import { createRepository } from './repository';

export async function openGame() {
  if (__DEV__ && process.env.EXPO_PUBLIC_NATIVE_STORAGE_TEST === '1') {
    const { runNativeStorageCheck } = await import('./dev-smoke');
    await runNativeStorageCheck();
  }
  const connection = await openDatabaseAsync('story-post.db');
  try {
    const database = await createDatabase(connection);
    await migrate(database);
    const catalog = createCatalog(__DEV__);
    const repository = createRepository(database, catalog, randomUUID);
    await repository.register();
    if (__DEV__) console.info('[StoryPost] local storage initialized');
    return { repository, catalog };
  } catch (error) {
    await connection.closeAsync();
    throw error;
  }
}
// One connection/queue per loaded module and React remounts. Fully reload after storage code changes.
let active: ReturnType<typeof openGame> | undefined;
export function getGame() {
  if (!active) active = openGame().catch(error => { active = undefined; throw error; });
  return active;
}
