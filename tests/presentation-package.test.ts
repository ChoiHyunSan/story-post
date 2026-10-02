import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  cuesAt,
  sceneBackgroundAsset,
  parsePresentationPackage,
  type PresentationPackage,
} from '../src/content/presentation-package';
import { GameError, parseStory } from '../src/engine/story';

const story = parseStory(JSON.parse(
  readFileSync('content/stories/little-post-office/episode-01-v3.json', 'utf8'),
));
function fixture(): PresentationPackage {
  return JSON.parse(readFileSync(
    'content/presentations/little-post-office/episode-01-v3.json', 'utf8',
  )) as PresentationPackage;
}
function invalid(presentation: PresentationPackage): void {
  assert.throws(
    () => parsePresentationPackage(presentation, story),
    (error: unknown) => error instanceof GameError && error.code === 'invalid_content',
  );
}

test('v3 presentation resolves its opening background cue', () => {
  const presentation = parsePresentationPackage(fixture(), story);
  assert.equal(presentation.assets.length, 1);
  assert.deepEqual(cuesAt(presentation, story.startNodeId, 'scene_enter').map(cue => cue.id), [
    'ten-year-mail-cover',
  ]);
});

test('presentation rejects missing scenes, choices and assets', () => {
  const missingScene = fixture();
  missingScene.cues[0].sceneId = 'absent';
  invalid(missingScene);

  const missingAsset = fixture();
  missingAsset.cues[0].assetId = 'absent';
  invalid(missingAsset);

  const missingChoice = fixture();
  missingChoice.cues[0] = {
    ...missingChoice.cues[0],
    trigger: 'choice_selected',
    choiceId: 'absent',
  };
  invalid(missingChoice);
});

test('presentation rejects channel mismatches and duplicate event order', () => {
  const wrongChannel = fixture();
  wrongChannel.cues[0].channel = 'bgm';
  invalid(wrongChannel);

  const duplicateOrder = fixture();
  duplicateOrder.cues.push({ ...duplicateOrder.cues[0], id: 'second-opening-cue' });
  invalid(duplicateOrder);

  const wrongAction = fixture();
  wrongAction.cues[0].action = 'play';
  invalid(wrongAction);

  const visualVolume = fixture();
  visualVolume.cues[0].volume = 0.5;
  invalid(visualVolume);
});

test('cue lookup preserves explicit ordinal order', () => {
  const presentation = fixture();
  presentation.cues = [
    { ...presentation.cues[0], id: 'later-cue', ordinal: 2 },
    { ...presentation.cues[0], id: 'earlier-cue', ordinal: 1 },
  ];
  const parsed = parsePresentationPackage(presentation, story);
  assert.deepEqual(cuesAt(parsed, story.startNodeId, 'scene_enter').map(cue => cue.id), [
    'earlier-cue', 'later-cue',
  ]);
});


test('background resolution applies the final entry cue and respects hide and fade-out', () => {
  const presentation = fixture();
  const opening = presentation.cues[0];
  const originalAsset = presentation.assets[0];
  const alternate = { ...originalAsset, id: 'alternate-background' };
  presentation.assets.push(alternate);
  presentation.cues = [
    { ...opening, id: 'later-background', ordinal: 2, assetId: alternate.id },
    opening,
  ];
  assert.equal(sceneBackgroundAsset(presentation, story.startNodeId), alternate);
  const before = structuredClone(presentation);
  assert.equal(sceneBackgroundAsset(presentation, 'first-letter'), undefined);
  assert.deepEqual(presentation,before);
  for (const action of ['hide','fade_out'] as const) {
    presentation.cues.push({ ...opening, id: 'hide-background', action, assetId: undefined, ordinal: 3 });
    assert.equal(sceneBackgroundAsset(presentation, story.startNodeId), undefined);
    presentation.cues.pop();
  }
  presentation.cues.push({ ...opening, id: 'voice-stop', channel: 'voice', action: 'stop', assetId: undefined, ordinal: 4 });
  assert.equal(sceneBackgroundAsset(presentation, story.startNodeId), alternate);
});
