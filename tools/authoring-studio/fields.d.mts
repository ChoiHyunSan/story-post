import type { TableRows } from '../../scripts/authoring-files';
export const fieldLabels: Record<string, string>;
export const channelActions: Record<string, string[]>;
export function sceneLabel(scene: Record<string, string>): string;
export function fieldOptions(name: string, tables: TableRows, row?: Record<string, string>): [string, string][] | null;
export function preserveCurrentOption(options: [string, string][] | null, value: string): [string, string][] | null;

export function assetImagePreview(row: Record<string,string>): {url:string;altText:string} | null;
