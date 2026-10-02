function upsert(rows, key, next) {
  const existing = rows.find(row => row[key] === next[key]);
  if (existing) Object.assign(existing, next);
  else rows.push(next);
}

export function nextId(prefix, rows, key) {
  let index = rows.length + 1;
  for (;;) {
    const suffix = `-${String(index).padStart(2,'0')}`;
    const id = `${prefix.slice(0,64 - suffix.length)}${suffix}`;
    if (!rows.some(row => row[key] === id)) return id;
    index++;
  }
}

export function nextOrdinal(rows, predicate) {
  return String(Math.max(-1, ...rows.filter(predicate).map(row => Number(row.ordinal))) + 1);
}

function assertUnique(values, label) {
  if (new Set(values).size !== values.length) throw new Error(`${label} ID가 중복되었습니다.`);
}

export function matchesContext(expected, current) {
  return !!expected && expected.directory === current.directory && expected.sceneId === current.sceneId && expected.revision === current.revision;
}

export function applyProposal(source, sceneId, proposal, assetPatch = {}) {
  const work = source.story_work[0];
  if (!work || work.status === 'released') throw new Error('배포본에는 제안을 적용할 수 없습니다.');
  const selected = source.scene.find(row => row.scene_id === sceneId);
  if (!selected) throw new Error('선택한 장면이 없습니다.');
  if (proposal.scene && proposal.scene.sceneId !== sceneId) throw new Error('선택 장면과 제안 장면이 다릅니다.');

  const tables = structuredClone(source);
  const keys = { story_id: work.story_id, working_version: work.working_version, locale: work.locale };
  const belongsToScene = row => row.scene_id === sceneId;
  const scene = tables.scene.find(belongsToScene);

  if (proposal.scene) {
    const patch = proposal.scene;
    assertUnique(patch.blocks.map(block => block.blockId), '본문');
    assertUnique(patch.choices.map(choice => choice.choiceId), '선택지');
    for (const [items, rows, idKey, proposalKey] of [
      [patch.blocks, tables.content_block, 'block_id', 'blockId'],
      [patch.choices, tables.choice, 'choice_id', 'choiceId'],
    ]) {
      for (const item of items) {
        const collision = rows.find(row => row[idKey] === item[proposalKey] && !belongsToScene(row));
        if (collision) throw new Error(`다른 장면에서 사용하는 ID입니다: ${item[proposalKey]}`);
      }
    }
    for (const choice of patch.choices) {
      if (!tables.scene.some(row => row.scene_id === choice.nextSceneId)) {
        throw new Error(`없는 다음 장면입니다: ${choice.nextSceneId}`);
      }
    }
    scene.sender = patch.sender;
    scene.notes = patch.notes;
    for (const block of patch.blocks) {
      const existing = tables.content_block.find(row => row.block_id === block.blockId);
      upsert(tables.content_block, 'block_id', {
        ...keys, block_id: block.blockId, scene_id: sceneId,
        ordinal: existing?.ordinal ?? nextOrdinal(tables.content_block, belongsToScene),
        block_type: block.blockType, speaker: block.speaker, text: block.text,
      });
    }
    for (const choice of patch.choices) {
      const existing = tables.choice.find(row => row.choice_id === choice.choiceId);
      upsert(tables.choice, 'choice_id', {
        ...keys, choice_id: choice.choiceId, scene_id: sceneId,
        ordinal: existing?.ordinal ?? nextOrdinal(tables.choice, belongsToScene),
        text: choice.text, next_scene_id: choice.nextSceneId,
      });
    }
  }

  for (const [kind, direction] of [['art', proposal.art], ['sound', proposal.sound]]) {
    if (!direction) continue;
    const isArt = kind === 'art';
    const channel = isArt ? direction.assetType : direction.channel;
    const cueId = direction.assetId.length <= 60 ? `${direction.assetId}-cue` : direction.assetId;
    const existingCue = tables.cue.find(row => row.cue_id === cueId);
    if (existingCue && !belongsToScene(existingCue)) throw new Error('이 연출 ID는 다른 장면에서 사용 중입니다.');
    if (['before_block', 'after_block', 'choice_selected'].includes(direction.trigger)) {
      throw new Error('본문·선택지 대상이 필요한 연출은 연출 편집기에서 연결하세요.');
    }
    if ((channel === 'overlay' && ['swap', 'crossfade'].includes(direction.action)) ||
        (['sfx', 'voice'].includes(channel) && direction.action === 'crossfade')) {
      throw new Error('선택한 채널에서 지원하지 않는 연출입니다.');
    }
    const needsAsset = direction.action !== 'stop';
    if (needsAsset) {
      const existingAsset = tables.asset.find(row => row.asset_id === direction.assetId);
      if (existingAsset && existingAsset.asset_type !== channel) throw new Error('같은 ID의 에셋 유형이 다릅니다.');
      const isReady = ['ready', 'approved'].includes(existingAsset?.status);
      if (!isReady || Object.keys(assetPatch).length > 0) {
        upsert(tables.asset, 'asset_id', {
          asset_id: direction.assetId, asset_type: channel,
          source_path: `assets/generated/${direction.assetId}.${isArt ? 'png' : 'mp3'}`,
          status: 'planned', rights_holder: '', license: '', content_hash: '',
          alt_text: isArt ? direction.altText : direction.editorialNote, duration_ms: '',
          notes: `prompt: ${direction.prompt}${isArt ? `\navoid: ${direction.avoid}` : ''}`,
          ...(isArt ? assetPatch : {}),
        });
      }
    }
    upsert(tables.cue, 'cue_id', {
      ...keys, cue_id: cueId, scene_id: sceneId, block_id: '', choice_id: '',
      trigger: direction.trigger, channel, action: direction.action,
      asset_id: needsAsset ? direction.assetId : '',
      ordinal: existingCue?.ordinal ?? nextOrdinal(tables.cue, row => belongsToScene(row) && row.trigger === direction.trigger),
      fade_ms: String(direction.fadeMs), volume: isArt ? '' : String(direction.volume),
      loop: !isArt && direction.loop ? '1' : '0', duration_ms: '',
    });
  }
  return tables;
}
