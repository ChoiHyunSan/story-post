import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { readTables, writeTables, type TableRows } from '../scripts/authoring-files';
import { importAuthoringCsv } from '../scripts/authoring-csv';
import { createAuthoringDatabase, exportRuntimeStory } from '../scripts/authoring-store';
import { advance, initialFlags } from '../src/engine/story';
import { createSceneBranch, type SceneBranchRequest } from '../tools/authoring-studio/scene.mjs';

const tables = () => readTables('content/authoring/works/little-post-office-v4');
const request = (patch: Partial<SceneBranchRequest> = {}): SceneBranchRequest => ({
  sourceSceneId: 'ten-year-mail', sceneId: 'porch-note', sceneType: 'letter',
  sender: '대문 옆의 쪽지', body: '새 편지를 확인하고 우체부를 부른다.', entryText: '대문 옆에 남은 쪽지를 먼저 읽는다',
  nextSceneId: 'first-letter', continueText: '쪽지를 접고 편지를 연다', endingId: '', ...patch,
});
function runtime(source: TableRows) {
  const temporary = mkdtempSync(join(tmpdir(), 'story-post-scene-'));
  const database = createAuthoringDatabase();
  try {
    writeTables(temporary, source);
    importAuthoringCsv(database, temporary);
    return exportRuntimeStory(database, { storyId:'little-post-office', workingVersion:4, locale:'ko' });
  } finally { database.close(); rmSync(temporary, { recursive:true, force:true }); }
}

test('new letters form a playable branch while preserving existing choices, conditions and media', () => {
  const before = tables();
  const snapshot = structuredClone(before);
  const created = createSceneBranch(before, request());
  assert.deepEqual(before, snapshot);
  for (const name of ['choice_condition','choice_effect','asset','cue'] as const) assert.deepEqual(created[name], before[name]);
  assert.deepEqual(created.choice.slice(0,before.choice.length), before.choice);
  assert.equal(created.scene.at(-1)!.ordinal, '18');
  const story = runtime(created);
  const next = advance(story, story.startNodeId, initialFlags(story), 'porch-note-entry');
  assert.equal(next.node.id, 'porch-note');
  assert.equal(advance(story, next.node.id, next.flags, 'porch-note-continue').node.id, 'first-letter');
});

test('new endings remain reachable and cannot carry outgoing choices', () => {
  const created = createSceneBranch(tables(), request({ sceneType:'ending', endingId:'porch-reply' }));
  const scene = created.scene.find(row => row.scene_id === 'porch-note')!;
  assert.equal(scene.sender, '');
  assert.equal(scene.ending_id, 'porch-reply');
  assert.equal(created.choice.filter(row => row.scene_id === scene.scene_id).length, 0);
  const story = runtime(created);
  const node = advance(story, story.startNodeId, initialFlags(story), 'porch-note-entry').node;
  assert.equal(node.type, 'ending');
});

test('invalid creation fails without mutating the source manuscript', () => {
  for (const patch of [
    { sceneId:'first-letter' }, { sceneId:'UPPERCASE' }, { sceneId:'a'.repeat(51) }, { body:'\u200b' },
    { entryText:'우선 내 이름이 적힌 편지를 받는다' }, { nextSceneId:'missing' },
    { sourceSceneId:'returned-ending' }, { sceneType:'ending' as const, endingId:'letters-returned' },
  ]) {
    const source = tables();
    const before = structuredClone(source);
    assert.throws(() => createSceneBranch(source, request(patch)));
    assert.deepEqual(source, before);
  }
});

test('existing generated IDs, read-only works and authoring size limits are rejected', () => {
  const collision = tables();
  collision.content_block[0].block_id = 'porch-note-body';
  assert.throws(() => createSceneBranch(collision, request()), /겹칩니다/);
  const released = tables();
  released.story_work[0].status = 'released';
  assert.throws(() => createSceneBranch(released, request()), /배포본/);
  const full = tables();
  full.scene = Array.from({ length:200 }, (_, i) => ({ ...full.scene[0], scene_id:i ? `existing-${i}` : 'ten-year-mail' }));
  assert.throws(() => createSceneBranch(full, request()), /200개/);
  const crowded = tables();
  crowded.choice.push(...Array.from({ length:6 }, () => ({ ...crowded.choice[0] })));
  assert.throws(() => createSceneBranch(crowded, request()), /8개/);
});

test('full runtime validation rejects a new branch that loops back to its source', () => {
  const source = tables();
  const before = structuredClone(source);
  const created = createSceneBranch(source, request({ nextSceneId:'ten-year-mail' }));
  assert.throws(() => runtime(created), /Cycle/);
  assert.deepEqual(source, before);
});
