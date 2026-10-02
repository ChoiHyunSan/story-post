const idFields = { content_block:'block_id', choice:'choice_id', asset:'asset_id', cue:'cue_id' };

export function removeAuthoringRow(source, table, id) {
  if (source.story_work[0]?.status === 'released') throw new Error('배포본은 삭제할 수 없습니다.');
  const key = idFields[table];
  if (!key) throw new Error('이 테이블은 전체 테이블에서 편집하세요.');
  const row = source[table].find(item => item[key] === id);
  if (!row) throw new Error('삭제할 행이 없습니다. 원고를 다시 확인하세요.');
  if (table === 'content_block' && source.content_block.filter(item => item.scene_id === row.scene_id).length === 1) throw new Error('장면의 마지막 본문은 삭제할 수 없습니다. 내용을 수정하세요.');
  if (table === 'choice' && source.choice.filter(item => item.scene_id === row.scene_id).length === 1) throw new Error('편지의 마지막 선택지는 삭제할 수 없습니다. 연결을 수정하세요.');
  if (table === 'asset' && source.cue.some(cue => cue.asset_id === id)) throw new Error('이 에셋을 사용하는 연출이 있습니다. 연결을 변경하거나 연출을 먼저 삭제하세요.');
  const tables = structuredClone(source);
  tables[table] = tables[table].filter(item => item[key] !== id);
  if (table === 'content_block') tables.cue = tables.cue.filter(cue => cue.block_id !== id);
  if (table === 'choice') {
    const affectedFlags = new Set([...tables.choice_condition,...tables.choice_effect].filter(item => item.choice_id === id).map(item => item.flag_id));
    tables.choice_condition = tables.choice_condition.filter(item => item.choice_id !== id);
    tables.choice_effect = tables.choice_effect.filter(item => item.choice_id !== id);
    tables.cue = tables.cue.filter(cue => cue.choice_id !== id);
    const usedFlags = new Set([...tables.choice_condition,...tables.choice_effect].map(item => item.flag_id));
    tables.flag_definition = tables.flag_definition.filter(flag => !affectedFlags.has(flag.flag_id) || usedFlags.has(flag.flag_id));
  }
  const removedCount = Object.keys(tables).reduce((count, name) => count + source[name].length - tables[name].length, 0);
  return { tables, removedCount };
}
