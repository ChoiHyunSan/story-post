import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aiProposalSchema, buildAiInput, storyCraftInstructions, type AiTableRows } from '../scripts/ai-content';
import { composeImagePrompt, imageGenerateRequestSchema } from '../scripts/ai-image';
import { aiCredentialStatus, resolveOpenAiApiKey, saveOpenAiApiKey } from '../scripts/ai-credentials';

const emptyTables = (): AiTableRows => ({
  story_work: [{ story_id: 'demo', working_version: '1', locale: 'ko', schema_version: '1', engine_contract_version: '1', title: '데모', description: '설명', start_scene_id: 'opening', status: 'draft' }],
  scene: [
    { story_id: 'demo', working_version: '1', locale: 'ko', scene_id: 'opening', ordinal: '0', scene_type: 'letter', sender: '소라', ending_id: '', production_status: 'draft', notes: '' },
    { story_id: 'demo', working_version: '1', locale: 'ko', scene_id: 'ending', ordinal: '1', scene_type: 'ending', sender: '', ending_id: 'done', production_status: 'draft', notes: '' },
  ],
  content_block: [{ story_id: 'demo', working_version: '1', locale: 'ko', block_id: 'opening-body', scene_id: 'opening', ordinal: '0', block_type: 'narration', speaker: '', text: '문이 열렸다.' }],
  choice: [{ story_id: 'demo', working_version: '1', locale: 'ko', choice_id: 'enter', scene_id: 'opening', ordinal: '0', text: '들어간다', next_scene_id: 'ending' }],
  flag_definition: [], choice_condition: [], choice_effect: [], asset: [], cue: [], release_candidate: [],
});

test('story craft prompt encodes installed craft guidance and untrusted-input boundaries', () => {
  for (const phrase of ['말과 의도 사이의 여백', '화자별 어휘', '감각 단서', '선택지는 말만 다른 같은 행동', '참고 자료']) {
    assert.match(storyCraftInstructions, new RegExp(phrase));
  }
  assert.doesNotMatch(storyCraftInstructions, /내부 추론 과정.*출력한다/);
});

test('AI input clearly separates author request from compact story context', () => {
  const input = buildAiInput({ task: 'rewrite_scene', brief: '긴장을 높여줘', sceneId: 'opening', tables: emptyTables() });
  assert.match(input, /<task>rewrite_scene<\/task>/);
  assert.match(input, /<author_request>긴장을 높여줘<\/author_request>/);
  assert.match(input, /<story_context>/);
  assert.match(input, /"availableSceneIds": \[/);
});

test('structured AI proposal rejects an incomplete craft-check contract', () => {
  const invalid = {
    title: '제안', summary: '요약', scene: null, art: null, sound: null, review: [],
    craftChecks: [], warnings: [],
  };
  assert.equal(aiProposalSchema.safeParse(invalid).success, false);
});

test('image prompt composes purpose, visual continuity, UI space and forbidden text', () => {
  const prompt = composeImagePrompt({
    assetId: 'opening-background', assetType: 'background', purpose: '첫 장면 배경',
    subject: '비가 내리는 밤의 해안 우체국', composition: '창문을 우측 삼분할에 놓고 하단을 비운다',
    lighting: '낡은 전구와 청색 달빛', palette: '남색과 빛바랜 종이색',
    continuityAnchors: ['창가의 녹슨 우편함'], prompt: '고요함 속 작은 불안', avoid: '사람과 자동차',
    altText: '비 오는 밤의 우체국', trigger: 'scene_enter', action: 'crossfade', fadeMs: 800,
  });
  for (const phrase of ['사용 목적: 첫 장면 배경', 'UI가 놓일 여백', '창가의 녹슨 우편함', '읽을 수 있는 글자', '사람과 자동차']) {
    assert.match(prompt, new RegExp(phrase));
  }
});

test('image generation contract rejects unregistered asset identifiers and renditions', () => {
  const invalid = imageGenerateRequestSchema.safeParse({
    directory: 'content/authoring/works/demo-v1', sceneId: 'opening', rendition: 'ultra',
    art: { assetId: '../escape', assetType: 'background' },
  });
  assert.equal(invalid.success, false);
});

test('AI credentials expose only a masked environment key and reject malformed keys', { concurrency: false }, () => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'sk-proj-abcdefghijklmnopqrstuvwxyz123456';
  try {
    assert.equal(resolveOpenAiApiKey(), process.env.OPENAI_API_KEY);
    const status = aiCredentialStatus();
    assert.equal(status.source, 'environment');
    assert.equal(status.maskedKey, 'sk-proj-••••3456');
    assert.equal(JSON.stringify(status).includes(process.env.OPENAI_API_KEY), false);
    assert.throws(() => saveOpenAiApiKey('not-a-key'));
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});
