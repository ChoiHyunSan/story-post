import { writeFileSync } from 'node:fs';
import { exportRuntimeStory, openAuthoringDatabase } from './authoring-store';

const [databasePath, storyId, rawVersion, locale, outputPath] = process.argv.slice(2);
const workingVersion = Number(rawVersion);
if (!databasePath || !storyId || !Number.isInteger(workingVersion) || !locale || !outputPath) {
  throw new Error('Usage: pnpm authoring:export <authoring.sqlite> <story-id> <version> <locale> <output.json>');
}

const database = openAuthoringDatabase(databasePath);
try {
  const story = exportRuntimeStory(database, { storyId, workingVersion, locale });
  writeFileSync(outputPath, `${JSON.stringify(story, null, 2)}\n`);
  console.log(`Exported ${story.storyId}@${story.version}/${story.locale} to ${outputPath}`);
} finally {
  database.close();
}
