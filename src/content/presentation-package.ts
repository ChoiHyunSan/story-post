import { z } from 'zod';
import { GameError, type Story } from '../engine/story';

const id = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const assetPath = z.string().regex(/^assets\/[a-z0-9][a-z0-9/_-]*\.(?:jpe?g|png|webp|mp3|m4a|wav)$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const optionalTargetId = id.optional();

const asset = z.object({
  id,
  type: z.enum(['background', 'portrait', 'overlay', 'bgm', 'sfx', 'voice']),
  bundlePath: assetPath,
  hash,
  altText: z.string().max(500),
  durationMs: z.number().int().nonnegative().optional(),
}).strict();

const cue = z.object({
  id,
  sceneId: id,
  blockId: optionalTargetId,
  choiceId: optionalTargetId,
  trigger: z.enum(['scene_enter', 'before_block', 'after_block', 'choices_visible', 'choice_selected', 'scene_exit']),
  channel: z.enum(['background', 'portrait', 'overlay', 'bgm', 'sfx', 'voice']),
  action: z.enum(['show', 'hide', 'swap', 'play', 'stop', 'fade_in', 'fade_out', 'crossfade']),
  assetId: optionalTargetId,
  ordinal: z.number().int().nonnegative(),
  fadeMs: z.number().int().nonnegative(),
  volume: z.number().min(0).max(1).optional(),
  loop: z.boolean(),
  durationMs: z.number().int().nonnegative().optional(),
}).strict();

export const presentationPackageSchema = z.object({
  presentationSchemaVersion: z.literal(1),
  assets: z.array(asset).max(500),
  cues: z.array(cue).max(2000),
}).strict();

export type PresentationPackage = z.infer<typeof presentationPackageSchema>;
export type PresentationAsset = PresentationPackage['assets'][number];
export type PresentationCue = PresentationPackage['cues'][number];

export const emptyPresentationPackage: PresentationPackage = {
  presentationSchemaVersion: 1,
  assets: [],
  cues: [],
};

const allowedActions: Record<PresentationCue['channel'], ReadonlySet<PresentationCue['action']>> = {
  background: new Set(['show', 'hide', 'swap', 'fade_in', 'fade_out', 'crossfade']),
  portrait: new Set(['show', 'hide', 'swap', 'fade_in', 'fade_out', 'crossfade']),
  overlay: new Set(['show', 'hide', 'fade_in', 'fade_out']),
  bgm: new Set(['play', 'stop', 'crossfade']),
  sfx: new Set(['play', 'stop']),
  voice: new Set(['play', 'stop']),
};

function fail(detail: string): never {
  throw new GameError('invalid_content', detail);
}

export function parsePresentationPackage(input: unknown, story: Story): PresentationPackage {
  const parsed = presentationPackageSchema.safeParse(input);
  if (!parsed.success) fail(parsed.error.message);
  const presentation = parsed.data;
  const assetIds = new Set<string>();
  const cueIds = new Set<string>();
  const cueOrder = new Set<string>();
  const nodes = new Map(story.nodes.map(node => [node.id, node]));
  for (const item of presentation.assets) {
    if (assetIds.has(item.id)) fail(`Duplicate presentation asset: ${item.id}`);
    assetIds.add(item.id);
  }
  for (const item of presentation.cues) {
    if (cueIds.has(item.id)) fail(`Duplicate presentation cue: ${item.id}`);
    cueIds.add(item.id);
    const orderKey = `${item.sceneId}:${item.trigger}:${item.ordinal}`;
    if (cueOrder.has(orderKey)) fail(`Duplicate presentation cue order: ${orderKey}`);
    cueOrder.add(orderKey);
    const node = nodes.get(item.sceneId);
    if (!node) fail(`Presentation cue references missing scene: ${item.sceneId}`);
    if (['before_block', 'after_block'].includes(item.trigger) !== Boolean(item.blockId)) {
      fail(`Presentation block trigger mismatch: ${item.id}`);
    }
    if ((item.trigger === 'choice_selected') !== Boolean(item.choiceId)) {
      fail(`Presentation choice trigger mismatch: ${item.id}`);
    }
    if (item.choiceId && (node.type !== 'letter' || !node.choices.some(choice => choice.id === item.choiceId))) {
      fail(`Presentation cue references missing choice: ${item.choiceId}`);
    }
    const needsAsset = ['show', 'swap', 'play', 'fade_in', 'crossfade'].includes(item.action);
    if (needsAsset !== Boolean(item.assetId)) fail(`Presentation action asset mismatch: ${item.id}`);
    if (item.assetId && !assetIds.has(item.assetId)) fail(`Presentation cue references missing asset: ${item.assetId}`);
    const referencedAsset = presentation.assets.find(value => value.id === item.assetId);
    if (referencedAsset && referencedAsset.type !== item.channel) {
      fail(`Presentation cue channel differs from asset type: ${item.id}`);
    }
    if (!allowedActions[item.channel].has(item.action)) {
      fail(`Presentation action is invalid for channel: ${item.id}`);
    }
    const isAudio = ['bgm', 'sfx', 'voice'].includes(item.channel);
    if (!isAudio && (item.volume !== undefined || item.loop)) {
      fail(`Visual presentation cue cannot use volume or loop: ${item.id}`);
    }
  }
  return presentation;
}

export function cuesAt(
  presentation: PresentationPackage,
  sceneId: string,
  trigger: PresentationCue['trigger'],
): PresentationCue[] {
  return presentation.cues
    .filter(cueItem => cueItem.sceneId === sceneId && cueItem.trigger === trigger)
    .sort((left, right) => left.ordinal - right.ordinal);
}


export function sceneBackgroundAsset(presentation: PresentationPackage, sceneId: string): PresentationAsset | undefined {
  const cue = cuesAt(presentation, sceneId, 'scene_enter')
    .filter(item => item.channel === 'background').at(-1);
  return cue?.assetId ? presentation.assets.find(asset => asset.id === cue.assetId) : undefined;
}
