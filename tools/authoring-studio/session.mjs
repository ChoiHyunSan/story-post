export function createSession() {
  return { current: null, revision: 0, loadSequence: 0, dirty: false, isSaving: false, isLoading: false, isRestoring: false, loadFailure: null, undo: null };
}

export function markEdited(session) {
  if (session.current?.tables.story_work[0]?.status === 'released') return;
  session.undo = null;
  session.revision++;
  session.dirty = true;
}

export async function loadDocument(session, directory, fetchWork) {
  const sequence = ++session.loadSequence;
  const revision = session.revision;
  session.isLoading = true;
  session.loadFailure = null;
  try {
    const current = await fetchWork(directory);
    if (sequence !== session.loadSequence) return 'stale';
    if (revision !== session.revision) return 'edited';
    session.current = current;
    session.undo = null;
    session.revision++;
    session.dirty = false;
    return 'loaded';
  } catch (error) {
    if (sequence !== session.loadSequence) return 'stale';
    session.loadFailure = { directory, message:error instanceof Error ? error.message : '원고를 불러오지 못했습니다.' };
    throw error;
  } finally {
    if (sequence === session.loadSequence) session.isLoading = false;
  }
}

export async function saveDocument(session, persist) {
  if (!session.current || !session.dirty || session.isSaving || session.isLoading || session.isRestoring ||
      session.current.tables.story_work[0]?.status === 'released') return 'skipped';
  const directory = session.current.entry.directory;
  const revision = session.revision;
  const sequence = session.loadSequence;
  const payload = { tables: structuredClone(session.current.tables), expectedRevision: session.current.revision };
  session.isSaving = true;
  try {
    const result = await persist(directory, payload);
    if (session.current.entry.directory !== directory || session.loadSequence !== sequence) return 'stale';
    session.current.preview = result.preview;
    session.current.revision = result.revision;
    session.dirty = revision !== session.revision;
    return session.dirty ? 'edited' : 'saved';
  } finally {
    session.isSaving = false;
  }
}

export async function restoreDocument(session, tables, validate, confirm) {
  if (!session.current || session.isSaving || session.isLoading || session.isRestoring ||
      session.current.tables.story_work[0]?.status === 'released') return 'skipped';
  const current = session.current;
  const revision = session.revision;
  const sequence = session.loadSequence;
  const isCurrent = () => session.current === current && session.revision === revision && session.loadSequence === sequence;
  session.isRestoring = true;
  try {
    const preview = await validate(current.entry.directory, tables);
    if (!isCurrent()) return 'stale';
    if (!await confirm()) return 'cancelled';
    if (!isCurrent()) return 'stale';
    current.tables = structuredClone(tables);
    current.preview = preview;
    markEdited(session);
    return 'restored';
  } catch (error) {
    if (!isCurrent()) return 'stale';
    throw error;
  } finally {
    session.isRestoring = false;
  }
}

export function rememberUndo(session, previous) {
  session.undo = { ...structuredClone(previous), directory:session.current.entry.directory, revision:session.revision };
}

export function canUndoDocument(session) {
  return !!session.current && !!session.undo && !session.isLoading && !session.isSaving && !session.isRestoring &&
    session.current.tables.story_work[0]?.status !== 'released' && session.current.entry.directory === session.undo.directory && session.revision === session.undo.revision;
}

export function undoDocument(session) {
  if (!canUndoDocument(session)) return false;
  session.current.tables = structuredClone(session.undo.tables);
  session.current.preview = structuredClone(session.undo.preview);
  markEdited(session);
  return true;
}
