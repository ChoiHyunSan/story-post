import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { endingLabel, readingTimeLabel, storyPresentation } from '../src/content/presentation';
import { parseStory } from '../src/engine/story';

function story(path: string) {
  return parseStory(JSON.parse(readFileSync(path, 'utf8')));
}

test('story presentation estimates only playable paths and counts endings', () => {
  const fixtureStory = story('content/fixtures/foundation.json');
  const fixture = storyPresentation(fixtureStory);
  assert.deepEqual(fixture, { endingCount: 2, minimumMinutes: 1, maximumMinutes: 1 });
  assert.equal(readingTimeLabel(fixture), '약 1분');
  assert.equal(endingLabel(fixtureStory, 'letter-read'),
    '편지를 읽었습니다. 첫 번째 기록이 보관함에 남았습니다.');

  const expandedStory = story('content/stories/little-post-office/episode-01-v3.json');
  const expanded = storyPresentation(expandedStory);
  assert.deepEqual(expanded, { endingCount: 2, minimumMinutes: 15, maximumMinutes: 17 });
  assert.equal(readingTimeLabel(expanded), '약 15~17분');
  assert.equal(endingLabel(expandedStory, 'letters-returned'), '다시 시작된 배달');
  assert.equal(endingLabel(expandedStory, 'unknown-ending'), '이전 버전 결말 · unknown-ending');
});
