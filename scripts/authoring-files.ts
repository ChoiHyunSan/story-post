import { createHash, randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { authoringHeaders, type AuthoringTable } from './authoring-contract';
import { encodeCsv, parseCsv } from './authoring-csv';

export type TableRows = Record<AuthoringTable, Record<string, string>[]>;
const columns = Object.entries(authoringHeaders) as [AuthoringTable, readonly string[]][];

export function readTables(directory: string): TableRows {
  const result = {} as TableRows;
  for (const [table, headers] of columns) {
    const rows = parseCsv(readFileSync(join(directory, `${table}.csv`), 'utf8'));
    if (rows.shift()?.join(',') !== headers.join(',')) throw new Error(`CSV header differs for ${table}`);
    result[table] = rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
  }
  return result;
}

export function tablesRevision(tables: TableRows): string {
  const values = columns.map(([table, headers]) => [table, tables[table].map(row => headers.map(header => row[header] ?? ''))]);
  return createHash('sha256').update(JSON.stringify(values)).digest('hex');
}

export function writeTables(directory: string, tables: TableRows): void {
  mkdirSync(directory, { recursive: true });
  for (const [table, headers] of columns) {
    const target = join(directory, `${table}.csv`);
    const temporary = `${target}.${randomUUID()}.tmp`;
    writeFileSync(temporary, encodeCsv([headers, ...tables[table].map(row => headers.map(header => row[header] ?? ''))]));
    renameSync(temporary, target);
  }
}

export function replaceWorkTables(directory: string, tables: TableRows, rename = renameSync): void {
  const staging = mkdtempSync(join(dirname(directory), '.story-post-save-'));
  const backup = `${staging}.backup`;
  let committed = false;
  try {
    cpSync(directory, staging, { recursive: true });
    writeTables(staging, tables);
    rename(directory, backup);
    try {
      rename(staging, directory);
      committed = true;
    } catch (error) {
      try { rename(backup, directory); }
      catch (rollbackError) {
        throw new AggregateError([error, rollbackError], `원고 복원이 중단됐습니다. 원본은 ${backup}에 보존됩니다.`);
      }
      throw error;
    }
  } finally {
    if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
    if (committed) rmSync(backup, { recursive: true, force: true });
  }
}

export function publishWorkTables(
  directory: string,
  tables: TableRows,
  manifest: { path: string; expected: string; updated: string },
  rename = renameSync,
): void {
  if (existsSync(directory)) throw new Error('그 작업 버전의 폴더가 이미 있습니다.');
  const staging = mkdtempSync(join(dirname(directory), '.story-post-clone-'));
  const temporary = `${manifest.path}.${randomUUID()}.tmp`;
  let published = false;
  let committed = false;
  try {
    writeTables(staging, tables);
    writeFileSync(temporary, manifest.updated);
    const checkManifest = () => {
      if (readFileSync(manifest.path, 'utf8') !== manifest.expected) {
        throw new Error('작품 목록이 변경되었습니다. 최신 목록을 확인한 뒤 다시 복제하세요.');
      }
    };
    checkManifest();
    if (existsSync(directory)) throw new Error('그 작업 버전의 폴더가 이미 있습니다.');
    rename(staging, directory);
    published = true;
    checkManifest();
    rename(temporary, manifest.path);
    committed = true;
  } catch (error) {
    if (published && !committed) {
      try { rmSync(directory, { recursive: true, force: true }); }
      catch (rollbackError) {
        throw new AggregateError([error, rollbackError], `복제 목록 반영과 정리가 중단됐습니다. 미등록 작업본은 ${directory}에 남아 있습니다.`);
      }
    }
    throw error;
  } finally {
    if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
    if (existsSync(temporary)) rmSync(temporary, { force: true });
  }
}
