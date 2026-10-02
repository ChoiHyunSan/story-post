import type { TableRows } from '../../scripts/authoring-files';
export const maximumBackupBytes: number;
export function createBackup(tables: TableRows, headers: Record<string, readonly string[]>, now?: Date): string;
export function readBackup(text: string, target: TableRows, headers: Record<string, readonly string[]>): TableRows;
