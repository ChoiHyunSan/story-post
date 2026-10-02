import type { AiTableRows } from '../../scripts/ai-content';

export interface WorkingDocument {
  entry: { directory: string };
  tables: AiTableRows;
  revision: string;
  preview: unknown;
}
export interface EditingSession {
  current: WorkingDocument | null;
  revision: number;
  loadSequence: number;
  dirty: boolean;
  isSaving: boolean;
  isLoading: boolean;
  isRestoring: boolean;
  loadFailure: { directory: string; message: string } | null;
  undo: (Pick<WorkingDocument, 'tables' | 'preview'> & { directory: string; revision: number }) | null;
}
export function createSession(): EditingSession;
export function markEdited(session: EditingSession): void;
export function loadDocument(session: EditingSession, directory: string,
  fetchWork: (directory: string) => Promise<WorkingDocument>): Promise<'loaded' | 'edited' | 'stale'>;
export function saveDocument(session: EditingSession,
  persist: (directory: string, payload: { tables: AiTableRows; expectedRevision: string }) => Promise<{ revision: string; preview: unknown }>
): Promise<'saved' | 'edited' | 'stale' | 'skipped'>;

export function restoreDocument(session: EditingSession, tables: AiTableRows,
  validate: (directory: string, tables: AiTableRows) => Promise<unknown>,
  confirm: () => Promise<boolean>
): Promise<'restored' | 'cancelled' | 'stale' | 'skipped'>;

export function rememberUndo(session: EditingSession, previous: Pick<WorkingDocument, 'tables' | 'preview'>): void;
export function canUndoDocument(session: EditingSession): boolean;
export function undoDocument(session: EditingSession): boolean;
