import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { authoringHeaders } from './authoring-contract';
import { loadAuthoringManifest } from './authoring-manifest';

const schema = readFileSync('content/authoring/schema.sql', 'utf8');
const database = new DatabaseSync(':memory:');
database.exec(schema);

const tables = new Set((database.prepare(
  "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
).all() as { name: string }[]).map(row => row.name));

for (const [table, headers] of Object.entries(authoringHeaders)) {
  if (!tables.has(table)) throw new Error(`Missing authoring table: ${table}`);
  const actualColumns = (database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[])
    .map(column => column.name);
  if (actualColumns.join(',') !== headers.join(',')) {
    throw new Error(`Schema columns differ for ${table}: ${actualColumns.join(',')}`);
  }
  const template = readFileSync(`content/authoring/templates/${table}.csv`, 'utf8').trimEnd();
  if (template !== headers.join(',')) throw new Error(`CSV header differs for ${table}`);
}

const foreignKeyErrors = database.prepare('PRAGMA foreign_key_check').all();
if (foreignKeyErrors.length > 0) throw new Error('Authoring schema has foreign key errors');
database.close();
const manifest = loadAuthoringManifest();
const registeredDirectories = new Set(manifest.map(entry => entry.directory.split('/').at(-1)));
const actualDirectories = readdirSync('content/authoring/works', { withFileTypes: true })
  .filter(entry => entry.isDirectory()).map(entry => entry.name);
for (const directory of actualDirectories) {
  if (!registeredDirectories.has(directory)) throw new Error(`Unregistered authoring work: ${directory}`);
}
if (registeredDirectories.size !== actualDirectories.length) {
  throw new Error('Authoring manifest references a missing work directory');
}
console.log(`Verified ${Object.keys(authoringHeaders).length} authoring tables, CSV templates and ${manifest.length} work(s)`);
