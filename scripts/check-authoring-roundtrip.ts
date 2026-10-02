import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportAuthoringCsv, importAuthoringCsv } from './authoring-csv';
import { createAuthoringDatabase, exportRuntimeStory, importRuntimeStory } from './authoring-store';

const sourcePath = 'content/stories/little-post-office/episode-01-v3.json';
const source = JSON.parse(readFileSync(sourcePath, 'utf8')) as unknown;
const database = createAuthoringDatabase();
const csvDirectory = mkdtempSync(join(tmpdir(), 'story-post-authoring-'));
try {
  const key = importRuntimeStory(database, source);
  const exported = exportRuntimeStory(database, key);
  assert.deepStrictEqual(exported, source, 'Authoring round-trip changed the v3 runtime story');
  exportAuthoringCsv(database, csvDirectory);
  const csvDatabase = createAuthoringDatabase();
  try {
    importAuthoringCsv(csvDatabase, csvDirectory);
    const csvExported = exportRuntimeStory(csvDatabase, key);
    assert.deepStrictEqual(csvExported, source, 'CSV round-trip changed the v3 runtime story');
  } finally {
    csvDatabase.close();
  }
  console.log(`Verified SQLite and CSV round-trips for ${key.storyId}@${key.workingVersion}/${key.locale}`);
} finally {
  database.close();
  rmSync(csvDirectory, { recursive: true, force: true });
}
