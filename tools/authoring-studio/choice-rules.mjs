function assertEditable(tables, choiceId) {
  if (tables.story_work[0]?.status === 'released') throw new Error('배포본의 선택 규칙은 수정할 수 없습니다.');
  if (!tables.choice.some(choice => choice.choice_id === choiceId)) throw new Error('선택지를 찾을 수 없습니다.');
}

function booleanValue(value) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw new Error('선택 규칙의 상태 값은 예 또는 아니요여야 합니다.');
}

export function choiceRules(tables, choiceId) {
  if (!tables.choice.some(choice => choice.choice_id === choiceId)) throw new Error('선택지를 찾을 수 없습니다.');
  const rows = table => [...tables[table]].filter(row => row.choice_id === choiceId)
    .sort((a, b) => Number(a.ordinal) - Number(b.ordinal));
  const conditions = rows('choice_condition').map(row => {
    if (row.operator !== 'equals') throw new Error('지원하지 않는 선택 조건입니다. 전체 테이블을 확인하세요.');
    return { flagId: row.flag_id, value: booleanValue(row.expected_value) };
  });
  const effects = rows('choice_effect').map(row => {
    if (row.operation !== 'set') throw new Error('지원하지 않는 선택 효과입니다. 전체 테이블을 확인하세요.');
    return { flagId: row.flag_id, value: booleanValue(row.value) };
  });
  return { conditions, effects };
}

export function replaceChoiceRules(tables, choiceId, rules) {
  assertEditable(tables, choiceId);
  const definitions = new Map(tables.flag_definition.map(row => [row.flag_id, row]));
  for (const group of [rules.conditions, rules.effects]) {
    if (!Array.isArray(group) || group.length > 12) throw new Error('조건과 효과는 각각 12개까지 설정할 수 있습니다.');
    const used = new Set();
    for (const rule of group) {
      const definition = definitions.get(rule.flagId);
      if (!definition || definition.value_type !== 'boolean') throw new Error(`등록된 예/아니요 상태를 선택하세요: ${rule.flagId}`);
      if (typeof rule.value !== 'boolean') throw new Error('상태 값은 예 또는 아니요여야 합니다.');
      if (used.has(rule.flagId)) throw new Error(`같은 상태를 두 번 설정할 수 없습니다: ${rule.flagId}`);
      used.add(rule.flagId);
    }
  }
  const next = structuredClone(tables);
  const work = tables.story_work[0];
  const base = { story_id: work.story_id, working_version: work.working_version, locale: work.locale, choice_id: choiceId };
  next.choice_condition = next.choice_condition.filter(row => row.choice_id !== choiceId).concat(
    rules.conditions.map((rule, index) => ({ ...base, ordinal: String(index), flag_id: rule.flagId, operator: 'equals', expected_value: String(rule.value) })),
  );
  next.choice_effect = next.choice_effect.filter(row => row.choice_id !== choiceId).concat(
    rules.effects.map((rule, index) => ({ ...base, ordinal: String(index), flag_id: rule.flagId, operation: 'set', value: String(rule.value) })),
  );
  return next;
}
