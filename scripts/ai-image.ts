import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import OpenAI from 'openai';
import { z } from 'zod';
import type { AiProposal } from './ai-content';
import { resolveOpenAiApiKey } from './ai-credentials';

const assetIdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const runIdSchema = z.string().uuid();
export const imageRenditionSchema = z.enum(['draft', 'final']);
const imageAssetTypeSchema = z.enum(['background', 'portrait', 'overlay']);

const visualBibleSchema = z.object({
  id: z.string(), title: z.string(), style: z.string(), worldAnchors: z.array(z.string()),
  palette: z.array(z.string()), camera: z.string(), texture: z.string(), globalConstraints: z.array(z.string()),
  presets: z.record(imageAssetTypeSchema, z.object({ size: z.string(), composition: z.string(), constraints: z.string() })),
}).strict();

const visualBible = visualBibleSchema.parse(JSON.parse(readFileSync('content/ai/visual-bible.json', 'utf8')) as unknown);
const imageInstructions = readFileSync('content/ai/prompts/image-direction-v1.md', 'utf8');
const imageRunDirectory = '.authoring/image-runs';

type ArtProposal = NonNullable<AiProposal['art']>;
type ImageRendition = z.infer<typeof imageRenditionSchema>;
type ImageRun = {
  runId: string;
  createdAt: string;
  directory: string;
  sceneId: string;
  assetId: string;
  assetType: z.infer<typeof imageAssetTypeSchema>;
  rendition: ImageRendition;
  provider: string;
  model: string;
  quality: 'low' | 'high';
  size: string;
  mimeType: 'image/png' | 'image/jpeg';
  extension: 'png' | 'jpg';
  imagePath: string;
  prompt: string;
  contentHash: string;
  adoptedPath?: string;
};

export const imageGenerateRequestSchema = z.object({
  directory: z.string().min(1),
  sceneId: assetIdSchema,
  rendition: imageRenditionSchema,
  art: z.object({
    assetId: assetIdSchema,
    assetType: imageAssetTypeSchema,
    purpose: z.string().min(1).max(500),
    subject: z.string().min(1).max(1200),
    composition: z.string().min(1).max(1000),
    lighting: z.string().min(1).max(800),
    palette: z.string().min(1).max(500),
    continuityAnchors: z.array(z.string().min(1).max(300)).max(12),
    prompt: z.string().min(1).max(4000),
    avoid: z.string().max(1500),
    altText: z.string().min(1).max(500),
    trigger: z.enum(['scene_enter', 'before_block', 'after_block', 'choices_visible', 'scene_exit']),
    action: z.enum(['show', 'swap', 'fade_in', 'crossfade']),
    fadeMs: z.number().int().min(0).max(10000),
  }).strict(),
}).strict();

export const imageAdoptRequestSchema = z.object({
  directory: z.string().min(1),
  runId: runIdSchema,
  assetId: assetIdSchema,
}).strict();

export function composeImagePrompt(art: ArtProposal): string {
  const preset = visualBible.presets[art.assetType];
  return [
    imageInstructions,
    `비주얼 바이블: ${visualBible.title} (${visualBible.id})`,
    `사용 목적: ${art.purpose}`,
    `에셋 유형: ${art.assetType}`,
    `주체와 장면: ${art.subject}`,
    `장면 추가 지시: ${art.prompt}`,
    `구도: ${art.composition}. ${preset.composition}`,
    `빛과 분위기: ${art.lighting}`,
    `색상: ${art.palette}. 프로젝트 팔레트: ${visualBible.palette.join(', ')}`,
    `스타일과 재질: ${visualBible.style} ${visualBible.texture}`,
    `카메라와 UI 여백: ${visualBible.camera}`,
    `연속성 고정 요소: ${[...visualBible.worldAnchors, ...art.continuityAnchors].join('; ')}`,
    `반드시 지킬 조건: ${preset.constraints}; ${visualBible.globalConstraints.join('; ')}`,
    `피할 요소: ${art.avoid}`,
  ].join('\n');
}

function imageProvider(): string {
  return process.env.STORY_IMAGE_PROVIDER ?? process.env.STORY_AI_PROVIDER ?? (resolveOpenAiApiKey() ? 'openai' : 'disabled');
}

export function imageCapabilities(): Record<string, unknown> {
  const provider = imageProvider();
  return {
    available: provider === 'openai' ? Boolean(resolveOpenAiApiKey()) : provider === 'mock',
    provider,
    model: process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2',
    visualBible: visualBible.id,
    renditions: {
      draft: { quality: 'low', purpose: '구도·실루엣을 빠르게 검토하는 시안' },
      final: { quality: 'high', purpose: '채택 전 세부 묘사를 확인하는 확정 후보' },
    },
  };
}

function auditPath(runId: string): string { return `${imageRunDirectory}/${runId}.json`; }
function writeRun(run: ImageRun): void {
  mkdirSync(imageRunDirectory, { recursive: true });
  writeFileSync(auditPath(run.runId), `${JSON.stringify(run, null, 2)}\n`);
}
function readRun(runId: string): ImageRun {
  runIdSchema.parse(runId);
  const path = auditPath(runId);
  if (!existsSync(path)) throw new Error('Unknown image run');
  return JSON.parse(readFileSync(path, 'utf8')) as ImageRun;
}

export async function generateStoryImage(input: z.infer<typeof imageGenerateRequestSchema>): Promise<Record<string, unknown>> {
  const parsed = imageGenerateRequestSchema.parse(input);
  const provider = imageProvider();
  if (provider === 'disabled') throw new Error('Image provider is not configured. Set OPENAI_API_KEY.');
  if (!['mock', 'openai'].includes(provider)) throw new Error(`Unsupported image provider: ${provider}`);
  const runId = randomUUID();
  const quality = parsed.rendition === 'draft' ? 'low' : 'high';
  const size = provider === 'mock' ? 'mock-source' : visualBible.presets[parsed.art.assetType].size;
  const prompt = composeImagePrompt(parsed.art);
  const model = provider === 'mock' ? 'mock' : process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2';
  const extension = provider === 'mock' ? 'jpg' : 'png';
  const mimeType = provider === 'mock' ? 'image/jpeg' : 'image/png';
  mkdirSync(imageRunDirectory, { recursive: true });
  const imagePath = `${imageRunDirectory}/${runId}.${extension}`;

  if (provider === 'mock') {
    copyFileSync('assets/little-post-office-cover.jpg', imagePath);
  } else {
    const apiKey = resolveOpenAiApiKey();
    if (!apiKey) throw new Error('An OpenAI API key is required for image generation');
    const response = await new OpenAI({ apiKey }).images.generate({
      model,
      prompt,
      n: 1,
      quality,
      size,
      output_format: 'png',
      background: 'opaque',
    });
    const encoded = response.data?.[0]?.b64_json;
    if (!encoded) throw new Error('Image provider returned no image data');
    writeFileSync(imagePath, Buffer.from(encoded, 'base64'));
  }

  const contentHash = createHash('sha256').update(readFileSync(imagePath)).digest('hex');
  const run: ImageRun = {
    runId, createdAt: new Date().toISOString(), directory: parsed.directory, sceneId: parsed.sceneId,
    assetId: parsed.art.assetId, assetType: parsed.art.assetType, rendition: parsed.rendition,
    provider, model, quality, size, mimeType, extension, imagePath, prompt, contentHash,
  };
  writeRun(run);
  return {
    runId, previewUrl: `/api/ai/image-preview?runId=${runId}`, provider, model, quality, size,
    prompt, contentHash, assetId: run.assetId, rendition: run.rendition,
  };
}

export function readImagePreview(runId: string): { data: Buffer; mimeType: string } {
  const run = readRun(runId);
  if (!existsSync(run.imagePath)) throw new Error('Generated image file is missing');
  return { data: readFileSync(run.imagePath), mimeType: run.mimeType };
}

export function adoptStoryImage(input: z.infer<typeof imageAdoptRequestSchema>): Record<string, unknown> {
  const parsed = imageAdoptRequestSchema.parse(input);
  const run = readRun(parsed.runId);
  if (run.directory !== parsed.directory || run.assetId !== parsed.assetId) throw new Error('Image run does not match this work or asset');
  const directory = 'assets/generated';
  mkdirSync(directory, { recursive: true });
  const sourcePath = `${directory}/${run.assetId}-${run.runId.slice(0, 8)}.${run.extension}`;
  if (!existsSync(sourcePath)) copyFileSync(run.imagePath, sourcePath);
  const updated = { ...run, adoptedPath: sourcePath };
  writeRun(updated);
  return {
    assetId: run.assetId,
    sourcePath,
    status: 'ready',
    rightsHolder: 'Story Post project',
    license: 'project use under OpenAI terms',
    contentHash: run.contentHash,
    notes: `AI image adopted from ${run.runId}; ${run.provider}/${run.model}; ${run.rendition}/${run.quality}; visual bible ${visualBible.id}`,
  };
}
