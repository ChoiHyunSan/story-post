import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { readTables, replaceWorkTables, tablesRevision } from '../scripts/authoring-files';
import { canUndoDocument, createSession, loadDocument, markEdited, rememberUndo, restoreDocument, saveDocument, undoDocument, type WorkingDocument } from '../tools/authoring-studio/session.mjs';

const directory = 'content/authoring/works/little-post-office-v4';
function work(name = 'v4'): WorkingDocument {
  const tables = readTables(directory);
  return { entry: { directory: name }, tables, revision: tablesRevision(tables), preview: { label: name } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test('a delayed save preserves later edits and rejects a duplicate submission', async () => {
  const session = createSession();
  await loadDocument(session, 'v4', async () => work());
  markEdited(session);
  const savedText = session.current!.tables.content_block[0].text;
  const response = deferred<{ revision: string; preview: unknown }>();
  let submissions = 0;
  const saving = saveDocument(session, async (_directory, payload) => {
    submissions++;
    assert.equal(payload.tables.content_block[0].text, savedText);
    return response.promise;
  });
  assert.equal(session.isSaving, true);
  assert.equal(await saveDocument(session, async () => { throw new Error('duplicate'); }), 'skipped');
  session.current!.tables.content_block[0].text = '저장 요청 뒤 추가한 문장';
  markEdited(session);
  response.resolve({ revision: 'server-after-save', preview: { savedText } });
  assert.equal(await saving, 'edited');
  assert.equal(submissions, 1);
  assert.equal(session.dirty, true);
  assert.equal(session.isSaving, false);
  assert.equal(session.current!.tables.content_block[0].text, '저장 요청 뒤 추가한 문장');
  assert.equal(session.current!.revision, 'server-after-save');
  const result = await saveDocument(session, async (_directory, payload) => {
    assert.equal(payload.expectedRevision, 'server-after-save');
    assert.equal(payload.tables.content_block[0].text, '저장 요청 뒤 추가한 문장');
    return { revision: 'server-final', preview: {} };
  });
  assert.equal(result, 'saved');
  assert.equal(session.dirty, false);
});

test('late save responses cannot overwrite a newly loaded work', async () => {
  const session = createSession();
  await loadDocument(session, 'v4', async () => work());
  markEdited(session);
  const response = deferred<{ revision: string; preview: unknown }>();
  const saving = saveDocument(session, async () => response.promise);
  await loadDocument(session, 'other', async () => work('other'));
  const before = structuredClone(session.current);
  response.resolve({ revision: 'old-revision', preview: { label: 'old' } });
  assert.equal(await saving, 'stale');
  assert.deepEqual(session.current, before);
});

test('save failures preserve dirty tables and release the save lock', async () => {
  const session = createSession();
  await loadDocument(session, 'v4', async () => work());
  markEdited(session);
  const before = structuredClone(session.current);
  await assert.rejects(saveDocument(session, async () => { throw new Error('work conflict'); }), /work conflict/);
  assert.deepEqual(session.current, before);
  assert.equal(session.dirty, true);
  assert.equal(session.isSaving, false);
});

test('out-of-order loading keeps only the most recently requested work', async () => {
  const session = createSession();
  const first = deferred<WorkingDocument>();
  const second = deferred<WorkingDocument>();
  const oldLoad = loadDocument(session, 'old', async () => first.promise);
  const newLoad = loadDocument(session, 'new', async () => second.promise);
  second.resolve(work('new'));
  assert.equal(await newLoad, 'loaded');
  first.resolve(work('old'));
  assert.equal(await oldLoad, 'stale');
  assert.equal(session.current!.entry.directory, 'new');
  assert.equal(session.isLoading, false);
});

test('editing during loading keeps the current manuscript', async () => {
  const session = createSession();
  await loadDocument(session, 'v4', async () => work());
  const response = deferred<WorkingDocument>();
  const loading = loadDocument(session, 'other', async () => response.promise);
  session.current!.tables.scene[0].notes = '불러오는 중 작성한 메모';
  markEdited(session);
  response.resolve(work('other'));
  assert.equal(await loading, 'edited');
  assert.equal(session.current!.entry.directory, 'v4');
  assert.equal(session.current!.tables.scene[0].notes, '불러오는 중 작성한 메모');
  assert.equal(session.dirty, true);
  assert.equal(session.isLoading, false);
});

test('obsolete load errors do not disturb a successfully loaded work', async () => {
  const session = createSession();
  const response = deferred<WorkingDocument>();
  const oldLoad = loadDocument(session, 'old', async () => response.promise);
  await loadDocument(session, 'new', async () => work('new'));
  response.reject(new Error('obsolete network failure'));
  assert.equal(await oldLoad, 'stale');
  assert.equal(session.current!.entry.directory, 'new');
});

test('released documents cannot become dirty or be persisted', async () => {
  const session = createSession();
  const document = work();
  document.tables.story_work[0].status = 'released';
  await loadDocument(session, 'v4', async () => document);
  markEdited(session);
  assert.equal(session.dirty, false);
  assert.equal(await saveDocument(session, async () => { throw new Error('readonly write'); }), 'skipped');
});

test('work replacement preserves all tables and extra authoring files', t => {
  const temporary = mkdtempSync(join(tmpdir(), 'story-post-file-save-'));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const target = join(temporary, 'work');
  cpSync(directory, target, { recursive: true });
  writeFileSync(join(target, 'author-notes.md'), 'keep me');
  const tables = readTables(target);
  tables.story_work[0].title = '검수 제목';
  tables.content_block[0].text = '검수 본문';
  replaceWorkTables(target, tables);
  assert.deepEqual(readTables(target), tables);
  assert.equal(existsSync(join(target, 'author-notes.md')), true);
  assert.deepEqual(readdirSync(temporary), ['work']);
});

test('a failed directory replacement restores the complete original manuscript', t => {
  const temporary = mkdtempSync(join(tmpdir(), 'story-post-file-rollback-'));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const target = join(temporary, 'work');
  cpSync(directory, target, { recursive: true });
  const before = readTables(target);
  const edited = structuredClone(before);
  edited.story_work[0].title = '저장되지 않아야 하는 제목';
  let moves = 0;
  assert.throws(() => replaceWorkTables(target, edited, (from, to) => {
    if (++moves === 2) throw new Error('disk replacement failed');
    renameSync(from, to);
  }), /disk replacement failed/);
  assert.deepEqual(readTables(target), before);
  assert.deepEqual(readdirSync(temporary), ['work']);
});

test('a failed rollback preserves a recoverable copy of the original', t => {
  const temporary = mkdtempSync(join(tmpdir(), 'story-post-file-backup-'));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const target = join(temporary, 'work');
  cpSync(directory, target, { recursive: true });
  const before = readTables(target);
  let moves = 0;
  assert.throws(() => replaceWorkTables(target, before, (from, to) => {
    if (++moves > 1) throw new Error('disk unavailable');
    renameSync(from, to);
  }), /원본은 .*backup에 보존/);
  const backup = readdirSync(temporary).find(name => name.endsWith('.backup'));
  assert.ok(backup);
  assert.deepEqual(readTables(join(temporary, backup)), before);
});

test('work revisions are independent of object key order and detect changed content', () => {
  const tables = readTables(directory);
  const reordered = structuredClone(tables);
  reordered.story_work[0] = Object.fromEntries(Object.entries(reordered.story_work[0]).reverse());
  assert.equal(tablesRevision(reordered), tablesRevision(tables));
  reordered.scene[0].notes = '외부 편집';
  assert.notEqual(tablesRevision(reordered), tablesRevision(tables));
});

test('restoring a validated backup changes only the editor and keeps its server revision', async () => {
  const session = createSession();
  await loadDocument(session, 'v4', async () => work());
  const tables = structuredClone(session.current!.tables);
  tables.scene[0].notes = '백업 메모';
  const revision = session.current!.revision;
  assert.equal(await restoreDocument(session, tables, async () => ({ report: 'valid' }), async () => true), 'restored');
  assert.equal(session.current!.tables.scene[0].notes, '백업 메모');
  assert.equal(session.current!.revision, revision);
  assert.equal(session.dirty, true);
  tables.scene[0].notes = '외부 변경';
  assert.equal(session.current!.tables.scene[0].notes, '백업 메모');
});

test('cancelled or invalid backups leave all current edits intact', async () => {
  const session = createSession();
  await loadDocument(session, 'v4', async () => work());
  markEdited(session);
  const before = structuredClone(session);
  const tables = structuredClone(session.current!.tables);
  tables.scene[0].notes = '다른 내용';
  assert.equal(await restoreDocument(session, tables, async () => ({}), async () => false), 'cancelled');
  assert.deepEqual(session, before);
  await assert.rejects(restoreDocument(session, tables, async () => { throw new Error('invalid branch'); }, async () => true), /invalid branch/);
  assert.deepEqual(session, before);
});

test('edits made during backup validation prevent late replacement', async () => {
  const session = createSession();
  await loadDocument(session, 'v4', async () => work());
  const response = deferred<unknown>();
  const restoring = restoreDocument(session, session.current!.tables, async () => response.promise, async () => true);
  assert.equal(await saveDocument(session, async () => { throw new Error('concurrent save'); }), 'skipped');
  session.current!.tables.scene[0].notes = '검사 중 새 메모';
  markEdited(session);
  response.resolve({});
  assert.equal(await restoring, 'stale');
  assert.equal(session.current!.tables.scene[0].notes, '검사 중 새 메모');
  assert.equal(session.isRestoring, false);
});

test('a loaded work or new edit during confirmation prevents backup replacement', async () => {
  for (const switchWork of [false, true]) {
    const session = createSession();
    await loadDocument(session, 'v4', async () => work());
    const confirmation = deferred<boolean>();
    const restoring = restoreDocument(session, session.current!.tables, async () => ({}), async () => confirmation.promise);
    await Promise.resolve();
    if (switchWork) await loadDocument(session, 'other', async () => work('other'));
    else { session.current!.tables.scene[0].notes = '확인 중 새 메모'; markEdited(session); }
    const before = structuredClone(session.current);
    confirmation.resolve(true);
    assert.equal(await restoring, 'stale');
    assert.deepEqual(session.current, before);
  }
});

test('read-only documents reject restoration before validation', async () => {
  const session = createSession();
  const document = work();
  document.tables.story_work[0].status = 'released';
  await loadDocument(session, 'v4', async () => document);
  assert.equal(await restoreDocument(session, document.tables, async () => { throw new Error('readonly validation'); }, async () => true), 'skipped');
});

test('structural undo restores the editor while retaining the latest server revision', async () => {
  const session = createSession();
  await loadDocument(session,'v4',async () => work());
  const before = { tables:structuredClone(session.current!.tables), preview:structuredClone(session.current!.preview) };
  session.current!.tables.scene[0].notes = '구조 변경';
  markEdited(session);
  rememberUndo(session,before);
  assert.equal(canUndoDocument(session),true);
  await saveDocument(session,async () => ({ revision:'saved-after-structure',preview:{report:'saved'} }));
  assert.equal(undoDocument(session),true);
  assert.deepEqual(session.current!.tables,before.tables);
  assert.equal(session.current!.revision,'saved-after-structure');
  assert.equal(session.dirty,true);
  assert.equal(canUndoDocument(session),false);
});

test('subsequent edits and loading another work invalidate structural undo', async () => {
  for (const switchWork of [false,true]) {
    const session = createSession();
    await loadDocument(session,'v4',async () => work());
    rememberUndo(session,{ tables:session.current!.tables,preview:session.current!.preview });
    if (switchWork) await loadDocument(session,'other',async () => work('other'));
    else { session.current!.tables.scene[0].notes='이후 새 메모'; markEdited(session); }
    const before=structuredClone(session.current);
    assert.equal(undoDocument(session),false);
    assert.deepEqual(session.current,before);
  }
});

test('undo is blocked during pending operations and on released documents', async () => {
  const session = createSession();
  await loadDocument(session,'v4',async () => work());
  rememberUndo(session,{ tables:session.current!.tables,preview:session.current!.preview });
  for (const flag of ['isSaving','isLoading','isRestoring'] as const) {
    session[flag]=true;
    assert.equal(undoDocument(session),false);
    session[flag]=false;
  }
  session.current!.tables.story_work[0].status='released';
  assert.equal(undoDocument(session),false);
});

test('undo snapshots cannot be changed by later aliases of the previous tables', async () => {
  const session=createSession();
  await loadDocument(session,'v4',async () => work());
  const previous={ tables:structuredClone(session.current!.tables),preview:{ report:'original' } };
  const notes=previous.tables.scene[0].notes;
  rememberUndo(session,previous);
  previous.tables.scene[0].notes='outside mutation';
  previous.preview.report='outside mutation';
  assert.equal(undoDocument(session),true);
  assert.equal(session.current!.tables.scene[0].notes,notes);
  assert.deepEqual(session.current!.preview,{ report:'original' });
});


test('load failures retain the editable work and identify the exact retry target', async () => {
  const session = createSession();
  await loadDocument(session, 'v4', async () => work());
  session.current!.tables.scene[0].notes = '보존할 메모';
  markEdited(session);
  const before = structuredClone(session.current);
  const revision = session.revision;
  await assert.rejects(loadDocument(session, 'v5', async () => { throw new Error('temporary work failure'); }), /temporary work failure/);
  assert.deepEqual(session.current, before);
  assert.equal(session.revision, revision);
  assert.equal(session.dirty, true);
  assert.equal(session.isLoading, false);
  assert.deepEqual(session.loadFailure, {directory:'v5',message:'temporary work failure'});
  assert.equal(await loadDocument(session, session.loadFailure!.directory, async target => work(target)), 'loaded');
  assert.equal(session.current!.entry.directory, 'v5');
  assert.equal(session.loadFailure, null);
});

test('failed initial loads and obsolete errors cannot replace a newer recovery target', async () => {
  const session = createSession();
  await assert.rejects(loadDocument(session, 'first', async () => { throw new Error('initial failure'); }), /initial failure/);
  assert.equal(session.current, null);
  assert.equal(session.loadFailure!.directory, 'first');
  const old = deferred<WorkingDocument>();
  const loading = loadDocument(session, 'old', async () => old.promise);
  assert.equal(session.loadFailure, null);
  await assert.rejects(loadDocument(session, 'latest', async () => { throw new Error('latest failure'); }), /latest failure/);
  old.reject(new Error('obsolete failure'));
  assert.equal(await loading, 'stale');
  assert.deepEqual(session.loadFailure, {directory:'latest',message:'latest failure'});
  assert.equal(session.isLoading, false);
});
