import { z } from 'zod';

const id = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const visibleTextKey = (value: string) => value.normalize('NFKC')
  .replace(/[\s\p{Cc}\p{Cf}]+/gu, ' ').trim();
const nonBlankText = (maximum: number) => z.string().min(1).max(maximum)
  .refine(value => visibleTextKey(value).length > 0, 'Text must contain a visible character');
const condition = z.object({ flagId: id, equals: z.boolean() }).strict();
const effect = z.object({ flagId: id, setValue: z.boolean() }).strict();
const choice = z.object({
  id, text: nonBlankText(300), nextNodeId: id,
  requires: z.array(condition).max(12), effects: z.array(effect).max(12),
}).strict();
export const storySchema = z.object({
  storyId: id, version: z.number().int().positive(), schemaVersion: z.literal(1),
  engineContractVersion: z.literal(1), locale: z.literal('ko'),
  title: nonBlankText(120), description: nonBlankText(500), startNodeId: id,
  flags: z.array(z.object({ id, defaultValue: z.boolean() }).strict()).max(12),
  nodes: z.array(z.discriminatedUnion('type', [
    z.object({ id, type: z.literal('letter'), sender: nonBlankText(100),
      body: nonBlankText(20000), choices: z.array(choice).min(1).max(8) }).strict(),
    z.object({ id, type: z.literal('ending'), endingId: id, body: nonBlankText(20000) }).strict(),
  ])).min(2).max(200),
}).strict();
export type Story = z.infer<typeof storySchema>;
export type StoryNode = Story['nodes'][number];
export type Choice = z.infer<typeof choice>;
export type Flags = Record<string, boolean>;
export type ErrorCode = 'invalid_content' | 'invalid_save' | 'incompatible_content' | 'invalid_choice' | 'stale_revision' | 'storage_failure';
export class GameError extends Error {
  constructor(public readonly code: ErrorCode, detail: string = code) { super(detail); }
}
function fail(detail: string): never { throw new GameError('invalid_content', detail); }
function unique(values: string[], label: string) {
  if (new Set(values).size !== values.length) fail(`Duplicate ${label}`);
}
export function initialFlags(story: Story): Flags {
  return Object.fromEntries(story.flags.map(flag => [flag.id, flag.defaultValue]));
}
export function nodeAt(story: Story, nodeId: string): StoryNode {
  const node = story.nodes.find(item => item.id === nodeId);
  if (!node) throw new GameError('incompatible_content', 'Missing saved node');
  return node;
}
export function availableChoices(node: StoryNode, flags: Flags): Choice[] {
  return node.type === 'letter' ? node.choices.filter(item =>
    item.requires.every(requirement => flags[requirement.flagId] === requirement.equals)) : [];
}
export function advance(story: Story, nodeId: string, flags: Flags, choiceId: string) {
  const node = nodeAt(story, nodeId);
  const selected = availableChoices(node, flags).find(item => item.id === choiceId);
  if (!selected) throw new GameError('invalid_choice');
  const nextFlags = { ...flags };
  for (const effect of selected.effects) nextFlags[effect.flagId] = effect.setValue;
  return { node: nodeAt(story, selected.nextNodeId), flags: nextFlags, choice: selected };
}
export function parseStory(input: unknown): Story {
  const parsed = storySchema.safeParse(input);
  if (!parsed.success) fail(parsed.error.message);
  const story = parsed.data;
  unique(story.nodes.map(node => node.id), 'node');
  unique(story.flags.map(flag => flag.id), 'flag');
  unique(story.nodes.flatMap(node => node.type === 'ending' ? [node.endingId] : []), 'ending');
  const nodes = new Map(story.nodes.map(node => [node.id, node]));
  const flags = new Set(story.flags.map(flag => flag.id));
  const referencedFlags = new Set<string>();
  if (nodes.get(story.startNodeId)?.type !== 'letter') fail('Start must be a letter');
  for (const node of story.nodes) {
    if (node.type === 'ending') continue;
    unique(node.choices.map(item => item.id), 'choice');
    unique(node.choices.map(item => visibleTextKey(item.text)), 'choice text');
    for (const item of node.choices) {
      if (!nodes.has(item.nextNodeId)) fail('Missing target');
      unique(item.requires.map(value => value.flagId), 'condition');
      unique(item.effects.map(value => value.flagId), 'effect');
      for (const value of [...item.requires, ...item.effects]) {
        if (!flags.has(value.flagId)) fail('Undeclared flag');
        referencedFlags.add(value.flagId);
      }
    }
  }
  if (story.flags.some(flag => !referencedFlags.has(flag.id))) fail('Unused flag');
  // Reject cycles before state exploration so author mistakes cannot hang the build.
  const visiting = new Set<string>(); const visited = new Set<string>();
  function visit(nodeId: string) {
    if (visiting.has(nodeId)) fail('Cycle');
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    const node = nodes.get(nodeId)!;
    if (node.type === 'letter') for (const item of node.choices) visit(item.nextNodeId);
    visiting.delete(nodeId); visited.add(nodeId);
  }
  visit(story.startNodeId);
  if (visited.size !== nodes.size) fail('Unreachable node');
  const reached = new Set<string>(); const reachedChoices = new Set<string>(); const states = new Set<string>();
  const queue = [{ nodeId: story.startNodeId, flags: initialFlags(story) }];
  while (queue.length) {
    const state = queue.pop()!;
    const key = JSON.stringify([state.nodeId, story.flags.map(flag => state.flags[flag.id])]);
    if (states.has(key)) continue;
    states.add(key);
    if (states.size > 50000) fail('State budget exceeded; simplify branches');
    reached.add(state.nodeId);
    const node = nodes.get(state.nodeId)!;
    if (node.type === 'ending') continue;
    const choices = availableChoices(node, state.flags);
    if (!choices.length) fail(`Dead end: ${node.id}`);
    for (const item of choices) {
      reachedChoices.add(`${node.id}:${item.id}`);
      const next = advance(story, node.id, state.flags, item.id);
      queue.push({ nodeId: next.node.id, flags: next.flags });
    }
  }
  if (reached.size !== nodes.size) fail('Conditions make nodes unreachable');
  const choiceCount = story.nodes.reduce((total, node) => total + (node.type === 'letter' ? node.choices.length : 0), 0);
  if (reachedChoices.size !== choiceCount) fail('Conditions make choices unreachable');
  return story;
}
