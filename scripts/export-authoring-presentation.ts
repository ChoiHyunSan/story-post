import { writeFileSync } from 'node:fs';
import { exportPresentationPackage, openAuthoringDatabase } from './authoring-store';

const [databasePath, storyId, rawVersion, locale, outputPath] = process.argv.slice(2);
const workingVersion = Number(rawVersion);
if (!databasePath || !storyId || !Number.isInteger(workingVersion) || !locale || !outputPath) {
  throw new Error('Usage: pnpm authoring:export:presentation <authoring.sqlite> <story-id> <version> <locale> <output.json>');
}

const database = openAuthoringDatabase(databasePath);
try {
  const presentation = exportPresentationPackage(database, { storyId, workingVersion, locale });
  writeFileSync(outputPath, `${JSON.stringify(presentation, null, 2)}\n`);
  console.log(`Exported presentation package for ${storyId}@${workingVersion}/${locale} to ${outputPath}`);
} finally {
  database.close();
}
