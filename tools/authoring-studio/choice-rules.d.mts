import type { TableRows } from '../../scripts/authoring-files';
export interface ChoiceRules { conditions: { flagId: string; value: boolean }[]; effects: { flagId: string; value: boolean }[] }
export function choiceRules(tables: TableRows, choiceId: string): ChoiceRules;
export function replaceChoiceRules(tables: TableRows, choiceId: string, rules: ChoiceRules): TableRows;
