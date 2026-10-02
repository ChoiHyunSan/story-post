import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AiTableRows } from '../scripts/ai-content';
import { readTables, tablesRevision } from '../scripts/authoring-files';
import { createSession, loadDocument, markEdited } from '../tools/authoring-studio/session.mjs';
import { createReviewSession, exportReview, isReviewCurrent, validateReview } from '../tools/authoring-studio/review.mjs';

async function fixture() {
  const session=createSession();
  const tables=readTables('content/authoring/works/little-post-office-v4');
  await loadDocument(session,'v4',async()=>({entry:{directory:'v4'},tables,revision:tablesRevision(tables),preview:{}}));
  return {session,review:createReviewSession()};
}
const validation={revision:'f'.repeat(64),validatedAt:'2026-10-02T00:00:00.000Z',report:'제작표',graph:'flowchart TD'};

test('review captures unsaved tables and metadata without saving or sharing later mutations',async()=>{
  const {session,review}=await fixture();
  session.current!.tables.scene[0].notes='아직 저장하지 않은 검수 메모';markEdited(session);
  const before=structuredClone(session);
  assert.equal(await validateReview(session,review,async(_directory,tables)=>{
    assert.equal(tables.scene[0].notes,'아직 저장하지 않은 검수 메모');return validation;
  }),'validated');
  assert.deepEqual(session,before);
  const packet=JSON.parse(exportReview(session,review)) as {format:string;revision:string;wasUnsaved:boolean;tables:AiTableRows};
  assert.equal(packet.format,'story-post-review');assert.equal(packet.revision,validation.revision);assert.equal(packet.wasUnsaved,true);
  assert.equal(packet.tables.scene[0].notes,'아직 저장하지 않은 검수 메모');
  session.current!.tables.scene[0].notes='검수 뒤 수정';markEdited(session);
  assert.equal(isReviewCurrent(session,review),false);
  assert.equal(review.result!.tables.scene[0].notes,'아직 저장하지 않은 검수 메모');
  assert.throws(()=>exportReview(session,review),/현재 원고/);
});

test('an edit or new loading request discards delayed review results and errors',async()=>{
  for(const action of ['edit','load'] as const){
    const {session,review}=await fixture();
    let resolve!:(value:typeof validation)=>void;
    const pending=validateReview(session,review,()=>new Promise(done=>{resolve=done;}));
    if(action==='edit')markEdited(session);else session.loadSequence++;
    resolve(validation);assert.equal(await pending,'stale');assert.equal(review.result,null);assert.equal(review.busy,false);
  }
  const {session,review}=await fixture();
  let reject!:(error:Error)=>void;
  const pending=validateReview(session,review,()=>new Promise((_done,fail)=>{reject=fail;}));
  markEdited(session);reject(new Error('오래된 실패'));
  assert.equal(await pending,'stale');assert.equal(review.error,'');
});

test('review failures preserve the manuscript and cannot authorize an export',async()=>{
  const {session,review}=await fixture();const before=structuredClone(session);
  await assert.rejects(validateReview(session,review,async()=>{throw new Error('연결 오류');}),/연결 오류/);
  assert.deepEqual(session,before);assert.equal(review.busy,false);assert.equal(review.error,'연결 오류');
  assert.throws(()=>exportReview(session,review),/현재 원고/);
});

test('review ignores duplicate requests and obsolete completion cannot unlock a new work review',async()=>{
  const {session,review}=await fixture();let resolve!:(value:typeof validation)=>void;
  const pending=validateReview(session,review,()=>new Promise(done=>{resolve=done;}));
  assert.equal(await validateReview(session,review,async()=>{throw new Error('duplicate');}),'skipped');
  review.sequence++;review.busy=true;resolve(validation);
  assert.equal(await pending,'stale');assert.equal(review.busy,true);assert.equal(review.result,null);
});
