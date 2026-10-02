import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { authoringHeaders, nullableColumns, type AuthoringTable } from './authoring-contract';

function encodeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function encodeCsv(rows: readonly (readonly unknown[])[]): string {
  return `${rows.map(row => row.map(encodeCell).join(',')).join('\r\n')}\r\n`;
}

export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let isQuoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (isQuoted) {
      if (character === '"' && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        isQuoted = false;
      } else {
        cell += character;
      }
      continue;
    }
    if (character === '"' && cell.length === 0) {
      isQuoted = true;
    } else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n') {
      row.push(cell.endsWith('\r') ? cell.slice(0, -1) : cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }
  if (isQuoted) throw new Error('CSV ends inside a quoted field');
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.endsWith('\r') ? cell.slice(0, -1) : cell);
    rows.push(row);
  }
  return rows;
}

function quotedIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export function exportAuthoringCsv(database: DatabaseSync, directory: string): void {
  mkdirSync(directory, { recursive: true });
  for (const [table, headers] of Object.entries(authoringHeaders) as [AuthoringTable, readonly string[]][]) {
    const selection = headers.map(quotedIdentifier).join(', ');
    const rows = database.prepare(`SELECT ${selection} FROM ${quotedIdentifier(table)} ORDER BY rowid`).all();
    const values = rows.map(row => headers.map(header => (row as Record<string, unknown>)[header]));
    writeFileSync(`${directory}/${table}.csv`, encodeCsv([headers, ...values]));
  }
}

export function importAuthoringCsv(database: DatabaseSync, directory: string): void {
  database.exec('BEGIN IMMEDIATE');
  try {
    for (const [table, headers] of Object.entries(authoringHeaders) as [AuthoringTable, readonly string[]][]) {
      const rows = parseCsv(readFileSync(`${directory}/${table}.csv`, 'utf8'));
      const header = rows.shift();
      if (!header || header.join(',') !== headers.join(',')) {
        throw new Error(`CSV header differs for ${table}`);
      }
      const columns = headers.map(quotedIdentifier).join(', ');
      const placeholders = headers.map(() => '?').join(', ');
      const insert = database.prepare(
        `INSERT INTO ${quotedIdentifier(table)} (${columns}) VALUES (${placeholders})`,
      );
      rows.forEach((values, rowIndex) => {
        if (values.length !== headers.length) {
          throw new Error(`${table}.csv row ${rowIndex + 2} has ${values.length} cells; expected ${headers.length}`);
        }
        const normalized = values.map((value, columnIndex) =>
          value === '' && nullableColumns.has(`${table}.${headers[columnIndex]}`) ? null : value);
        insert.run(...normalized);
      });
    }
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}
