import { choiceRules, replaceChoiceRules } from './choice-rules.mjs';

export function createChoiceRulesEditor({ state, dialog, validate, apply, onApplied, onError }) {
  const form = dialog.querySelector('form');
  const error = dialog.querySelector('[data-rules-error]');
  const escape = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  let context = null;
  let sequence = 0;
  let busy = false;

  function setBusy(value) {
    busy = value;
    for (const control of form.querySelectorAll('input, select, button')) {
      if (!control.hasAttribute('data-rules-cancel')) control.disabled = value;
    }
    form.querySelector('[type="submit"]').textContent = value ? '검사하는 중…' : '검사하고 적용';
  }

  function readGroup(group) {
    return [...form.querySelectorAll(`[data-rule-group="${group}"] [data-rule]`)].map(row => ({
      flagId: row.querySelector('[data-rule-flag]').value,
      value: row.querySelector('[data-rule-value]').value === 'true',
    }));
  }

  function renderGroup(group, rules) {
    const flags = context.current.tables.flag_definition;
    const container = form.querySelector(`[data-rule-group="${group}"]`);
    container.innerHTML = rules.length ? rules.map((rule, index) => {
      const options = flags.map(flag => [String(flag.flag_id), flag.description || flag.flag_id]);
      if (!options.some(([id]) => id === rule.flagId)) options.unshift([rule.flagId, `등록되지 않은 상태: ${rule.flagId}`]);
      const label = group === 'conditions' ? '노출 조건' : '선택 효과';
      return `<div class="choice-rule-row" data-rule>
        <label>${label} ${index + 1} 상태<select data-rule-flag>${options.map(([id, title]) => `<option value="${escape(id)}" ${id === rule.flagId ? 'selected' : ''}>${escape(title)} · ${escape(id)}</option>`).join('')}</select></label>
        <label>${label} ${index + 1} 값<select data-rule-value><option value="true" ${rule.value ? 'selected' : ''}>예</option><option value="false" ${rule.value ? '' : 'selected'}>아니요</option></select></label>
        <button class="button ghost small danger" type="button" data-rule-delete="${index}" aria-label="${label} ${index + 1} 삭제">삭제</button>
      </div>`;
    }).join('') : '<p class="work-description">등록된 규칙이 없습니다.</p>';
    for (const button of container.querySelectorAll('[data-rule-delete]')) button.onclick = () => {
      const current = readGroup(group);
      current.splice(Number(button.dataset.ruleDelete), 1);
      renderGroup(group, current);
    };
  }

  for (const button of form.querySelectorAll('[data-rule-add]')) button.onclick = () => {
    if (busy || !context) return;
    const group = button.dataset.ruleAdd;
    const current = readGroup(group);
    const flag = context.current.tables.flag_definition.find(item => !current.some(rule => rule.flagId === item.flag_id));
    if (!flag) { error.textContent = '추가할 상태가 없습니다. 상태 정의는 전체 테이블에서 관리하세요.'; return; }
    renderGroup(group, [...current, { flagId: flag.flag_id, value: true }]);
  };
  form.querySelector('[data-rules-cancel]').onclick = () => dialog.close();
  dialog.addEventListener('close', () => { sequence++; context = null; });
  form.onsubmit = async event => {
    event.preventDefault();
    if (busy || !context) return;
    const request = ++sequence;
    const captured = context;
    const isCurrent = () => context === captured && request === sequence && state.current === captured.current &&
      state.revision === captured.revision && state.loadSequence === captured.loadSequence &&
      !state.isLoading && !state.isSaving && !state.isRestoring;
    error.textContent = '';
    try {
      const next = replaceChoiceRules(captured.current.tables, captured.choiceId, {
        conditions: readGroup('conditions'), effects: readGroup('effects'),
      });
      setBusy(true);
      const preview = await validate(captured.current.entry.directory, next);
      if (!isCurrent()) {
        if (context === captured) error.textContent = '검사 중 원고가 바뀌었습니다. 닫고 다시 열어 주세요.';
        return;
      }
      apply(next, preview);
      dialog.close();
      onApplied(captured.choiceId);
    } catch (cause) {
      if (isCurrent()) error.textContent = cause.message;
    } finally {
      if (request === sequence || !context) setBusy(false);
    }
  };

  return {
    open(choiceId) {
      if (state.isSaving || state.isLoading || state.isRestoring || state.current?.tables.story_work[0]?.status === 'released') return;
      try {
        const rules = choiceRules(state.current.tables, choiceId);
        context = { current: state.current, revision: state.revision, loadSequence: state.loadSequence, choiceId };
        sequence++;
        setBusy(false);
        error.textContent = '';
        dialog.querySelector('[data-rules-choice]').textContent = state.current.tables.choice.find(choice => choice.choice_id === choiceId).text;
        renderGroup('conditions', rules.conditions);
        renderGroup('effects', rules.effects);
        dialog.showModal();
      } catch (cause) { onError(cause.message); }
    },
  };
}
