import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { auditStory } from '../src/engine/audit';
import { advance, availableChoices, initialFlags, parseStory } from '../src/engine/story';

const story = parseStory(JSON.parse(
  readFileSync('content/stories/little-post-office/episode-01.json', 'utf8'),
));

function choose(nodeId: string, flags: Record<string, boolean>, choiceId: string) {
  return advance(story, nodeId, flags, choiceId);
}

test('little post office shared route reaches the returned-letters ending', () => {
  let flags = initialFlags(story);
  let result = choose('ten-year-mail', flags, 'accept-first-letter'); flags = result.flags;
  result = choose(result.node.id, flags, 'show-warning'); flags = result.flags;
  result = choose(result.node.id, flags, 'go-with-sora'); flags = result.flags;
  assert.deepEqual(availableChoices(result.node, flags).map(choice => choice.id), ['enter-together']);
  result = choose(result.node.id, flags, 'enter-together'); flags = result.flags;
  result = choose(result.node.id, flags, 'return-ledger');
  assert.equal(result.node.type, 'ending');
  if (result.node.type === 'ending') assert.equal(result.node.endingId, 'letters-returned');
});

test('little post office private route reaches the kept-letter ending', () => {
  let flags = initialFlags(story);
  let result = choose('ten-year-mail', flags, 'accept-first-letter'); flags = result.flags;
  result = choose(result.node.id, flags, 'hide-warning'); flags = result.flags;
  result = choose(result.node.id, flags, 'leave-alone'); flags = result.flags;
  assert.deepEqual(availableChoices(result.node, flags).map(choice => choice.id), ['enter-alone']);
  result = choose(result.node.id, flags, 'enter-alone'); flags = result.flags;
  result = choose(result.node.id, flags, 'keep-last-letter');
  assert.equal(result.node.type, 'ending');
  if (result.node.type === 'ending') assert.equal(result.node.endingId, 'last-letter-kept');
});

test('asking the sender adds a response and calling Sora back changes the lighthouse route', () => {
  let flags = initialFlags(story);
  let result = choose('ten-year-mail', flags, 'ask-sender'); flags = result.flags;
  assert.equal(result.node.id, 'sora-answer');
  result = choose(result.node.id, flags, 'open-after-answer'); flags = result.flags;
  result = choose(result.node.id, flags, 'hide-warning'); flags = result.flags;
  result = choose(result.node.id, flags, 'call-sora-back'); flags = result.flags;
  assert.equal(flags['shared-warning'], true);
  assert.equal(flags['with-sora'], true);
  assert.deepEqual(availableChoices(result.node, flags).map(choice => choice.id), ['enter-together']);
});

test('little post office audit keeps both endings reachable with the intended scope', () => {
  const audit = auditStory(story);
  assert.deepEqual({ nodes: audit.nodes, letters: audit.letters, endings: audit.endings,
    choices: audit.choices, flags: audit.flags, reachableStates: audit.reachableStates },
  { nodes: 9, letters: 7, endings: 2, choices: 13, flags: 2, reachableStates: 17 });
  assert.ok(audit.textCharacters >= 1800 && audit.textCharacters <= 2200);
  assert.deepEqual(audit.endingPaths.map(ending => ending.endingId),
    ['last-letter-kept', 'letters-returned']);
});
