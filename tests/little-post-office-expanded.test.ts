import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { latestReleases, createCatalog } from '../src/content/catalog';
import { auditStory } from '../src/engine/audit';
import { advance, initialFlags, parseStory } from '../src/engine/story';

const story = parseStory(JSON.parse(
  readFileSync('content/stories/little-post-office/episode-01-v3.json', 'utf8'),
));

function play(choiceIds: string[]) {
  let nodeId = story.startNodeId;
  let flags = initialFlags(story);
  for (const choiceId of choiceIds) {
    const result = advance(story, nodeId, flags, choiceId);
    nodeId = result.node.id;
    flags = result.flags;
  }
  return { node: story.nodes.find(node => node.id === nodeId)!, flags };
}

const routes = [
  {
    name: 'shared address route',
    choices: ['accept-first-letter', 'show-warning', 'enter-bookshop-together', 'read-address-book',
      'leave-before-answer', 'walk-with-sora', 'sort-undelivered-mail', 'leave-sealed',
      'let-sora-turn-key', 'take-final-mail-together', 'return-ledger'],
    ending: 'letters-returned', withSora: true,
  },
  {
    name: 'solo address route',
    choices: ['accept-first-letter', 'hide-warning', 'enter-bookshop-alone', 'read-address-book',
      'leave-before-answer', 'walk-alone', 'sort-undelivered-mail', 'leave-sealed',
      'turn-key-alone', 'take-final-mail-alone', 'keep-last-letter'],
    ending: 'last-letter-kept', withSora: false,
  },
  {
    name: 'shared confession route',
    choices: ['accept-first-letter', 'hide-warning', 'call-sora', 'read-personal-diary',
      'write-haejin', 'follow-haejin-map', 'walk-with-sora', 'read-yeonwoo-confession',
      'keep-confession-complete', 'let-sora-turn-key', 'take-final-mail-together', 'return-ledger'],
    ending: 'letters-returned', withSora: true,
  },
  {
    name: 'solo confession route',
    choices: ['ask-sender', 'open-after-answer', 'hide-warning', 'enter-bookshop-alone',
      'read-personal-diary', 'write-haejin', 'follow-haejin-map', 'walk-alone',
      'read-yeonwoo-confession', 'keep-confession-complete', 'turn-key-alone',
      'take-final-mail-alone', 'keep-last-letter'],
    ending: 'last-letter-kept', withSora: false,
  },
] as const;

for (const route of routes) {
  test(`little post office v3 completes the ${route.name}`, () => {
    const result = play([...route.choices]);
    assert.equal(result.node.type, 'ending');
    if (result.node.type === 'ending') assert.equal(result.node.endingId, route.ending);
    assert.equal(result.flags['with-sora'], route.withSora);
  });
}

test('little post office v3 has the intended expanded scope', () => {
  const audit = auditStory(story);
  assert.deepEqual({ nodes: audit.nodes, letters: audit.letters, endings: audit.endings,
    choices: audit.choices, flags: audit.flags, reachableStates: audit.reachableStates },
  { nodes: 18, letters: 16, endings: 2, choices: 25, flags: 3, reachableStates: 47 });
  assert.ok(audit.textCharacters >= 5500 && audit.textCharacters <= 7000);
  assert.deepEqual(audit.endingPaths.map(ending => [ending.endingId, ending.steps]), [
    ['last-letter-kept', 11], ['letters-returned', 11],
  ]);
});

test('the library exposes v3 while keeping older releases available for saved runs', () => {
  const catalog = createCatalog(true);
  const versions = catalog.filter(release => release.story.storyId === 'little-post-office')
    .map(release => release.story.version);
  assert.deepEqual(versions, [1, 2, 3]);
  assert.equal(latestReleases(catalog).find(release => release.story.storyId === 'little-post-office')?.story.version, 3);
});


test('v3 removes route-specific claims from shared ending nodes', () => {
  const returned = story.nodes.find(node => node.id === 'returned-ending');
  const kept = story.nodes.find(node => node.id === 'kept-ending');
  const privateRoute = story.nodes.find(node => node.id === 'private-route');
  const tideRoad = story.nodes.find(node => node.id === 'tide-road');
  assert.ok(returned?.body.includes('당신은 장부의 첫 주소부터'));
  assert.ok(!returned?.body.includes('당신과 소라는'));
  assert.ok(kept?.body.includes('당신이 섬으로 돌아갈 만큼'));
  assert.ok(!kept?.body.includes('세 사람이'));
  assert.ok(privateRoute?.body.includes('자물쇠에 넣자'));
  assert.ok(!tideRoad?.body.includes('두 사람의 발자국'));
});
