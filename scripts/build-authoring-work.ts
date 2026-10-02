import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { importAuthoringCsv } from './authoring-csv';
import { loadAuthoringManifest } from './authoring-manifest';
import { createAuthoringDatabase, exportPresentationPackage, exportRuntimeStory } from './authoring-store';

for (const entry of loadAuthoringManifest()) {
  const database = createAuthoringDatabase();
  const key = { storyId: entry.storyId, workingVersion: entry.workingVersion, locale: entry.locale };
  try {
    importAuthoringCsv(database, entry.directory);
    const storyOutput = `${JSON.stringify(exportRuntimeStory(database, key), null, 2)}\n`;
    const status = database.prepare('SELECT status FROM story_work WHERE story_id = ? AND working_version = ? AND locale = ?')
      .get(entry.storyId, entry.workingVersion, entry.locale) as { status: string } | undefined;
    const presentationOutput = `${JSON.stringify(exportPresentationPackage(database, key, {
      allowPlanned: status?.status === 'draft',
    }), null, 2)}\n`;
    if (status?.status === 'released') {
      if (!existsSync(entry.storyPath) || readFileSync(entry.storyPath, 'utf8') !== storyOutput) {
        throw new Error(`Released authoring tables differ from immutable story JSON: ${entry.storyId}@${entry.workingVersion}`);
      }
      if (process.argv.includes('--check')) {
        if (!existsSync(entry.presentationPath) || readFileSync(entry.presentationPath, 'utf8') !== presentationOutput) {
          throw new Error(`Run pnpm authoring:build to update ${entry.presentationPath}`);
        }
      } else {
        mkdirSync(dirname(entry.presentationPath), { recursive: true });
        writeFileSync(entry.presentationPath, presentationOutput);
      }
    } else if (!process.argv.includes('--check')) {
      const previewDirectory = `.authoring/previews/${entry.storyId}-v${entry.workingVersion}`;
      mkdirSync(previewDirectory, { recursive: true });
      writeFileSync(`${previewDirectory}/story.json`, storyOutput);
      writeFileSync(`${previewDirectory}/presentation.json`, presentationOutput);
    }
    console.log(`${status?.status === 'released' ? 'Verified released outputs' : 'Validated working tables'} for ${entry.storyId}@${entry.workingVersion}/${entry.locale}`);
  } finally {
    database.close();
  }
}
