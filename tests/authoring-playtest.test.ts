import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AiTableRows } from '../scripts/ai-content';
import { readTables, tablesRevision } from '../scripts/authoring-files';
import { importAuthoringCsv } from '../scripts/authoring-csv';
import { previewStory } from '../scripts/authoring-preview';
import { createAuthoringDatabase, exportPresentationPackage, exportRuntimeStory } from '../scripts/authoring-store';
import { createPlaytestSession, exportPlaytest, isPlaytestCurrent, previewDocument, type PlaytestRun } from '../tools/authoring-studio/playtest.mjs';
import { createSession, markEdited } from '../tools/authoring-studio/session.mjs';

const directory = 'content/authoring/works/little-post-office-v4';
function fixture() {
  const session = createSession();
  const tables = readTables(directory);
  session.current = {entry:{directory},tables,revision:tablesRevision(tables),preview:null};
  const database = createAuthoringDatabase();
  try {
    importAuthoringCsv(database,directory);
    const key = {storyId:'little-post-office',workingVersion:4,locale:'ko'};
    const story = exportRuntimeStory(database,key);
    const presentation = exportPresentationPackage(database,key,{allowPlanned:true});
    const preview = async (_directory:string,_tables:AiTableRows,path:string[]):Promise<PlaytestRun> => ({
      ...previewStory(story,presentation,path),revision:tablesRevision(tables),previewedAt:'2026-10-02T01:00:00.000Z',pendingAssetCount:0,
    });
    return {session,playtest:createPlaytestSession(),preview};
  } finally { database.close(); }
}
function deferred() {
  let resolve!:(value:PlaytestRun)=>void;
  let reject!:(reason:Error)=>void;
  const promise = new Promise<PlaytestRun>((res,rej)=>{resolve=res;reject=rej;});
  return {promise,resolve,reject};
}

test('playtest export captures unsaved manuscript and a reproducible route without touching the ledger', async () => {
  const {session,playtest,preview} = fixture();
  session.current!.tables.scene[0].notes = '미저장 검수 메모';
  markEdited(session);
  const before = structuredClone(session.current);
  assert.equal(await previewDocument(session,playtest,[],true,preview),'previewed');
  const path = ['accept-first-letter','show-warning'];
  assert.equal(await previewDocument(session,playtest,path,false,preview),'previewed');
  path.push('not-in-export');
  const packet = JSON.parse(exportPlaytest(session,playtest));
  assert.equal(packet.format,'story-post-playtest');
  assert.equal(packet.wasUnsaved,true);
  assert.deepEqual(packet.choiceIds,['accept-first-letter','show-warning']);
  assert.equal(packet.node.id,'shared-route');
  assert.equal(packet.flags['with-sora'],true);
  assert.equal(packet.history.length,2);
  assert.equal(packet.tables.scene[0].notes,'미저장 검수 메모');
  assert.match(packet.revision,/^[a-f0-9]{64}$/);
  assert.deepEqual(session.current,before);
  assert.equal(session.dirty,true);
  assert.equal('settings' in packet,false);
  assert.equal('apiKey' in packet,false);
});

test('an edit after preview locks route export and requires a fresh snapshot', async () => {
  const {session,playtest,preview} = fixture();
  await previewDocument(session,playtest,[],true,preview);
  session.current!.tables.scene[0].notes = '수정 뒤의 메모';
  markEdited(session);
  assert.equal(isPlaytestCurrent(session,playtest),false);
  assert.throws(()=>exportPlaytest(session,playtest),/현재 원고/);
  assert.equal(await previewDocument(session,playtest,['accept-first-letter'],false,preview),'skipped');
  await previewDocument(session,playtest,[],true,preview);
  assert.equal(isPlaytestCurrent(session,playtest),true);
  assert.equal(playtest.snapshot!.scene[0].notes,'수정 뒤의 메모');
});

test('late preview responses and errors cannot replace an edited or newly loading manuscript', async () => {
  for (const mutation of ['edit','load'] as const) for (const fails of [false,true]) {
    const {session,playtest,preview} = fixture();
    const response = deferred();
    const request = previewDocument(session,playtest,[],true,()=>response.promise);
    if (mutation === 'edit') markEdited(session);
    else {session.loadSequence++;session.isLoading=true;}
    if (fails) response.reject(new Error('old failure'));
    else response.resolve(await preview(directory,session.current!.tables,[]));
    assert.equal(await request,'stale');
    assert.equal(playtest.run,null);
    assert.equal(playtest.error,'');
    assert.equal(playtest.busy,false);
    assert.throws(()=>exportPlaytest(session,playtest),/현재 원고/);
  }
});

test('duplicate preview requests are blocked and a current failure keeps the last successful route', async () => {
  const {session,playtest,preview} = fixture();
  await previewDocument(session,playtest,[],true,preview);
  const before = structuredClone(playtest.run);
  const response = deferred();
  const request = previewDocument(session,playtest,['accept-first-letter'],false,()=>response.promise);
  assert.equal(await previewDocument(session,playtest,[],true,preview),'skipped');
  assert.throws(()=>exportPlaytest(session,playtest),/현재 원고/);
  response.reject(new Error('current failure'));
  await assert.rejects(request,/current failure/);
  assert.deepEqual(playtest.run,before);
  assert.deepEqual(playtest.choiceIds,[]);
  assert.equal(playtest.busy,false);
  assert.equal(playtest.error,'current failure');
  assert.equal(await previewDocument(session,playtest,['accept-first-letter'],false,preview),'previewed');
  assert.equal(playtest.run!.node.id,'first-letter');
  assert.equal(playtest.error,'');
});

test('completion of a reset preview cannot clear a newer request lock', async () => {
  const {session,playtest,preview} = fixture();
  const oldResponse = deferred();
  const newResponse = deferred();
  const oldRequest = previewDocument(session,playtest,[],true,()=>oldResponse.promise);
  Object.assign(playtest,{...createPlaytestSession(),sequence:playtest.sequence+1});
  session.loadSequence++;
  const newRequest = previewDocument(session,playtest,[],true,()=>newResponse.promise);
  oldResponse.resolve(await preview(directory,session.current!.tables,[]));
  assert.equal(await oldRequest,'stale');
  assert.equal(playtest.busy,true);
  newResponse.resolve(await preview(directory,session.current!.tables,[]));
  assert.equal(await newRequest,'previewed');
  assert.equal(playtest.busy,false);
});
