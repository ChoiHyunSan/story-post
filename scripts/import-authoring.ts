import { existsSync, readFileSync } from 'node:fs';
import { createAuthoringDatabase, importRuntimeStory } from './authoring-store';

const [sourcePath, databasePath] = process.argv.slice(2);
if (!sourcePath || !databasePath) {
  throw new Error('Usage: pnpm authoring:import <story.json> <authoring.sqlite>');
}
if (existsSync(databasePath)) throw new Error(`Refusing to overwrite existing database: ${databasePath}`);

const database = createAuthoringDatabase(databasePath);
try {
  const key = importRuntimeStory(database, JSON.parse(readFileSync(sourcePath, 'utf8')) as unknown);
  console.log(`Imported ${key.storyId}@${key.workingVersion}/${key.locale} into ${databasePath}`);
} finally {
  database.close();
}
