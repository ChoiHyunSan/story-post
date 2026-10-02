import assert from 'node:assert/strict';
import { test } from 'node:test';
import { importAuthoringCsv } from '../scripts/authoring-csv';
import { previewStory } from '../scripts/authoring-preview';
import { createAuthoringDatabase, exportPresentationPackage, exportRuntimeStory } from '../scripts/authoring-store';

function fixture() {
  const database = createAuthoringDatabase();
  try {
    importAuthoringCsv(database, 'content/authoring/works/little-post-office-v4');
    const key = { storyId: 'little-post-office', workingVersion: 4, locale: 'ko' };
    return { story: exportRuntimeStory(database, key), presentation: exportPresentationPackage(database, key, { allowPlanned: true }) };
  } finally { database.close(); }
}
const sharedRoute = ['accept-first-letter', 'show-warning', 'enter-bookshop-together', 'read-address-book',
  'leave-before-answer', 'walk-with-sora', 'sort-undelivered-mail', 'leave-sealed', 'let-sora-turn-key', 'take-final-mail-together'];

test('preview starts from current manuscript text without changing the source', () => {
  const { story, presentation } = fixture();
  story.nodes[0].body = '편집 중인 문장';
  const before = structuredClone(story);
  const run = previewStory(story, presentation, []);
  assert.equal(run.node.id, story.startNodeId);
  assert.equal(run.node.body, '편집 중인 문장');
  assert.equal(run.choices.length, 2);
  assert.deepEqual(run.history, []);
  assert.match(run.background!.url, /^\/api\/asset-preview\?path=assets/);
  assert.deepEqual(story, before);
});

test('preview replays flags and exposes only choices allowed by the selected route', () => {
  const { story, presentation } = fixture();
  const run = previewStory(story, presentation, sharedRoute.slice(0, 5));
  assert.equal(run.node.id, 'tide-road');
  assert.equal(run.background?.id, 'little-post-office-tide-road-v2');
  assert.match(run.background!.url, /little-post-office-tide-road-v2\.png/);
  assert.equal(run.flags['with-sora'], true);
  assert.deepEqual(run.choices.map(choice => choice.id), ['walk-with-sora']);
  assert.throws(() => previewStory(story, presentation, [...sharedRoute.slice(0, 5), 'walk-alone']), /이 경로/);
});

test('going back in preview recalculates companion flags from the remaining choices', () => {
  const { story, presentation } = fixture();
  const history = ['accept-first-letter', 'hide-warning', 'call-sora'];
  assert.equal(previewStory(story, presentation, history).flags['with-sora'], true);
  const back = previewStory(story, presentation, history.slice(0, -1));
  assert.equal(back.node.id, 'private-route');
  assert.equal(back.flags['with-sora'], false);
  assert.equal(back.history.length, 2);
});

test('preview reaches both endings and rejects extra choices after an ending', () => {
  const { story, presentation } = fixture();
  const returned = previewStory(story, presentation, [...sharedRoute, 'return-ledger']);
  const kept = previewStory(story, presentation, [...sharedRoute, 'keep-last-letter']);
  assert.equal(returned.node.endingId, 'letters-returned');
  assert.equal(kept.node.endingId, 'last-letter-kept');
  assert.deepEqual(returned.choices, []);
  assert.equal(returned.history.length, 11);
  assert.throws(() => previewStory(story, presentation, [...sharedRoute, 'return-ledger', 'accept-first-letter']), /이 경로/);
  assert.throws(() => previewStory(story, presentation, Array(201).fill('accept-first-letter')), /너무 깁니다/);
});
