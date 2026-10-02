import type { TableRows } from '../../scripts/authoring-files';
export function removeAuthoringRow(source: TableRows, table: 'content_block' | 'choice' | 'asset' | 'cue', id: string): { tables: TableRows; removedCount: number };
