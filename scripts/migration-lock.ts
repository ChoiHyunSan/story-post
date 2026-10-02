export type MigrationHashes = Record<string, string>;

const migrationName = /^\d{3}_[a-z0-9-]+\.sql$/;
const sha256 = /^[0-9a-f]{64}$/;

export function validateMigrationLock(current: MigrationHashes, previous: unknown): void {
  if (!previous || typeof previous !== 'object' || Array.isArray(previous)) {
    throw new Error('Invalid migration lock');
  }
  for (const [file, hash] of Object.entries(previous)) {
    if (!migrationName.test(file) || typeof hash !== 'string' || !sha256.test(hash)) {
      throw new Error('Invalid migration lock');
    }
    if (current[file] !== hash) {
      throw new Error(`Immutable migration changed or removed: ${file}. Add a new sequential migration instead.`);
    }
  }
}

export function serializeMigrationLock(hashes: MigrationHashes): string {
  return `${JSON.stringify(hashes, null, 2)}\n`;
}
