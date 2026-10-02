import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readTables } from '../scripts/authoring-files';
import { searchScenes } from '../tools/authoring-studio/scene.mjs';

const tables = () => readTables('content/authoring/works/little-post-office-v4');

test('scene search covers title, body, notes, stable IDs and ending IDs without editing the ledger', () => {
  const source = tables();
  source.scene[0].notes = '참조 사진 검수 필요';
  const before = structuredClone(source);
  assert.equal(searchScenes(source,'참조 사진')[0].scene_id,'ten-year-mail');
  assert.ok(searchScenes(source,'녹슨 열쇠').some(row => row.scene_id === 'first-letter'));
  assert.equal(searchScenes(source,'등대지기 해진')[0].scene_id,'haejin-letter');
  assert.equal(searchScenes(source,'YEONWOO-CONFESSION')[0].scene_id,'yeonwoo-confession');
  assert.equal(searchScenes(source,'last-letter-kept')[0].scene_id,'kept-ending');
  assert.deepEqual(source,before);
});

test('empty search preserves ordinal order and literal punctuation is not a regular expression', () => {
  const source = tables();
  source.scene.reverse();
  const results = searchScenes(source,'  ');
  assert.equal(results.length,18);
  assert.equal(results[0].scene_id,'ten-year-mail');
  assert.deepEqual(searchScenes(source,'[missing*'),[]);
  assert.equal(source.scene[0].scene_id,'kept-ending');
});

test('full-width characters, mixed case and line breaks normalize consistently', () => {
  const source = tables();
  source.scene[0].notes = 'AI\n  검수';
  assert.equal(searchScenes(source,'ＡＩ 검수')[0].scene_id,'ten-year-mail');
});
