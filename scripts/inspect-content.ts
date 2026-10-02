import { developmentContent } from '../src/generated/content';
import { auditStory } from '../src/engine/audit';
import { parseStory } from '../src/engine/story';
import { readingTimeLabel, storyPresentation } from '../src/content/presentation';

const releases = developmentContent.map(({ story: input, hash, developmentOnly, showInLibrary }) => {
  const story = parseStory(input);
  return { story, hash, developmentOnly, showInLibrary,
    audit: auditStory(story), presentation: storyPresentation(story) };
});
console.table(releases.map(({ story, hash, developmentOnly, showInLibrary, audit, presentation }) => ({
  story: story.storyId, version: story.version, nodes: audit.nodes, letters: audit.letters,
  endings: audit.endings, choices: audit.choices, flags: audit.flags, states: audit.reachableStates,
  characters: audit.textCharacters, playtime: readingTimeLabel(presentation),
  scope: developmentOnly ? 'development' : 'production', library: showInLibrary ? 'visible' : 'hidden',
  hash: hash.slice(0, 12),
})));
console.table(releases.flatMap(({ story, audit }) => audit.endingPaths.map(ending => ({
  story: `${story.storyId}@${story.version}`, ending: ending.endingId,
  steps: ending.steps, shortestPath: ending.choices.join(' → '),
}))));
