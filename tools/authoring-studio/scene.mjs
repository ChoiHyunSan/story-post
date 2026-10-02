import { nextOrdinal } from './proposal.mjs';

function requireText(value, label, maximum) {
  if (typeof value !== 'string' || !value.replace(/[\s\p{Cc}\p{Cf}]+/gu, '').length || value.length > maximum) throw new Error(`${label}을(를) 1~${maximum}자로 입력하세요.`);
}

export function createSceneBranch(source, request) {
  const work = source.story_work[0];
  if (!work || work.status === 'released') throw new Error('배포본에는 장면을 추가할 수 없습니다.');
  const origin = source.scene.find(scene => scene.scene_id === request.sourceSceneId);
  if (origin?.scene_type !== 'letter') throw new Error('선택지를 추가할 기존 편지 장면을 고르세요.');
  if (typeof request.sceneId !== 'string' || !/^[a-z][a-z0-9-]{0,49}$/.test(request.sceneId)) throw new Error('장면 ID는 영문 소문자로 시작하는 소문자·숫자·하이픈 50자 이하로 입력하세요.');
  if (!['letter','ending'].includes(request.sceneType)) throw new Error('편지 또는 결말을 선택하세요.');
  if (source.scene.some(scene => scene.scene_id === request.sceneId)) throw new Error('이미 사용 중인 장면 ID입니다.');
  if (source.scene.length >= 200) throw new Error('한 작품에는 최대 200개 장면을 만들 수 있습니다.');
  const originChoices = source.choice.filter(choice => choice.scene_id === origin.scene_id);
  if (originChoices.length >= 8) throw new Error('한 편지에는 최대 8개 선택지를 만들 수 있습니다.');
  requireText(request.body, '장면 본문', 20000);
  requireText(request.entryText, '새 장면으로 가는 선택 문장', 300);
  const textKey = value => value.normalize('NFKC').replace(/[\s\p{Cc}\p{Cf}]+/gu, ' ').trim();
  if (originChoices.some(choice => textKey(choice.text) === textKey(request.entryText))) throw new Error('같은 장면의 선택 문장이 중복됩니다.');
  if (request.sceneType === 'letter') {
    requireText(request.sender, '보낸 이', 100);
    requireText(request.continueText, '다음 장면으로 가는 선택 문장', 300);
    if (!source.scene.some(scene => scene.scene_id === request.nextSceneId)) throw new Error('새 편지 다음에 이어질 장면을 고르세요.');
  } else {
    if (typeof request.endingId !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(request.endingId)) throw new Error('결말 ID는 영문 소문자로 시작하는 소문자·숫자·하이픈 64자 이하로 입력하세요.');
    if (source.scene.some(scene => scene.ending_id === request.endingId)) throw new Error('이미 사용 중인 결말 ID입니다.');
  }
  const blockId = `${request.sceneId}-body`;
  const entryId = `${request.sceneId}-entry`;
  const continueId = `${request.sceneId}-continue`;
  if (source.content_block.some(block => block.block_id === blockId) || source.choice.some(choice => [entryId,continueId].includes(choice.choice_id))) throw new Error('새 장면에서 만들 ID가 기존 본문 또는 선택지와 겹칩니다. 다른 장면 ID를 사용하세요.');

  const tables = structuredClone(source);
  const keys = { story_id: work.story_id, working_version: work.working_version, locale: work.locale };
  tables.scene.push({ ...keys, scene_id: request.sceneId, ordinal: nextOrdinal(tables.scene, () => true),
    scene_type: request.sceneType, sender: request.sceneType === 'letter' ? request.sender : '',
    ending_id: request.sceneType === 'ending' ? request.endingId : '', production_status: 'draft', notes: '' });
  tables.content_block.push({ ...keys, block_id: blockId, scene_id: request.sceneId, ordinal: '0', block_type: 'narration', speaker: '', text: request.body });
  tables.choice.push({ ...keys, choice_id: entryId, scene_id: origin.scene_id,
    ordinal: nextOrdinal(originChoices, () => true), text: request.entryText, next_scene_id: request.sceneId });
  if (request.sceneType === 'letter') tables.choice.push({ ...keys, choice_id: continueId, scene_id: request.sceneId,
    ordinal: '0', text: request.continueText, next_scene_id: request.nextSceneId });
  return tables;
}

export function searchScenes(tables, query) {
  const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/gu,' ').trim();
  const needle = normalize(query);
  const scenes = [...tables.scene].sort((a,b) => Number(a.ordinal) - Number(b.ordinal));
  if (!needle) return scenes;
  const blocks = new Map();
  for (const block of tables.content_block) {
    blocks.set(block.scene_id, `${blocks.get(block.scene_id) || ''} ${block.speaker} ${block.text}`);
  }
  return scenes.filter(scene => normalize([scene.scene_id,scene.sender,scene.ending_id,scene.notes,blocks.get(scene.scene_id)].join(' ')).includes(needle));
}
