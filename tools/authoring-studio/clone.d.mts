import type { EditingSession } from './session.mjs';
export interface ClonePayload {sourceDirectory:string;expectedRevision:string;newVersion:number}
export interface ClonedEntry {directory:string;workingVersion:number}
export function cloneAndRefresh(payload:ClonePayload,
  publish:(payload:ClonePayload)=>Promise<ClonedEntry>,refresh:(entry:ClonedEntry)=>Promise<void>
):Promise<{entry:ClonedEntry;refreshError:string | null}>;

export function canOpenClone(session:EditingSession,
  context:Pick<EditingSession,'current'|'revision'|'loadSequence'>):boolean;
