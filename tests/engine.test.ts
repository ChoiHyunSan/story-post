import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditStory } from '../src/engine/audit';
import { advance, availableChoices, GameError, initialFlags, parseStory, type Story } from '../src/engine/story';
function fixture(): Story { return JSON.parse(readFileSync('content/fixtures/foundation.json', 'utf8')); }
function invalid(story: Story) { assert.throws(() => parseStory(story), (error: unknown) => error instanceof GameError && error.code === 'invalid_content'); }
test('each decision unlocks its own ending and does not mutate previous state', () => {
  const story = parseStory(fixture()); const flags = initialFlags(story);
  const opened = advance(story, 'arrival', flags, 'open');
  assert.equal(flags.opened, false);
  assert.deepEqual(availableChoices(opened.node, opened.flags).map(choice => choice.id), ['read']);
  assert.equal(advance(story, 'reply', opened.flags, 'read').node.id, 'read-ending');
  assert.equal(advance(story, 'reply', flags, 'keep').node.id, 'kept-ending');
  assert.throws(() => advance(story, 'reply', flags, 'read'), GameError);
  assert.throws(() => advance(story, 'kept-ending', flags, 'keep'), GameError);
});
test('unknown input and unsupported content versions fail validation', () => {
  for (const value of [null, {}, { ...fixture(), schemaVersion: 99 }, { ...fixture(), extra: true }]) {
    assert.throws(() => parseStory(value), GameError);
  }
});
test('missing destination and duplicate nodes are rejected', () => {
  const story = fixture(); story.nodes.push(story.nodes[0]); invalid(story);
  const missing = fixture(); if (missing.nodes[0].type === 'letter') missing.nodes[0].choices[0].nextNodeId = 'absent'; invalid(missing);
});
test('blank visible text and indistinguishable choices are rejected', () => {
  const blank = fixture(); blank.title = '   '; invalid(blank);
  const blankBody = fixture(); blankBody.nodes[0].body = '\n\t'; invalid(blankBody);
  const invisible = fixture(); invisible.description = '\u200b'; invalid(invisible);
  const duplicateText = fixture();
  if (duplicateText.nodes[0].type === 'letter') {
    duplicateText.nodes[0].choices[1].text = ` \u200b${duplicateText.nodes[0].choices[0].text} `;
  }
  invalid(duplicateText);
});
test('cycles and unreachable nodes are rejected', () => {
  const cyclic = fixture(); if (cyclic.nodes[0].type === 'letter') cyclic.nodes[0].choices[0].nextNodeId = 'arrival'; invalid(cyclic);
  const detached = fixture(); detached.nodes.push({ id: 'detached', type: 'ending', endingId: 'detached', body: 'Unused' }); invalid(detached);
});
test('undeclared flags and contradictory or duplicate conditions are rejected', () => {
  const story = fixture(); story.flags = []; invalid(story);
  const duplicate = fixture(); if (duplicate.nodes[1].type === 'letter') duplicate.nodes[1].choices[0].requires.push({ flagId: 'opened', equals: false }); invalid(duplicate);
  const unused = fixture(); unused.flags.push({ id: 'unused', defaultValue: false }); invalid(unused);
});
test('reachable dead-end states and impossible endings are rejected', () => {
  const dead = fixture(); if (dead.nodes[1].type === 'letter') dead.nodes[1].choices = dead.nodes[1].choices.slice(0, 1); invalid(dead);
  const impossible = fixture(); if (impossible.nodes[0].type === 'letter') impossible.nodes[0].choices[0].effects = []; invalid(impossible);
});
test('a choice that conditions can never reveal is rejected', () => {
  const story = fixture();
  if (story.nodes[0].type === 'letter') story.nodes[0].choices.push({
    id: 'hidden', text: '숨은 선택', nextNodeId: 'reply',
    requires: [{ flagId: 'opened', equals: true }], effects: [],
  });
  invalid(story);
});
test('content audit reports deterministic shortest routes to every ending', () => {
  const audit = auditStory(parseStory(fixture()));
  assert.deepEqual({ nodes: audit.nodes, letters: audit.letters, endings: audit.endings,
    choices: audit.choices, flags: audit.flags, reachableStates: audit.reachableStates },
  { nodes: 4, letters: 2, endings: 2, choices: 4, flags: 1, reachableStates: 5 });
  assert.ok(audit.textCharacters > 0);
  assert.deepEqual(audit.endingPaths, [
    { endingId: 'letter-kept', nodeId: 'kept-ending', steps: 2,
      choices: ['arrival:wait', 'reply:keep'] },
    { endingId: 'letter-read', nodeId: 'read-ending', steps: 2,
      choices: ['arrival:open', 'reply:read'] },
  ]);
});
