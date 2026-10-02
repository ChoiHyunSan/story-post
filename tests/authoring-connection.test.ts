import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createConnectionSession, requestConnection } from '../tools/authoring-studio/connection.mjs';

type Settings = {credential:{configured:boolean;maskedKey:string | null}};
const missing:Settings = {credential:{configured:false,maskedKey:null}};
const connected:Settings = {credential:{configured:true,maskedKey:'••••1234'}};
function deferred<T>() {
  let resolve!:(value:T)=>void;
  let reject!:(error:Error)=>void;
  const promise = new Promise<T>((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}

test('an older connection read cannot undo a completed settings update', async () => {
  const session = createConnectionSession<Settings>();
  const old = deferred<Settings>();
  const reading = requestConnection(session,()=>old.promise);
  assert.equal(await requestConnection(session,async()=>connected,true),'applied');
  old.resolve(missing);
  assert.equal(await reading,'stale');
  assert.deepEqual(session.settings,connected);
  assert.equal(session.error,'');
  assert.equal(session.isLoading,false);
  assert.equal(session.isWriting,false);
});

test('settings writes block duplicate writes and reads until the current operation finishes', async () => {
  const session = createConnectionSession<Settings>();
  const response = deferred<Settings>();
  const writing = requestConnection(session,()=>response.promise,true);
  let duplicates = 0;
  for (const isWriting of [false,true]) {
    assert.equal(await requestConnection(session,async()=>{duplicates++;return missing;},isWriting),'skipped');
  }
  assert.equal(duplicates,0);
  assert.equal(session.isWriting,true);
  response.resolve(connected);
  assert.equal(await writing,'applied');
  assert.equal(session.isWriting,false);
});

test('obsolete read errors cannot clear a newer pending operation or its successful value', async () => {
  const session = createConnectionSession<Settings>();
  const old = deferred<Settings>();
  const recent = deferred<Settings>();
  const first = requestConnection(session,()=>old.promise);
  const latest = requestConnection(session,()=>recent.promise);
  old.reject(new Error('outdated failure'));
  assert.equal(await first,'stale');
  assert.equal(session.isLoading,true);
  assert.equal(session.error,'');
  recent.resolve(connected);
  assert.equal(await latest,'applied');
  assert.deepEqual(session.settings,connected);
});

test('a current settings failure keeps previous metadata and permits explicit retry', async () => {
  const session = createConnectionSession<Settings>();
  await requestConnection(session,async()=>connected);
  assert.equal(await requestConnection(session,async()=>{throw new Error('temporary settings failure');},true),'failed');
  assert.deepEqual(session.settings,connected);
  assert.equal(session.error,'temporary settings failure');
  assert.equal(session.isWriting,false);
  assert.equal(await requestConnection(session,async()=>missing),'applied');
  assert.deepEqual(session.settings,missing);
  assert.equal(session.error,'');
});
