import { exportAuthoringCsv } from './authoring-csv';
import { openAuthoringDatabase } from './authoring-store';

const [databasePath, outputDirectory] = process.argv.slice(2);
if (!databasePath || !outputDirectory) {
  throw new Error('Usage: pnpm authoring:csv:export <authoring.sqlite> <output-directory>');
}

const database = openAuthoringDatabase(databasePath);
try {
  exportAuthoringCsv(database, outputDirectory);
  console.log(`Exported authoring CSV tables to ${outputDirectory}`);
} finally {
  database.close();
}
