import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readTables } from '../scripts/authoring-files';
import { removeAuthoringRow } from '../tools/authoring-studio/editing.mjs';

const tables = () => readTables('content/authoring/works/little-post-office-v4');

test('choice removal cleans owned conditions, effects and cues while preserving shared flags', () => {
  const source = tables();
  source.flag_definition.push({ ...source.flag_definition[0], flag_id:'temporary-note', ordinal:'3' });
  source.choice_condition.push({ ...source.choice_condition[0], choice_id:'call-sora' });
  source.choice_effect.push({ ...source.choice_effect[0], choice_id:'call-sora', ordinal:'1', flag_id:'temporary-note' });
  source.cue.push({ ...source.cue[0], cue_id:'call-sora-cue', scene_id:'private-route', trigger:'choice_selected', choice_id:'call-sora' });
  const before = structuredClone(source);
  const result = removeAuthoringRow(source,'choice','call-sora');
  assert.equal(result.tables.choice.some(row => row.choice_id === 'call-sora'),false);
  assert.equal(result.tables.choice_condition.some(row => row.choice_id === 'call-sora'),false);
  assert.equal(result.tables.choice_effect.some(row => row.choice_id === 'call-sora'),false);
  assert.equal(result.tables.cue.some(row => row.choice_id === 'call-sora'),false);
  assert.equal(result.tables.flag_definition.some(row => row.flag_id === 'temporary-note'),false);
  assert.equal(result.tables.flag_definition.some(row => row.flag_id === 'with-sora'),true);
  assert.equal(result.removedCount,6);
  assert.deepEqual(source,before);
});

test('block removal cleans only linked cues and keeps unrelated presentation', () => {
  const source = tables();
  source.content_block.push({ ...source.content_block[0], block_id:'second-opening', ordinal:'1', text:'두 번째 문장' });
  source.cue.push({ ...source.cue[0], cue_id:'second-block-cue', block_id:'second-opening', trigger:'before_block' });
  const result = removeAuthoringRow(source,'content_block','second-opening');
  assert.equal(result.removedCount,2);
  assert.deepEqual(result.tables.cue, source.cue.filter(row => row.cue_id !== 'second-block-cue'));
  assert.equal(result.tables.cue[0].cue_id,'ten-year-mail-cover');
  assert.deepEqual(result.tables.asset,source.asset);
});

test('last text, last choice and used assets fail without editing their source', () => {
  for (const [table,id] of [['content_block','ten-year-mail-body'],['choice','open-after-answer'],['asset','little-post-office-cover']] as const) {
    const source = tables();
    const before = structuredClone(source);
    assert.throws(() => removeAuthoringRow(source,table,id));
    assert.deepEqual(source,before);
  }
});

test('removing a cue retains asset provenance and then allows removal of an unused asset row', () => {
  const source = tables();
  const withoutCue = removeAuthoringRow(source,'cue','ten-year-mail-cover').tables;
  assert.deepEqual(withoutCue.asset,source.asset);
  const result = removeAuthoringRow(withoutCue,'asset','little-post-office-cover');
  assert.deepEqual(result.tables.asset,source.asset.filter(row => row.asset_id !== 'little-post-office-cover'));
  assert.equal(source.asset.some(row => row.asset_id === 'little-post-office-cover'),true);
  assert.throws(() => removeAuthoringRow(source,'cue','unknown'),/삭제할 행/);
});

test('released ledgers reject deletion', () => {
  const source = tables();
  source.story_work[0].status = 'released';
  assert.throws(() => removeAuthoringRow(source,'cue','ten-year-mail-cover'),/배포본/);
});
