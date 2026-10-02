import type { AiTableRows } from '../../scripts/ai-content';
import type { previewStory } from '../../scripts/authoring-preview';
import type { EditingSession } from './session.mjs';

export type PlaytestRun = ReturnType<typeof previewStory> & {revision:string;previewedAt:string;pendingAssetCount:number};
export interface PlaytestSession {
  run:PlaytestRun | null;
  snapshot:AiTableRows | null;
  context:{directory:string;revision:number;loadSequence:number} | null;
  choiceIds:string[];
  wasUnsaved:boolean;
  busy:boolean;
  sequence:number;
  error:string;
}
export function createPlaytestSession():PlaytestSession;
export function isPlaytestCurrent(session:EditingSession,playtest:PlaytestSession):boolean;
export function previewDocument(session:EditingSession,playtest:PlaytestSession,choiceIds:readonly string[],restart:boolean,
  preview:(directory:string,tables:AiTableRows,choiceIds:string[])=>Promise<PlaytestRun>):Promise<'previewed'|'stale'|'skipped'>;
export function exportPlaytest(session:EditingSession,playtest:PlaytestSession):string;
