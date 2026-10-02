import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import { aiTaskSchema, storyCraftInstructions } from './ai-content';
import { composeImagePrompt } from './ai-image';

const registrySchema = z.object({
  activeProfile: z.string(),
  profiles: z.array(z.object({
    id: z.string(), path: z.string(), locale: z.literal('ko'), purpose: z.string(),
    sources: z.array(z.object({ name: z.string(), url: z.string().url() })).min(1),
  }).strict()).min(1),
}).strict();
const evaluationSchema = z.array(z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]+$/),
  task: aiTaskSchema,
  brief: z.string().min(1),
  sceneId: z.string().min(1),
  expect: z.array(z.string()).min(3),
}).strict()).min(5);

const registry = registrySchema.parse(JSON.parse(readFileSync('content/ai/prompt-registry.json', 'utf8')) as unknown);
const profile = registry.profiles.find(item => item.id === registry.activeProfile);
if (!profile || !existsSync(profile.path)) throw new Error(`Missing active prompt profile: ${registry.activeProfile}`);
const evaluations = evaluationSchema.parse(JSON.parse(readFileSync('content/ai/evals/story-craft-v1.json', 'utf8')) as unknown);
const coveredTasks = new Set(evaluations.map(item => item.task));
for (const task of aiTaskSchema.options) {
  if (!coveredTasks.has(task)) throw new Error(`AI eval coverage missing task: ${task}`);
}
for (const required of ['# 입력 경계', '# 서사 제작 원칙', '# ID와 구조 규칙', '# 자체 검수']) {
  if (!storyCraftInstructions.includes(required)) throw new Error(`Prompt profile lacks section: ${required}`);
}
const imageInstructions = readFileSync('content/ai/prompts/image-direction-v1.md', 'utf8');
for (const required of ['# 역할', '# 프롬프트 작성 순서', '# 에셋별 기준', '# 텍스트와 권리 기준', '# 반복 제작']) {
  if (!imageInstructions.includes(required)) throw new Error(`Image prompt profile lacks section: ${required}`);
}
const imagePrompt = composeImagePrompt({
  assetId: 'prompt-check-background', assetType: 'background', purpose: '장면 배경', subject: '밤의 우체국',
  composition: '가로형 와이드 숏', lighting: '낮은 전구와 달빛', palette: '남색과 종이색',
  continuityAnchors: ['붉은 우편 가방'], prompt: '고요한 불안을 표현한다', avoid: '문자와 로고',
  altText: '밤의 우체국', trigger: 'scene_enter', action: 'crossfade', fadeMs: 800,
});
for (const required of ['사용 목적:', '구도:', '연속성 고정 요소:', '읽을 수 있는 글자', '붉은 우편 가방']) {
  if (!imagePrompt.includes(required)) throw new Error(`Composed image prompt lacks: ${required}`);
}
console.log(`Verified AI prompt ${profile.id}: ${evaluations.length} eval case(s), ${coveredTasks.size} task(s)`);
