import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { readTables, writeTables } from '../scripts/authoring-files';
import { importAuthoringCsv } from '../scripts/authoring-csv';
import { createAuthoringDatabase, exportRuntimeStory } from '../scripts/authoring-store';
import { choiceRules, replaceChoiceRules } from '../tools/authoring-studio/choice-rules.mjs';

const tables = () => readTables('content/authoring/works/little-post-office-v4');

test('choice rules expose ordered boolean conditions and effects without mutating the ledger', () => {
  const source = tables();
  const before = structuredClone(source);
  assert.deepEqual(choiceRules(source, 'walk-with-sora'), { conditions: [{ flagId: 'with-sora', value: true }], effects: [] });
  assert.deepEqual(choiceRules(source, 'show-warning').effects, [{ flagId: 'with-sora', value: true }]);
  assert.deepEqual(choiceRules(source, 'ask-sender'), { conditions: [], effects: [] });
  assert.deepEqual(source, before);
});

test('rule replacement only changes the selected choice and preserves IDs, flags, media and destinations', () => {
  const source = tables();
  const before = structuredClone(source);
  const next = replaceChoiceRules(source, 'show-warning', {
    conditions: [{ flagId: 'follow-addresses', value: false }],
    effects: [{ flagId: 'with-sora', value: true }, { flagId: 'read-personal-note', value: false }],
  });
  assert.deepEqual(choiceRules(next, 'show-warning'), {
    conditions: [{ flagId: 'follow-addresses', value: false }],
    effects: [{ flagId: 'with-sora', value: true }, { flagId: 'read-personal-note', value: false }],
  });
  assert.deepEqual(next.choice, source.choice);
  assert.deepEqual(next.flag_definition, source.flag_definition);
  assert.deepEqual(next.asset, source.asset);
  assert.deepEqual(next.cue, source.cue);
  assert.deepEqual(next.choice_condition.filter(row => row.choice_id !== 'show-warning'), source.choice_condition);
  assert.deepEqual(source, before);
  assert.deepEqual(next.choice_effect.filter(row => row.choice_id === 'show-warning').map(row => row.ordinal), ['0', '1']);
});

test('rules reject missing flags, duplicate states, malformed values and released choices', () => {
  const source = tables();
  const before = structuredClone(source);
  assert.throws(() => replaceChoiceRules(source, 'absent', { conditions: [], effects: [] }), /선택지/);
  assert.throws(() => replaceChoiceRules(source, 'ask-sender', { conditions: [{ flagId: 'absent', value: true }], effects: [] }), /등록된/);
  assert.throws(() => replaceChoiceRules(source, 'ask-sender', { conditions: [{ flagId: 'with-sora', value: true }, { flagId: 'with-sora', value: false }], effects: [] }), /두 번/);
  assert.throws(() => replaceChoiceRules(source, 'ask-sender', { conditions: [], effects: Array(13).fill({ flagId: 'with-sora', value: true }) }), /12개/);
  assert.deepEqual(source, before);
  source.story_work[0].status = 'released';
  assert.throws(() => replaceChoiceRules(source, 'ask-sender', { conditions: [], effects: [] }), /배포본/);
});

test('an unsupported raw rule cannot silently become a valid-looking form value', () => {
  const source = tables();
  source.choice_condition[0].expected_value = 'yes';
  assert.throws(() => choiceRules(source, 'walk-with-sora'), /예 또는 아니요/);
  source.choice_condition[0].expected_value = 'true';
  source.choice_condition[0].operator = 'not-equals';
  assert.throws(() => choiceRules(source, 'walk-with-sora'), /지원하지 않는/);
});

test('removing a choice rule retains global state definitions and unrelated rules', () => {
  const source = tables();
  const next = replaceChoiceRules(source, 'walk-with-sora', { conditions: [], effects: [] });
  assert.deepEqual(next.flag_definition, source.flag_definition);
  assert.equal(next.choice_condition.some(row => row.choice_id === 'walk-with-sora'), false);
  assert.deepEqual(next.choice_effect, source.choice_effect);
});

test('whole-story validation rejects a locally valid rule that strands a reachable path', () => {
  const source = tables();
  const next = replaceChoiceRules(source, 'walk-with-sora', { conditions: [{ flagId: 'with-sora', value: false }], effects: [] });
  const temporary = mkdtempSync(join(tmpdir(), 'story-post-rules-'));
  const database = createAuthoringDatabase();
  try {
    writeTables(temporary, next);
    importAuthoringCsv(database, temporary);
    assert.throws(() => exportRuntimeStory(database, { storyId: 'little-post-office', workingVersion: 4, locale: 'ko' }));
  } finally {
    database.close();
    rmSync(temporary, { recursive: true, force: true });
  }
});
