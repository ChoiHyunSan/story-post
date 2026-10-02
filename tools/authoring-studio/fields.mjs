export const fieldLabels = {
  sender: '보낸 이 · 장면 제목', ending_id: '결말 ID', production_status: '원고 상태', notes: '제작 메모',
  speaker: '화자', block_type: '본문 형식', text: '문장', next_scene_id: '다음 장면',
  asset_id: '에셋 ID', asset_type: '에셋 종류', source_path: '파일 위치', status: '제작 상태',
  rights_holder: '권리자 · 출처', license: '이용 권리', content_hash: '파일 SHA-256', alt_text: '이미지 설명',
  duration_ms: '길이 (밀리초)', cue_id: '연출 ID', scene_id: '장면', block_id: '대상 본문', choice_id: '대상 선택지',
  trigger: '실행 시점', channel: '연출 종류', action: '동작', ordinal: '실행 순서', fade_ms: '전환 시간 (밀리초)',
  volume: '음량 (0~1)', loop: '반복 재생',
};
const media = [['background','배경 이미지'],['portrait','인물 이미지'],['overlay','겹침 이미지'],['bgm','배경 음악'],['sfx','효과음'],['voice','음성']];
const statuses = [['draft','초안'],['review','검수 중'],['approved','승인됨'],['released','배포됨']];
const actions = {
  show:'표시', hide:'숨기기', swap:'교체', play:'재생', stop:'정지', fade_in:'서서히 표시', fade_out:'서서히 숨기기', crossfade:'부드럽게 전환',
};
export const channelActions = {
  background:['show','hide','swap','fade_in','fade_out','crossfade'], portrait:['show','hide','swap','fade_in','fade_out','crossfade'], overlay:['show','hide','fade_in','fade_out'],
  bgm:['play','stop','crossfade'], sfx:['play','stop'], voice:['play','stop'],
};
const enums = {
  production_status: statuses,
  block_type: [['narration','내레이션'],['dialogue','대사'],['letter_quote','편지 인용'],['caption','짧은 설명'],['divider','구분선']],
  asset_type: media, channel: media,
  status: [['planned','제작 계획'],['missing','파일 없음'],['ready','검수 가능한 파일'],['approved','승인됨']],
  trigger: [['scene_enter','장면에 들어올 때'],['before_block','본문 표시 전'],['after_block','본문 표시 후'],['choices_visible','선택지가 보일 때'],['choice_selected','선택을 확정할 때'],['scene_exit','장면을 나갈 때']],
  loop: [['0','한 번 재생'],['1','반복 재생']],
};

export function sceneLabel(scene) {
  return `${Number(scene.ordinal) + 1}. ${scene.sender || '결말'} · ${scene.scene_id}`;
}

export function fieldOptions(name, tables, row = {}) {
  if (name === 'next_scene_id' || name === 'scene_id' && row.cue_id) {
    return [['','장면을 선택하세요'], ...[...tables.scene].sort((a,b) => Number(a.ordinal) - Number(b.ordinal)).map(scene => [scene.scene_id, sceneLabel(scene)])];
  }
  if (name === 'asset_id' && row.cue_id) {
    return [['','에셋 없음'], ...tables.asset.filter(asset => asset.asset_type === row.channel).map(asset => [asset.asset_id, asset.alt_text || asset.asset_id])];
  }
  if (name === 'block_id' && row.cue_id) {
    return [['','대상 본문 없음'], ...tables.content_block.filter(block => block.scene_id === row.scene_id).map(block => [block.block_id, `${Number(block.ordinal) + 1}. ${block.text.slice(0,40) || block.block_id}`])];
  }
  if (name === 'choice_id' && row.cue_id) {
    return [['','대상 선택지 없음'], ...tables.choice.filter(choice => choice.scene_id === row.scene_id).map(choice => [choice.choice_id, choice.text || choice.choice_id])];
  }
  if (name === 'action') return (channelActions[row.channel] || []).map(value => [value, actions[value]]);
  return enums[name] || null;
}

export function preserveCurrentOption(options, value) {
  if (!options || options.some(([id]) => id === value)) return options;
  return [[value, `등록되지 않은 값: ${value || '(비어 있음)'}`], ...options];
}


export function assetImagePreview(row) {
  if (!['ready','approved'].includes(row.status) || !['background','portrait','overlay'].includes(row.asset_type)) return null;
  if (!/^assets\/[a-z0-9][a-z0-9/_-]*\.(?:jpe?g|png|webp)$/.test(row.source_path) || !/^[a-f0-9]{64}$/.test(row.content_hash)) return null;
  return { url:`/api/asset-preview?path=${encodeURIComponent(row.source_path)}&hash=${row.content_hash}`,
    altText:row.alt_text || '등록된 장면 이미지' };
}
