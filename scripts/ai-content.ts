import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import type { AuthoringTable } from './authoring-contract';
import { resolveOpenAiApiKey } from './ai-credentials';

export const aiTaskSchema = z.enum([
  'rewrite_scene',
  'expand_choices',
  'art_direction',
  'sound_direction',
  'continuity_review',
]);
export type AiTask = z.infer<typeof aiTaskSchema>;

const id = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const contentBlockProposal = z.object({
  blockId: id,
  blockType: z.enum(['narration', 'dialogue', 'letter_quote', 'caption', 'divider']),
  speaker: z.string(),
  text: z.string().min(1).max(5000),
}).strict();
const choiceProposal = z.object({
  choiceId: id,
  text: z.string().min(1).max(240),
  nextSceneId: id,
  editorialNote: z.string().max(500),
}).strict();
const sceneProposal = z.object({
  sceneId: id,
  sender: z.string().max(160),
  notes: z.string().max(1000),
  blocks: z.array(contentBlockProposal).max(12),
  choices: z.array(choiceProposal).max(6),
}).strict();
const artProposal = z.object({
  assetId: id,
  assetType: z.enum(['background', 'portrait', 'overlay']),
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
}).strict();
const soundProposal = z.object({
  assetId: id,
  channel: z.enum(['bgm', 'sfx', 'voice']),
  prompt: z.string().min(1).max(3000),
  trigger: z.enum(['scene_enter', 'before_block', 'after_block', 'choices_visible', 'choice_selected', 'scene_exit']),
  action: z.enum(['play', 'stop', 'crossfade']),
  fadeMs: z.number().int().min(0).max(10000),
  volume: z.number().min(0).max(1),
  loop: z.boolean(),
  editorialNote: z.string().max(500),
}).strict();
const reviewFinding = z.object({
  severity: z.enum(['info', 'warning', 'error']),
  category: z.enum(['continuity', 'character_voice', 'pacing', 'choice_design', 'asset_direction', 'safety']),
  sceneId: z.string(),
  message: z.string().min(1).max(1000),
  suggestedFix: z.string().max(1000),
}).strict();
const craftCheck = z.object({
  criterion: z.enum(['scene_entry', 'character_voice', 'sensory_grounding', 'choice_distinction', 'continuity']),
  status: z.enum(['pass', 'revise', 'not_applicable']),
  observation: z.string().max(600),
}).strict();

export const aiProposalSchema = z.object({
  title: z.string().min(1).max(160),
  summary: z.string().min(1).max(1000),
  scene: sceneProposal.nullable(),
  art: artProposal.nullable(),
  sound: soundProposal.nullable(),
  review: z.array(reviewFinding).max(20),
  craftChecks: z.array(craftCheck).length(5),
  warnings: z.array(z.string().max(800)).max(10),
}).strict();
export type AiProposal = z.infer<typeof aiProposalSchema>;

export type AiTableRows = Record<AuthoringTable, Record<string, string | number | null>[]>;
export type AiGenerationInput = {
  task: AiTask;
  brief: string;
  sceneId: string;
  tables: AiTableRows;
};
type AiGenerationResult = {
  proposal: AiProposal;
  meta: { runId: string; provider: string; model: string; promptProfile: string; responseId: string | null };
};

const registry = z.object({
  activeProfile: z.string(),
  profiles: z.array(z.object({ id: z.string(), path: z.string() }).passthrough()),
}).parse(JSON.parse(readFileSync('content/ai/prompt-registry.json', 'utf8')) as unknown);
const activeProfile = registry.profiles.find(profile => profile.id === registry.activeProfile);
if (!activeProfile) throw new Error(`Unknown active AI prompt profile: ${registry.activeProfile}`);
export const promptProfileId = activeProfile.id;
export const storyCraftInstructions = readFileSync(activeProfile.path, 'utf8');

function compactContext(input: AiGenerationInput): Record<string, unknown> {
  const work = input.tables.story_work[0];
  const scenes = [...input.tables.scene].sort((left, right) => Number(left.ordinal) - Number(right.ordinal));
  const selectedIndex = scenes.findIndex(scene => scene.scene_id === input.sceneId);
  if (selectedIndex < 0) throw new Error(`Unknown selected scene: ${input.sceneId}`);
  const contextSceneIds = input.task === 'continuity_review'
    ? new Set(scenes.map(scene => String(scene.scene_id)))
    : new Set(scenes.slice(Math.max(0, selectedIndex - 1), selectedIndex + 2).map(scene => String(scene.scene_id)));
  const contextScenes = scenes.filter(scene => contextSceneIds.has(String(scene.scene_id))).map(scene => ({
    ...scene,
    blocks: input.tables.content_block.filter(block => block.scene_id === scene.scene_id),
    choices: input.tables.choice.filter(choice => choice.scene_id === scene.scene_id).map(choice => ({
      ...choice,
      conditions: input.tables.choice_condition.filter(condition => condition.choice_id === choice.choice_id),
      effects: input.tables.choice_effect.filter(effect => effect.choice_id === choice.choice_id),
    })),
    cues: input.tables.cue.filter(cue => cue.scene_id === scene.scene_id),
  }));
  return {
    work: {
      storyId: work?.story_id,
      title: work?.title,
      description: work?.description,
      startSceneId: work?.start_scene_id,
    },
    selectedSceneId: input.sceneId,
    availableSceneIds: scenes.map(scene => scene.scene_id),
    flags: input.tables.flag_definition,
    assets: input.tables.asset,
    scenes: contextScenes,
  };
}

export function buildAiInput(input: AiGenerationInput): string {
  const brief = input.brief.trim().slice(0, 4000);
  const context = JSON.stringify(compactContext(input), null, 2).slice(0, 60_000);
  return [
    `<task>${input.task}</task>`,
    `<author_request>${brief || '기존 원고의 품질을 높이는 보수적인 제안을 만든다.'}</author_request>`,
    `<story_context>${context}</story_context>`,
    '주어진 작업에 맞는 제안 하나를 구조화된 형식으로 작성한다.',
  ].join('\n\n');
}

function mockProposal(input: AiGenerationInput): AiProposal {
  const scene = input.tables.scene.find(row => row.scene_id === input.sceneId);
  const blocks = input.tables.content_block.filter(row => row.scene_id === input.sceneId);
  const choices = input.tables.choice.filter(row => row.scene_id === input.sceneId);
  return aiProposalSchema.parse({
    title: '로컬 테스트 제안',
    summary: 'API 키 없이 제작실의 AI 제안·검토·적용 흐름을 확인하는 결정적 테스트 결과입니다.',
    scene: ['rewrite_scene', 'expand_choices'].includes(input.task) ? {
      sceneId: input.sceneId,
      sender: String(scene?.sender ?? ''),
      notes: String(scene?.notes ?? ''),
      blocks: blocks.map(block => ({
        blockId: String(block.block_id),
        blockType: ['narration', 'dialogue', 'letter_quote', 'caption', 'divider'].includes(String(block.block_type))
          ? String(block.block_type) : 'narration',
        speaker: String(block.speaker ?? ''),
        text: String(block.text),
      })),
      choices: choices.map(choice => ({
        choiceId: String(choice.choice_id),
        text: String(choice.text),
        nextSceneId: String(choice.next_scene_id),
        editorialNote: '기존 분기 ID와 의미를 보존했습니다.',
      })),
    } : null,
    art: input.task === 'art_direction' ? {
      assetId: `${input.sceneId}-ai-background`, assetType: 'background',
      purpose: '선택 장면의 정서와 장소를 전달하는 모바일 게임 배경',
      subject: '밤의 작은 우체국 내부, 창밖으로 멀리 보이는 등대와 젖은 부두',
      composition: '가로형 와이드 숏, 편지 UI가 놓일 중앙 하단은 단순하게 비우고 시선은 창가로 유도',
      lighting: '낡은 전구의 따뜻한 빛과 창밖 청색 달빛이 약하게 교차하는 저조도',
      palette: '먹색, 짙은 남색, 빛바랜 종이색, 절제된 녹슨 주황',
      continuityAnchors: ['아날로그 해안 우체국', '젖은 목재와 종이 질감', '현대 전자기기 없음'],
      prompt: '밤의 작은 우체국, 절제된 시네마틱 구도, 이야기의 고요한 불안을 담은 배경',
      avoid: '읽을 수 있는 문자, 로고, 과도한 채도', altText: '밤의 작은 우체국 내부와 창가의 희미한 등대 불빛',
      trigger: 'scene_enter', action: 'crossfade', fadeMs: 800,
    } : null,
    sound: input.task === 'sound_direction' ? {
      assetId: `${input.sceneId}-ai-ambience`, channel: 'bgm',
      prompt: '낮은 파도와 오래된 우체국의 정적을 섞은 미니멀 앰비언트, 대사를 방해하지 않음',
      trigger: 'scene_enter', action: 'play', fadeMs: 1200, volume: 0.35, loop: true,
      editorialNote: '장면의 여백을 유지하는 낮은 강도로 시작합니다.',
    } : null,
    review: input.task === 'continuity_review' ? [{
      severity: 'info', category: 'continuity', sceneId: input.sceneId,
      message: '로컬 테스트 제공자는 실제 서사 판단을 수행하지 않습니다.', suggestedFix: 'OpenAI API 키를 설정해 실제 검수를 실행합니다.',
    }] : [],
    craftChecks: [
      ['scene_entry', 'not_applicable'], ['character_voice', 'not_applicable'], ['sensory_grounding', 'not_applicable'],
      ['choice_distinction', 'not_applicable'], ['continuity', 'not_applicable'],
    ].map(([criterion, status]) => ({ criterion, status, observation: 'mock provider 결과' })),
    warnings: ['이 결과는 API 연결을 검증하는 mock provider가 생성했습니다.'],
  });
}

function refusalText(output: unknown): string | undefined {
  if (!Array.isArray(output)) return undefined;
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part && typeof part === 'object' && 'refusal' in part && typeof part.refusal === 'string') return part.refusal;
    }
  }
  return undefined;
}

function writeAudit(input: AiGenerationInput, result: AiGenerationResult): void {
  const directory = '.authoring/ai-runs';
  mkdirSync(directory, { recursive: true });
  writeFileSync(`${directory}/${result.meta.runId}.json`, `${JSON.stringify({
    createdAt: new Date().toISOString(), task: input.task, sceneId: input.sceneId,
    brief: input.brief, ...result,
  }, null, 2)}\n`);
}

export function aiCapabilities(): Record<string, unknown> {
  const apiKey = resolveOpenAiApiKey();
  const configuredProvider = process.env.STORY_AI_PROVIDER;
  const provider = configuredProvider ?? (apiKey ? 'openai' : 'disabled');
  return {
    available: provider === 'openai' ? Boolean(apiKey) : provider === 'mock',
    provider,
    model: process.env.OPENAI_STORY_MODEL ?? 'gpt-6-astra',
    promptProfile: promptProfileId,
    tasks: aiTaskSchema.options,
    setupHint: provider === 'disabled' ? 'OPENAI_API_KEY를 설정한 뒤 제작실을 다시 시작하세요.' : null,
  };
}

export async function generateAiProposal(input: AiGenerationInput): Promise<AiGenerationResult> {
  aiTaskSchema.parse(input.task);
  if (input.brief.length > 4000) throw new Error('AI 요청은 4,000자 이하여야 합니다');
  compactContext(input);
  const provider = String(aiCapabilities().provider);
  const runId = randomUUID();
  const model = process.env.OPENAI_STORY_MODEL ?? 'gpt-6-astra';
  if (provider === 'disabled') throw new Error('AI provider is not configured. Set OPENAI_API_KEY.');
  if (provider === 'mock') {
    const result = { proposal: mockProposal(input), meta: { runId, provider, model: 'mock', promptProfile: promptProfileId, responseId: null } };
    writeAudit(input, result);
    return result;
  }
  if (provider !== 'openai') throw new Error(`Unsupported AI provider: ${provider}`);
  const apiKey = resolveOpenAiApiKey();
  if (!apiKey) throw new Error('An OpenAI API key is required for the OpenAI provider');

  const client = new OpenAI({ apiKey });
  const response = await client.responses.parse({
    model,
    store: false,
    instructions: storyCraftInstructions,
    input: buildAiInput(input),
    text: { format: zodTextFormat(aiProposalSchema, 'story_content_proposal') },
  });
  if (!response.output_parsed) {
    throw new Error(refusalText(response.output) ?? `AI response was not parseable (${response.status})`);
  }
  const result = {
    proposal: aiProposalSchema.parse(response.output_parsed),
    meta: { runId, provider, model, promptProfile: promptProfileId, responseId: response.id },
  };
  writeAudit(input, result);
  return result;
}
