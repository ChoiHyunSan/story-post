import { advance, availableChoices, initialFlags, nodeAt, type Flags, type Story } from '../engine/story';

export interface StoryPresentation {
  endingCount: number;
  minimumMinutes: number;
  maximumMinutes: number;
}

const READING_CHARACTERS_PER_MINUTE = 240;
const presentationCache = new WeakMap<Story, StoryPresentation>();

export function storyPresentation(story: Story): StoryPresentation {
  const cached = presentationCache.get(story);
  if (cached) return cached;
  const memo = new Map<string, { minimum: number; maximum: number }>();
  function measure(nodeId: string, flags: Flags): { minimum: number; maximum: number } {
    const key = JSON.stringify([nodeId, story.flags.map(flag => flags[flag.id])]);
    const saved = memo.get(key);
    if (saved) return saved;
    if (memo.size >= 50000) throw new Error('Story presentation state budget exceeded');
    const node = nodeAt(story, nodeId);
    if (node.type === 'ending') {
      const result = { minimum: node.body.length, maximum: node.body.length };
      memo.set(key, result);
      return result;
    }
    const paths = availableChoices(node, flags).map(choice => {
      const next = advance(story, node.id, flags, choice.id);
      const remainder = measure(next.node.id, next.flags);
      return {
        minimum: node.body.length + choice.text.length + remainder.minimum,
        maximum: node.body.length + choice.text.length + remainder.maximum,
      };
    });
    const result = {
      minimum: Math.min(...paths.map(path => path.minimum)),
      maximum: Math.max(...paths.map(path => path.maximum)),
    };
    memo.set(key, result);
    return result;
  }
  const characters = measure(story.startNodeId, initialFlags(story));
  const toMinutes = (characters: number) => Math.max(1, Math.ceil(characters / READING_CHARACTERS_PER_MINUTE));
  const presentation = {
    endingCount: story.nodes.filter(node => node.type === 'ending').length,
    minimumMinutes: toMinutes(characters.minimum),
    maximumMinutes: toMinutes(characters.maximum),
  };
  presentationCache.set(story, presentation);
  return presentation;
}

export function readingTimeLabel({ minimumMinutes, maximumMinutes }: StoryPresentation): string {
  return minimumMinutes === maximumMinutes
    ? `약 ${minimumMinutes}분`
    : `약 ${minimumMinutes}~${maximumMinutes}분`;
}

export function endingLabel(story: Story, endingId: string): string {
  const ending = story.nodes.find(node => node.type === 'ending' && node.endingId === endingId);
  if (!ending || ending.type !== 'ending') return `이전 버전 결말 · ${endingId}`;
  const marker = ending.body.match(/(?:^|\n)엔딩\s*·\s*([^\n]+)\s*$/);
  if (marker) return marker[1].trim();
  const firstLine = ending.body.split('\n').find(line => line.trim())?.trim();
  if (!firstLine) return `결말 · ${endingId}`;
  return firstLine.length <= 60 ? firstLine : `${firstLine.slice(0, 57)}…`;
}
