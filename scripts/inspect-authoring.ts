import { writeFileSync } from 'node:fs';
import { importAuthoringCsv } from './authoring-csv';
import { loadAuthoringManifest } from './authoring-manifest';
import { buildBranchGraph, buildProductionReport } from './authoring-report';
import { createAuthoringDatabase, exportRuntimeStory } from './authoring-store';

for (const entry of loadAuthoringManifest()) {
  const database = createAuthoringDatabase();
  const key = { storyId: entry.storyId, workingVersion: entry.workingVersion, locale: entry.locale };
  try {
    importAuthoringCsv(database, entry.directory);
    writeFileSync(entry.reportPath, buildProductionReport(database, key));
    writeFileSync(entry.graphPath, buildBranchGraph(exportRuntimeStory(database, key)));
    console.log(`Generated ${entry.reportPath} and ${entry.graphPath}`);
  } finally {
    database.close();
  }
}
