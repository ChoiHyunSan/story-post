import type { TableRows } from '../../scripts/authoring-files';
export interface SceneBranchRequest {
  sourceSceneId: string;
  sceneId: string;
  sceneType: 'letter' | 'ending';
  body: string;
  entryText: string;
  sender: string;
  nextSceneId: string;
  continueText: string;
  endingId: string;
}
export function createSceneBranch(source: TableRows, request: SceneBranchRequest): TableRows;

export function searchScenes(tables: TableRows, query: string): Record<string, string>[];
