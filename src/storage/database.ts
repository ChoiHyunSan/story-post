export type Param = string | number | null;
export interface Connection {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: Param[]): Promise<{ changes: number }>;
  getFirstAsync<T>(sql: string, ...params: Param[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: Param[]): Promise<T[]>;
}
export interface Database { transaction<T>(work: (connection: Connection) => Promise<T>): Promise<T> }

export async function createDatabase(connection: Connection): Promise<Database> {
  await connection.execAsync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  let queue: Promise<unknown> = Promise.resolve();
  // All reads and writes use this queue and this connection. No unrelated query can
  // accidentally enter an async transaction; failed jobs do not poison the queue.
  return { transaction<T>(work: (connection: Connection) => Promise<T>): Promise<T> {
    const result = queue.then(async () => {
      await connection.execAsync('BEGIN IMMEDIATE');
      try {
        const value = await work(connection);
        await connection.execAsync('COMMIT');
        return value;
      } catch (error) {
        await connection.execAsync('ROLLBACK');
        throw error;
      }
    });
    queue = result.catch(() => undefined);
    return result;
  } };
}
