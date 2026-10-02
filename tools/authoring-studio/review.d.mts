import type { AiTableRows } from '../../scripts/ai-content';
import type { EditingSession } from './session.mjs';

export interface ReviewValidation { revision:string; validatedAt:string; report:string; graph:string }
export interface ReviewSession {
  busy:boolean;
  sequence:number;
  error:string;
  result:{ context:{directory:string;revision:number;loadSequence:number};tables:AiTableRows;wasUnsaved:boolean;validation:ReviewValidation } | null;
}
export function createReviewSession():ReviewSession;
export function isReviewCurrent(session:EditingSession,review:ReviewSession):boolean;
export function validateReview(session:EditingSession,review:ReviewSession,
  validate:(directory:string,tables:AiTableRows)=>Promise<ReviewValidation>):Promise<'validated'|'stale'|'skipped'>;
export function exportReview(session:EditingSession,review:ReviewSession):string;
