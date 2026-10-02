import { existsSync } from 'node:fs';
import { importAuthoringCsv } from './authoring-csv';
import { createAuthoringDatabase } from './authoring-store';

const [sourceDirectory, databasePath] = process.argv.slice(2);
if (!sourceDirectory || !databasePath) {
  throw new Error('Usage: pnpm authoring:csv:import <source-directory> <authoring.sqlite>');
}
if (existsSync(databasePath)) throw new Error(`Refusing to overwrite existing database: ${databasePath}`);

const database = createAuthoringDatabase(databasePath);
try {
  importAuthoringCsv(database, sourceDirectory);
  console.log(`Imported authoring CSV tables into ${databasePath}`);
} finally {
  database.close();
}
