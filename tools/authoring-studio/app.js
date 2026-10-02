import { createConnectionSession, requestConnection } from './connection.mjs';
import { canOpenClone, cloneAndRefresh } from './clone.mjs';
import { createPlaytestSession, exportPlaytest, isPlaytestCurrent, previewDocument } from './playtest.mjs';
import { choiceRules } from './choice-rules.mjs';
import { createChoiceRulesEditor } from './choice-rules-editor.mjs';
import { createReviewSession, exportReview, isReviewCurrent, validateReview } from './review.mjs';
import { applyProposal, matchesContext, nextId, nextOrdinal } from './proposal.mjs';
import { canUndoDocument, createSession, loadDocument, markEdited, rememberUndo, restoreDocument, saveDocument, undoDocument } from './session.mjs';

import { removeAuthoringRow } from './editing.mjs';
import { createSceneBranch, searchScenes } from './scene.mjs';
import { assetImagePreview, fieldLabels, fieldOptions, preserveCurrentOption } from './fields.mjs';
import { createBackup, readBackup, maximumBackupBytes } from './backup.mjs';

const headers = {
  story_work: ['story_id','working_version','locale','schema_version','engine_contract_version','title','description','start_scene_id','status'],
  scene: ['story_id','working_version','locale','scene_id','ordinal','scene_type','sender','ending_id','production_status','notes'],
  content_block: ['story_id','working_version','locale','block_id','scene_id','ordinal','block_type','speaker','text'],
  flag_definition: ['story_id','working_version','locale','flag_id','ordinal','value_type','default_value','description'],
  choice: ['story_id','working_version','locale','choice_id','scene_id','ordinal','text','next_scene_id'],
  choice_condition: ['story_id','working_version','locale','choice_id','ordinal','flag_id','operator','expected_value'],
  choice_effect: ['story_id','working_version','locale','choice_id','ordinal','flag_id','operation','value'],
  asset: ['asset_id','asset_type','source_path','status','rights_holder','license','content_hash','alt_text','duration_ms','notes'],
  cue: ['story_id','working_version','locale','cue_id','scene_id','block_id','choice_id','trigger','channel','action','asset_id','ordinal','fade_ms','volume','loop','duration_ms'],
  release_candidate: ['candidate_id','story_id','working_version','locale','created_at','content_hash','asset_manifest_hash','status'],
};
const labels = { story_work:'작품', scene:'장면', content_block:'본문', flag_definition:'상태값', choice:'선택지', choice_condition:'선택 조건', choice_effect:'선택 효과', asset:'에셋', cue:'연출 cue', release_candidate:'출시 후보' };
const state = { works: [], workRefreshError: '', ...createSession(), review:createReviewSession(), selectedScene: '', sceneQuery: '', undoScene: '', isDeleting: false, isCloning: false, selectedTable: 'flag_definition', tab: 'manuscript', sceneSequence: 0, playtest:createPlaytestSession(), ai: { capabilities: null, connection:createConnectionSession(), proposal: null, meta: null, context: null, busy: false, image: null, imageBusy: false, task: 'rewrite_scene', brief: '' } };
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

async function api(path, options) {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `요청에 실패했습니다 (${response.status})`);
  return data;
}
function toast(message) { const el=$('#toast'); el.textContent=message; el.classList.add('visible'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove('visible'),3000); }
function isReadonly() { return state.current?.tables.story_work[0]?.status === 'released'; }
function markDirty() {
  if (isReadonly()) return;
  markEdited(state);
  renderUndo();
  $('#saveState').textContent = '저장하지 않은 변경';
  $('#saveButton').disabled = state.isSaving || state.isLoading || state.isRestoring;
  renderPlaytest();
  renderReview();
}
function input(name, value, row = {}) {
  const options = preserveCurrentOption(fieldOptions(name, state.current.tables, row), value);
  const disabled = isReadonly() ? 'disabled' : '';
  const field = escapeHtml(name);
  const control = options
    ? `<select data-field="${field}" ${disabled}>${options.map(([id,label]) => `<option value="${escapeHtml(id)}" ${id === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select>`
    : `<input data-field="${field}" value="${escapeHtml(value)}" ${disabled}>`;
  return `<label>${escapeHtml(fieldLabels[name] || name)}${control}</label>`;
}
function textArea(name, value) {
  return `<label>${escapeHtml(fieldLabels[name] || name)}<textarea data-field="${escapeHtml(name)}" ${isReadonly()?'disabled':''}>${escapeHtml(value)}</textarea></label>`;
}

async function refreshWorkList() {
  state.works = await api('/api/works');
  state.workRefreshError = '';
  $('#workCount').textContent = state.works.length;
  renderWorkList();
}

async function loadWorks(selectDirectory) {
  await refreshWorkList();
  const target=selectDirectory || state.current?.entry.directory || state.works[0]?.directory;
  if (target) await loadWork(target);
}
function renderWorkLoadNotice() {
  const failure = state.loadFailure;
  $('#workLoadNotice').hidden = !failure;
  if (!failure) return;
  const work = state.works.find(work => work.directory === failure.directory);
  const title = work ? `${work.title} v${work.version}` : failure.directory;
  $('#workLoadMessage').textContent = `${title} 원고를 열지 못했습니다. 현재 편집 내용은 유지됩니다. ‘원고 다시 열기’로 재시도하세요. ${failure.message}`;
  $('#retryWorkLoad').disabled = state.isLoading || state.isRestoring;
}
function focusWorkCard(directory) {
  const button = document.querySelector(`.work-card[data-directory="${CSS.escape(directory)}"]`);
  button?.focus({preventScroll:true});
  button?.scrollIntoView({block:'center'});
}
function renderWorkList() {
  renderWorkLoadNotice();
  $('#workRefreshNotice').hidden = !state.workRefreshError;
  $('#workRefreshMessage').textContent = state.workRefreshError;
  $('#workList').innerHTML=state.works.map(work=>`<button class="work-card ${state.current?.entry.directory===work.directory?'active':''}" data-directory="${escapeHtml(work.directory)}" aria-pressed="${state.current?.entry.directory === work.directory}"><strong>${escapeHtml(work.title)}</strong><span>v${work.version} · ${escapeHtml(work.status)}</span></button>`).join('');
  document.querySelectorAll('.work-card').forEach(button=>button.addEventListener('click',()=>attemptLoad(button.dataset.directory)));
}
async function confirmAction(title, message, action) {
  const dialog = $('#confirmDialog');
  if (dialog.open) return false;
  $('#confirmTitle').textContent = title;
  $('#confirmMessage').textContent = message;
  $('#confirmProceed').textContent = action;
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true }));
}
async function attemptLoad(directory) {
  if (directory === state.current?.entry.directory) return;
  if (state.dirty && !await confirmAction('다른 원고 열기', '저장하지 않은 변경을 버리고 다른 원고를 열까요?', '변경 버리고 열기')) return;
  return loadWork(directory);
}
async function loadWork(directory) {
  $('#saveState').textContent = '불러오는 중';
  try {
    const loading = loadDocument(state, directory, directory => api(`/api/work?directory=${encodeURIComponent(directory)}`));
    $('#saveButton').disabled = true;
    renderWorkLoadNotice();
    const result = await loading;
    if (result === 'stale') return result;
    if (result === 'edited') {
      toast('불러오는 동안 수정한 내용이 있어 현재 원고를 유지했습니다. 먼저 저장하세요.');
      $('#saveState').textContent = '저장하지 않은 변경';
      return result;
    }
    state.selectedScene = state.current.tables.scene[0]?.scene_id || '';
    state.sceneQuery = '';
    Object.assign(state.review, { ...createReviewSession(), sequence:state.review.sequence + 1 });
    Object.assign(state.playtest, { ...createPlaytestSession(), sequence:state.playtest.sequence + 1 });
    Object.assign(state.ai, { proposal: null, meta: null, context: null, image: null, task: 'rewrite_scene', brief: '' });
    $('#emptyState').hidden = true;
    $('#editor').hidden = false;
    renderAll();
    $('#saveState').textContent = isReadonly() ? '배포본 · 읽기 전용' : '모든 변경 저장됨';
    return result;
  } catch {
    $('#saveState').textContent = state.dirty ? '저장하지 않은 변경' : '불러오기 실패';
    renderWorkLoadNotice();
    $('#retryWorkLoad').focus({preventScroll:true});
    $('#workLoadNotice').scrollIntoView({block:'center'});
    if (!state.current) {
      $('#emptyState h1').textContent = '원고를 열지 못했습니다';
      $('#emptyState p').textContent = '작품 목록의 안내에서 다시 열기를 시도하세요.';
    }
    return 'failed';
  } finally {
    $('#saveButton').disabled = state.isSaving || state.isLoading || state.isRestoring || isReadonly() || !state.dirty;
    renderUndo();
  }
}
function renderAll() {
  const work=state.current.tables.story_work[0];
  $('#workEyebrow').textContent=`${work.story_id} · ${work.locale.toUpperCase()} · VERSION ${work.working_version}`;
  $('#workTitle').textContent=work.title; $('#workDescription').textContent=work.description;
  $('#workStatus').textContent=work.status; $('#readonlyNotice').hidden=!isReadonly();
  $('#saveButton').disabled=state.isSaving || state.isLoading || state.isRestoring || isReadonly() || !state.dirty;
  $('#restoreButton').disabled = isReadonly() || state.isSaving || state.isLoading || state.isRestoring;
  $('#cloneButton').textContent=isReadonly()?'새 버전 만들기':'이 버전 복제';
  const validationNotice = $('#validationNotice');
  const validationError = state.current.preview?.error;
  validationNotice.hidden = !validationError;
  validationNotice.textContent = validationError ? `불러올 때 발견한 원고 오류: ${validationError} 수정 후 현재 원고를 검사하고 저장하세요.` : '';
  renderUndo();
  renderWorkList(); renderManuscript(); renderDirection(); renderAi(); renderTables(); renderReview(); renderPlaytest();
}
function bindFields(container, row, rerender=false) {
  container.querySelectorAll('[data-field]').forEach(control=>control.addEventListener('input',()=>{ row[control.dataset.field]=control.value; markDirty(); if(rerender) renderAll(); }));
}
function baseKeys() { const w=state.current.tables.story_work[0]; return {story_id:w.story_id,working_version:w.working_version,locale:w.locale}; }

function renderBlockCard(row, index) {
  return `<div class="block-card" data-block="${escapeHtml(row.block_id)}">
    <div class="block-meta"><span>본문 ${index + 1}</span>
      <button class="button ghost small danger" data-delete-block="${escapeHtml(row.block_id)}"
        aria-label="본문 ${index + 1} 삭제" ${isReadonly()?'disabled':''}>삭제</button>
    </div>
    <div class="field-grid">${input('speaker',row.speaker)}${input('block_type',row.block_type)}
      <div class="wide">${textArea('text',row.text)}</div>
    </div>
  </div>`;
}

function renderChoiceCard(row) {
  let summary;
  try {
    const rules = choiceRules(state.current.tables,row.choice_id);
    const describe = rule => `${state.current.tables.flag_definition.find(flag => flag.flag_id === rule.flagId)?.description || rule.flagId}: ${rule.value ? '예' : '아니요'}`;
    summary = `노출: ${rules.conditions.map(describe).join(' · ') || '항상 표시'} / 선택 후: ${rules.effects.map(describe).join(' · ') || '상태 유지'}`;
  } catch (error) { summary = error.message; }
  return `<div class="choice-card" data-choice="${escapeHtml(row.choice_id)}">
    <div class="row-actions"><span class="eyebrow">${escapeHtml(row.choice_id)}</span>
      <button class="button ghost small danger" data-delete-choice="${escapeHtml(row.choice_id)}"
        aria-label="선택지 ${escapeHtml(row.text || row.choice_id)} 삭제" ${isReadonly()?'disabled':''}>삭제</button>
    </div>
    <div class="field-grid">${textArea('text',row.text)}${input('next_scene_id',row.next_scene_id)}</div>
    <p class="choice-rules-summary">${escapeHtml(summary)}</p>
    <button class="button ghost small" data-edit-rules="${escapeHtml(row.choice_id)}" aria-label="선택지 ${escapeHtml(row.text || row.choice_id)} 조건과 효과 편집" ${isReadonly()?'disabled':''}>조건 · 효과 편집</button>
  </div>`;
}

function focusScene() {
  const heading = $('.scene-editor h2');
  heading?.focus({ preventScroll:true });
  heading?.scrollIntoView({ block:'start' });
}

function renderSceneButtons() {
  const scenes = searchScenes(state.current.tables, state.sceneQuery);
  $('#sceneSearchCount').textContent = state.sceneQuery.trim() ? `찾은 장면 ${scenes.length}개` : `전체 장면 ${scenes.length}개`;
  $('#sceneButtons').innerHTML = scenes.length ? scenes.map(scene => `<button class="scene-button ${scene.scene_id === state.selectedScene?'active':''}"
    data-scene="${escapeHtml(scene.scene_id)}" aria-pressed="${scene.scene_id === state.selectedScene}">
    <span>${Number(scene.ordinal) + 1} · ${scene.scene_type === 'ending'?'결말':'편지'}</span>
    ${escapeHtml(scene.sender || scene.ending_id)}<small>${escapeHtml(scene.scene_id)}</small>
  </button>`).join('') : '<p class="work-description">찾는 장면이 없습니다. 다른 단어나 ID로 검색하세요.</p>';
  document.querySelectorAll('.scene-button').forEach(button => button.onclick = () => {
    state.selectedScene = button.dataset.scene;
    Object.assign(state.ai, { proposal:null, context:null, image:null });
    renderManuscript(); renderAi(); focusScene();
  });
}

function renderManuscript() {
  const tables = state.current.tables;
  const scenes = [...tables.scene].sort((a,b) => Number(a.ordinal) - Number(b.ordinal));
  const scene = scenes.find(item => item.scene_id === state.selectedScene) || scenes[0];
  if (!scene) { $('#panel-manuscript').innerHTML = '<p>장면이 없습니다.</p>'; return; }
  state.selectedScene = scene.scene_id;
  const inScene = rows => rows.filter(row => row.scene_id === scene.scene_id).sort((a,b) => Number(a.ordinal) - Number(b.ordinal));
  const blocks = inScene(tables.content_block);
  const choices = inScene(tables.choice);
  const disabled = isReadonly() ? 'disabled' : '';
  $('#panel-manuscript').innerHTML = `<div class="manuscript-grid">
    <aside class="scene-list">
      <label>장면 찾기<input id="sceneSearch" type="search" maxlength="200" value="${escapeHtml(state.sceneQuery)}" placeholder="제목 · 본문 · 메모" aria-controls="sceneButtons" aria-describedby="sceneSearchCount"></label>
      <p id="sceneSearchCount" class="scene-search-count" role="status"></p>
      <div id="sceneButtons"></div>
    </aside>
    <article class="scene-editor">
      <div class="section-heading"><div><p class="eyebrow">장면 ${Number(scene.ordinal) + 1}</p>
        <h2 tabindex="-1">${escapeHtml(scene.sender || '결말')}</h2><small class="scene-id">${escapeHtml(scene.scene_id)}</small>
      </div><button id="addScene" class="button secondary small" ${disabled}>장면 추가</button></div>
      <section class="editor-section"><div class="field-grid">
        ${scene.scene_type === 'letter' ? input('sender',scene.sender) : input('ending_id',scene.ending_id)}
        ${input('production_status',scene.production_status)}${textArea('notes',scene.notes)}
      </div></section>
      <section class="editor-section">
        <div class="section-heading"><h3>본문</h3><button class="button small" id="addBlock" ${disabled}>+ 본문 추가</button></div>
        <div id="blockList">${blocks.map(renderBlockCard).join('')}</div>
      </section>
      <section class="editor-section">
        <div class="section-heading"><h3>선택지</h3><button class="button small" id="addChoice" ${disabled || (scene.scene_type === 'ending' ? 'disabled' : '')}>+ 선택지 추가</button></div>
        <div id="choiceList">${choices.map(renderChoiceCard).join('') || '<p class="work-description">이 장면에는 선택지가 없습니다. 결말 장면이라면 정상입니다.</p>'}</div>
      </section>
    </article>
  </div>`;
  renderSceneButtons();
  $('#sceneSearch').oninput = event => { state.sceneQuery = event.target.value; renderSceneButtons(); };
  bindFields($('.scene-editor .editor-section'),scene);
  document.querySelectorAll('[data-block]').forEach(card => bindFields(card,tables.content_block.find(row => row.block_id === card.dataset.block)));
  document.querySelectorAll('[data-choice]').forEach(card => bindFields(card,tables.choice.find(row => row.choice_id === card.dataset.choice)));
  document.querySelectorAll('[data-edit-rules]').forEach(button => button.onclick = () => rulesEditor.open(button.dataset.editRules));
  $('#addScene').onclick = openSceneForm;
  $('#addBlock').onclick = () => {
    tables.content_block.push({ ...baseKeys(), block_id:nextId(`${scene.scene_id}-block`,tables.content_block,'block_id'),
      scene_id:scene.scene_id, ordinal:nextOrdinal(blocks,()=>true), block_type:'narration', speaker:'', text:'' });
    markDirty(); renderManuscript();
  };
  $('#addChoice').onclick = () => {
    tables.choice.push({ ...baseKeys(), choice_id:nextId(`${scene.scene_id}-choice`,tables.choice,'choice_id'),
      scene_id:scene.scene_id, ordinal:nextOrdinal(choices,()=>true), text:'', next_scene_id:'' });
    markDirty(); renderManuscript();
  };
  document.querySelectorAll('[data-delete-block]').forEach(button => button.onclick = () => deleteEntry('content_block',button.dataset.deleteBlock));
  document.querySelectorAll('[data-delete-choice]').forEach(button => button.onclick = () => deleteEntry('choice',button.dataset.deleteChoice));
}

function cardFields(row, fields) {
  return fields.map(field => ['notes','alt_text'].includes(field)
    ? `<div class="wide">${textArea(field,row[field])}</div>` : input(field,row[field],row)).join('');
}

function assetPreviewMarkup(row) {
  const preview = assetImagePreview(row);
  return preview ? `<figure class="asset-preview"><img loading="lazy" decoding="async" src="${escapeHtml(preview.url)}" alt="${escapeHtml(preview.altText)}">
    <figcaption role="status" hidden></figcaption></figure>`
    : '<p class="work-description">ready/approved 이미지의 파일 위치와 SHA-256이 있으면 미리보기를 표시합니다.</p>';
}

function canInspectImage(row) {
  return !isReadonly() && ['background','portrait','overlay'].includes(row.asset_type);
}

function renderAssetCard(row) {
  return `<div class="asset-card" data-asset="${escapeHtml(row.asset_id)}">
    <div class="row-actions"><span class="eyebrow">${escapeHtml(row.asset_id)}</span>
      <button class="button ghost small danger" data-delete-asset="${escapeHtml(row.asset_id)}" aria-label="에셋 ${escapeHtml(row.asset_id)} 삭제" ${isReadonly()?'disabled':''}>삭제</button></div>
    <div data-asset-preview>${assetPreviewMarkup(row)}</div>
    <div class="row-actions"><button class="button small" data-inspect-asset="${escapeHtml(row.asset_id)}"
      aria-label="에셋 ${escapeHtml(row.asset_id)} 파일 해시 가져오기" ${canInspectImage(row)?'':'disabled'}>파일 해시 가져오기</button>
      <small data-inspect-status role="status"></small></div>
    <div class="compact-grid">${cardFields(row,['asset_id','asset_type','source_path','status','rights_holder','license','content_hash','alt_text','duration_ms','notes'])}</div>
  </div>`;
}

function renderCueCard(row) {
  return `<div class="cue-card" data-cue="${escapeHtml(row.cue_id)}">
    <div class="row-actions"><span class="eyebrow">${escapeHtml(row.cue_id)}</span>
      <button class="button ghost small danger" data-delete-cue="${escapeHtml(row.cue_id)}" aria-label="연출 ${escapeHtml(row.cue_id)} 삭제" ${isReadonly()?'disabled':''}>삭제</button></div>
    <div class="compact-grid">${cardFields(row,['cue_id','scene_id','block_id','choice_id','trigger','channel','action','asset_id','ordinal','fade_ms','volume','loop','duration_ms'])}</div>
  </div>`;
}

function bindAssetPreview(card, row) {
  function bindImageError() {
    const image = card.querySelector('[data-asset-preview] img');
    if (image) image.onerror = () => {
      image.hidden = true;
      const caption = card.querySelector('[data-asset-preview] figcaption');
      caption.textContent = '이미지를 열 수 없습니다. 파일 위치와 SHA-256을 확인하세요.';
      caption.hidden = false;
    };
  }
  bindImageError();
  for (const control of card.querySelectorAll('[data-field]')) {
    if (control.dataset.field === 'alt_text') {
      control.addEventListener('input',() => {
        const image = card.querySelector('[data-asset-preview] img');
        if (image) image.alt = row.alt_text || '등록된 장면 이미지';
      });
    } else if (['source_path','content_hash','asset_type','status'].includes(control.dataset.field)) {
      control.addEventListener('input',() => {
        card.querySelector('[data-asset-preview]').innerHTML = assetPreviewMarkup(row);
        card.querySelector('[data-inspect-asset]').disabled = !canInspectImage(row);
        bindImageError();
      });
    }
  }
}

async function inspectAsset(card, row, button) {
  if (button.disabled || !canInspectImage(row)) return;
  const current = state.current;
  const revision = state.revision;
  const sequence = state.loadSequence;
  const path = row.source_path;
  const status = card.querySelector('[data-inspect-status]');
  button.disabled = true;
  status.textContent = '파일 확인 중…';
  try {
    const result = await api('/api/asset-inspect',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({path})});
    if (state.current !== current || state.revision !== revision || state.loadSequence !== sequence || !card.isConnected) return;
    const kilobytes = Math.ceil(result.bytes/1024);
    if (row.content_hash === result.hash) {
      status.textContent = `실제 파일과 현재 SHA-256이 일치합니다 (${kilobytes}KB).`;
      return;
    }
    row.content_hash = result.hash;
    markDirty();
    renderDirection();
    focusDirectionField('asset',row.asset_id,'content_hash');
    toast(`파일 SHA-256을 가져왔습니다 (${kilobytes}KB). 권리와 이미지를 확인한 뒤 저장하세요.`);
  } catch (error) {
    if (state.current === current && state.revision === revision && state.loadSequence === sequence && card.isConnected) {
      status.textContent = error.message;
    }
  } finally {
    if (card.isConnected) {
      button.disabled = !canInspectImage(row);
      if (status.textContent === '파일 확인 중…') status.textContent = '원고가 변경되어 결과를 적용하지 않았습니다. 다시 확인하세요.';
    }
  }
}

function focusDirectionField(kind, id, field) {
  const control = document.querySelector(`[data-${kind}="${CSS.escape(id)}"] [data-field="${field}"]`);
  control?.focus({preventScroll:true});
  control?.scrollIntoView({block:'center'});
}

function rerenderDirectionField(control, cueId) {
  const field = control.dataset.field;
  renderDirection();
  focusDirectionField('cue',cueId,field);
}

function renderDirection() {
  const {asset,cue} = state.current.tables;
  const disabled = isReadonly() ? 'disabled' : '';
  $('#panel-direction').innerHTML = `<div class="direction-grid">
    <section><div class="section-heading"><h2>에셋</h2><button class="button small" id="addAsset" ${disabled}>+ 에셋</button></div>
      <p class="work-description">파일 위치·권리·이미지 설명을 관리합니다. planned는 원장에 보존하고 실행에서는 제외합니다. ready 전환에는 실제 파일·해시·권리 정보가 필요합니다.</p>
      ${asset.map(renderAssetCard).join('')}</section>
    <section><div class="section-heading"><h2>연출 cue</h2><button class="button small" id="addCue" ${disabled}>+ cue</button></div>
      <p class="work-description">어느 장면에서 어떤 이미지·사운드를 언제 보여줄지 정합니다.</p>
      ${cue.map(renderCueCard).join('')}</section>
  </div>`;
  document.querySelectorAll('[data-asset]').forEach(card => {
    const row = asset.find(row => row.asset_id === card.dataset.asset);
    bindFields(card,row);
    bindAssetPreview(card,row);
    const inspectButton = card.querySelector('[data-inspect-asset]');
    inspectButton.onclick = () => inspectAsset(card,row,inspectButton);
  });
  document.querySelectorAll('[data-cue]').forEach(card => {
    bindFields(card,cue.find(row => row.cue_id === card.dataset.cue));
    card.querySelectorAll('select[data-field="channel"], select[data-field="scene_id"]').forEach(control => {
      control.addEventListener('change',() => rerenderDirectionField(control,card.dataset.cue));
    });
  });
  $('#addAsset').onclick = () => {
    const assetId = nextId('asset',asset,'asset_id');
    asset.push({asset_id:assetId,asset_type:'background',source_path:`assets/planned/${assetId}.png`,status:'planned',rights_holder:'',license:'',content_hash:'',alt_text:'',duration_ms:'',notes:''});
    markDirty(); renderDirection();
    focusDirectionField('asset',assetId,'asset_id');
  };
  $('#addCue').onclick = () => {
    const sceneId = state.selectedScene || state.current.tables.scene[0]?.scene_id || '';
    const cueId = nextId('cue',cue,'cue_id');
    cue.push({...baseKeys(),cue_id:cueId,scene_id:sceneId,block_id:'',choice_id:'',trigger:'scene_enter',channel:'background',action:'show',asset_id:'',
      ordinal:nextOrdinal(cue,row => row.scene_id === sceneId && row.trigger === 'scene_enter'),fade_ms:'0',volume:'',loop:'0',duration_ms:''});
    markDirty(); renderDirection();
    focusDirectionField('cue',cueId,'cue_id');
  };
  document.querySelectorAll('[data-delete-asset]').forEach(button => button.onclick = () => deleteEntry('asset',button.dataset.deleteAsset));
  document.querySelectorAll('[data-delete-cue]').forEach(button => button.onclick = () => deleteEntry('cue',button.dataset.deleteCue));
}

const aiTaskLabels = {
  rewrite_scene: '장면 다시 쓰기', expand_choices: '선택지 확장', art_direction: '이미지 연출안',
  sound_direction: '사운드 연출안', continuity_review: '연속성 검수',
};
function renderCraftChecks(checks) {
  return checks.map(check=>`<li><span class="ai-check ${escapeHtml(check.status)}">${escapeHtml(check.status)}</span><strong>${escapeHtml(check.criterion)}</strong><p>${escapeHtml(check.observation)}</p></li>`).join('');
}
function renderAiProposal(proposal) {
  if(!proposal) return '<div class="ai-empty"><span>✦</span><p>작업과 요청을 고르면 현재 원고를 바꾸지 않은 채 AI 제안을 만듭니다.</p></div>';
  const scene=proposal.scene ? `<section class="ai-result-section"><h3>원고 제안</h3><p><b>${escapeHtml(proposal.scene.sceneId)}</b> · 본문 ${proposal.scene.blocks.length}개 · 선택지 ${proposal.scene.choices.length}개</p>${proposal.scene.blocks.map(block=>`<blockquote>${escapeHtml(block.text)}</blockquote>`).join('')}${proposal.scene.choices.map(choice=>`<div class="ai-choice">${escapeHtml(choice.text)} <span>→ ${escapeHtml(choice.nextSceneId)}</span></div>`).join('')}</section>` : '';
  const image=state.ai.image;
  const imageUnavailable=!state.ai.capabilities?.image?.available;
  const imageControls=proposal.art ? `<div class="ai-image-actions"><button class="button secondary" data-image-rendition="draft" ${state.ai.imageBusy||imageUnavailable||isReadonly()?'disabled':''}>${state.ai.imageBusy?'생성 중…':'빠른 시안'}</button><button class="button secondary" data-image-rendition="final" ${state.ai.imageBusy||imageUnavailable||isReadonly()?'disabled':''}>고품질 후보</button></div>` : '';
  const imagePreview=image ? `<figure class="ai-image-preview"><img src="${escapeHtml(image.previewUrl)}" alt="${escapeHtml(proposal.art?.altText||'생성된 장면 이미지')}"><figcaption>${escapeHtml(image.rendition)} · ${escapeHtml(image.model)} · ${escapeHtml(image.quality)} · ${escapeHtml(image.size)}</figcaption><button id="adoptImage" class="button primary" ${isReadonly()?'disabled':''}>이 이미지를 에셋으로 채택</button><details><summary>실제 생성 프롬프트</summary><pre>${escapeHtml(image.prompt)}</pre></details></figure>` : '';
  const art=proposal.art ? `<section class="ai-result-section"><h3>이미지 연출안</h3><dl class="ai-art-spec"><dt>목적</dt><dd>${escapeHtml(proposal.art.purpose)}</dd><dt>장면</dt><dd>${escapeHtml(proposal.art.subject)}</dd><dt>구도</dt><dd>${escapeHtml(proposal.art.composition)}</dd><dt>빛</dt><dd>${escapeHtml(proposal.art.lighting)}</dd><dt>색</dt><dd>${escapeHtml(proposal.art.palette)}</dd></dl><p>${escapeHtml(proposal.art.prompt)}</p><small>고정 요소: ${escapeHtml(proposal.art.continuityAnchors.join(' · '))}</small><small>피할 요소: ${escapeHtml(proposal.art.avoid)}</small>${imageControls}${imagePreview}</section>` : '';
  const sound=proposal.sound ? `<section class="ai-result-section"><h3>사운드 연출안</h3><p>${escapeHtml(proposal.sound.prompt)}</p><small>${escapeHtml(proposal.sound.channel)} · ${escapeHtml(proposal.sound.trigger)} · volume ${proposal.sound.volume}</small></section>` : '';
  const review=proposal.review.length ? `<section class="ai-result-section"><h3>검수 의견</h3>${proposal.review.map(item=>`<article class="ai-finding ${escapeHtml(item.severity)}"><b>${escapeHtml(item.category)}</b><p>${escapeHtml(item.message)}</p><small>${escapeHtml(item.suggestedFix)}</small></article>`).join('')}</section>` : '';
  return `<div class="ai-result"><p class="eyebrow">STRUCTURED PROPOSAL</p><h2>${escapeHtml(proposal.title)}</h2><p>${escapeHtml(proposal.summary)}</p>${scene}${art}${sound}${review}<section class="ai-result-section"><h3>제작 기준 자체 점검</h3><ul class="ai-checks">${renderCraftChecks(proposal.craftChecks)}</ul></section>${proposal.warnings.length?`<div class="ai-warnings">${proposal.warnings.map(item=>`<p>${escapeHtml(item)}</p>`).join('')}</div>`:''}<button id="applyAi" class="button primary" ${isReadonly()?'disabled':''}>초안에 적용</button></div>`;
}
function renderAi() {
  const capabilities=state.ai.capabilities?.content;
  const imageCapabilities=state.ai.capabilities?.image;
  const isAvailable=Boolean(capabilities?.available);
  const model=capabilities?.model || '확인 중';
  $('#panel-ai').innerHTML=`<div class="ai-layout"><section class="ai-compose"><p class="eyebrow">AI STORY LAB · ${escapeHtml(capabilities?.promptProfile || '...')}</p><h2>한 장면씩 제안받기</h2><p class="work-description">선택한 장면과 인접 분기만 전송합니다. 결과는 제안으로 돌아오며 적용과 저장을 각각 확인해야 합니다.</p><div class="ai-provider ${isAvailable?'ready':'offline'}"><span></span><div><b>${isAvailable?'텍스트 AI 연결됨':'텍스트 AI 연결 필요'}</b><small>${escapeHtml(capabilities?.provider || 'disabled')} · ${escapeHtml(model)}</small></div></div><div class="ai-provider ${imageCapabilities?.available?'ready':'offline'}"><span></span><div><b>${imageCapabilities?.available?'이미지 생성 연결됨':'이미지 생성 연결 필요'}</b><small>${escapeHtml(imageCapabilities?.provider || 'disabled')} · ${escapeHtml(imageCapabilities?.model || '미설정')} · ${escapeHtml(imageCapabilities?.visualBible || '')}</small></div></div>${!isAvailable?`<p class="ai-setup">${escapeHtml(capabilities?.setupHint || '.env 설정을 확인하세요.')}</p>`:''}<form id="aiForm"><label>작업<select id="aiTask" ${!isAvailable||isReadonly()?'disabled':''}>${Object.entries(aiTaskLabels).map(([value,label])=>`<option value="${value}" ${state.ai.task===value?'selected':''}>${label}</option>`).join('')}</select></label><label>대상 장면<input value="${escapeHtml(state.selectedScene)}" disabled></label><label>작가 요청<textarea id="aiBrief" maxlength="4000" placeholder="예: 창밖 등대와 젖은 우체국의 대비를 강조하고 UI 여백은 하단에 남겨줘" ${!isAvailable||isReadonly()?'disabled':''}>${escapeHtml(state.ai.brief)}</textarea></label><div class="ai-disclosure">원고와 요청은 텍스트 제안 시, 확정한 이미지 프롬프트는 이미지 생성 시 설정된 제공자에게 전송됩니다. API 키는 브라우저와 앱에 전달되지 않습니다.</div><button class="button secondary" type="submit" ${!isAvailable||isReadonly()||state.ai.busy?'disabled':''}>${state.ai.busy?'제안 만드는 중…':'AI 제안 만들기'}</button></form></section><section class="ai-preview">${renderAiProposal(state.ai.proposal)}</section></div>`;
  $('#aiForm').onsubmit=generateAi;
  $('#aiTask').onchange=event=>{state.ai.task=event.target.value;};
  $('#aiBrief').oninput=event=>{state.ai.brief=event.target.value;};
  const applyButton=$('#applyAi'); if(applyButton) applyButton.onclick=applyAiProposal;
  document.querySelectorAll('[data-image-rendition]').forEach(button=>button.onclick=()=>generateImage(button.dataset.imageRendition));
  const adoptButton=$('#adoptImage');if(adoptButton) adoptButton.onclick=adoptImage;
}
async function generateAi(event) {
  event.preventDefault(); if(state.ai.busy || !state.ai.capabilities?.content?.available) return;
  const task=state.ai.task, brief=state.ai.brief, context=currentAiContext();
  state.ai.busy=true;renderAi();
  try {
    const result=await api('/api/ai/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({directory:state.current.entry.directory,task,brief,sceneId:state.selectedScene,tables:state.current.tables})});
    if (!matchesContext(context, currentAiContext())) return;
    state.ai.context=context;state.ai.proposal=result.proposal;state.ai.meta=result.meta;state.ai.image=null;toast('AI 제안이 도착했습니다. 적용 전 내용을 확인하세요.');
  } catch(error) { toast(error.message); }
  finally { state.ai.busy=false;renderAi(); }
}
async function generateImage(rendition) {
  const art=state.ai.proposal?.art;if(!art||state.ai.imageBusy||!state.ai.capabilities?.image?.available) return;
  const context=currentAiContext();
  if (!state.ai.context || !matchesContext(state.ai.context, context)) return;
  state.ai.imageBusy=true;renderAi();
  try {
    const image=await api('/api/ai/image-generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({directory:state.current.entry.directory,sceneId:state.selectedScene,rendition,art})});
    if (!matchesContext(context, currentAiContext()) || state.ai.proposal?.art !== art) return;
    state.ai.image=image;
    toast(rendition==='draft'?'빠른 시안이 생성됐습니다. 구도와 여백을 확인하세요.':'고품질 후보가 생성됐습니다. 세부 묘사와 연속성을 확인하세요.');
  } catch(error) { toast(error.message); }
  finally { state.ai.imageBusy=false;renderAi(); }
}
async function adoptImage() {
  const art=state.ai.proposal?.art,image=state.ai.image;if(!art||!image||isReadonly()) return;
  const context=currentAiContext();
  if (!state.ai.context || !matchesContext(state.ai.context, context)) return;
  try {
    const adopted=await api('/api/ai/image-adopt',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({directory:state.current.entry.directory,runId:image.runId,assetId:art.assetId})});
    if (!matchesContext(context, currentAiContext()) || state.ai.proposal?.art !== art) return;
    state.current.tables=applyProposal(state.current.tables, context.sceneId, {scene:null,art,sound:null},{source_path:adopted.sourcePath,status:adopted.status,rights_holder:adopted.rightsHolder,license:adopted.license,content_hash:adopted.contentHash,notes:adopted.notes});
    markDirty();state.ai.context=currentAiContext();renderAll();selectTab('direction');toast('이미지 파일을 프로젝트 에셋으로 채택했습니다. 원장을 저장해 확정하세요.');
  } catch(error) { toast(error.message); }
}
function currentAiContext() {
  return { directory: state.current.entry.directory, sceneId: state.selectedScene, revision: state.revision };
}

function applyAiProposal() {
  if (!state.ai.proposal || isReadonly()) return;
  try {
    if (!matchesContext(state.ai.context, currentAiContext())) throw new Error('제안 이후 작품 또는 장면이 변경되었습니다.');
    state.current.tables = applyProposal(state.current.tables, state.selectedScene, state.ai.proposal);
    markDirty();
    state.ai.context = currentAiContext();
    renderAll();
    selectTab(state.ai.proposal.art || state.ai.proposal.sound ? 'direction' : 'manuscript');
    toast('AI 제안을 작업본에 적용했습니다. 저장 전 직접 검토하세요.');
  } catch (error) {
    toast(error.message);
  }
}

function renderTables() {
  const table=state.selectedTable, rows=state.current.tables[table];
  $('#panel-tables').innerHTML=`<div class="section-heading"><div><h2>전체 테이블</h2><p class="work-description">조건, 효과, 상태값처럼 세부 데이터가 필요할 때 사용합니다.</p></div><button id="addRow" class="button small" ${isReadonly()?'disabled':''}>+ 행 추가</button></div><div class="table-switcher">${Object.keys(headers).map(key=>`<button data-table="${key}" class="${key===table?'active':''}">${labels[key]} · ${state.current.tables[key].length}</button>`).join('')}</div><div class="table-wrap"><table><thead><tr>${headers[table].map(key=>`<th>${escapeHtml(key)}</th>`).join('')}<th></th></tr></thead><tbody>${rows.map((row,index)=>`<tr data-row="${index}">${headers[table].map(key=>`<td><input aria-label="${escapeHtml(key)}" data-cell="${escapeHtml(key)}" value="${escapeHtml(row[key])}" ${isReadonly()?'disabled':''}></td>`).join('')}<td><button class="button ghost small danger" data-delete-row="${index}" ${isReadonly()?'disabled':''}>삭제</button></td></tr>`).join('')}</tbody></table></div>`;
  document.querySelectorAll('[data-table]').forEach(button=>button.onclick=()=>{state.selectedTable=button.dataset.table;renderTables();});
  document.querySelectorAll('tr[data-row]').forEach(tr=>{ const row=rows[Number(tr.dataset.row)]; tr.querySelectorAll('[data-cell]').forEach(el=>el.oninput=()=>{row[el.dataset.cell]=el.value;markDirty();}); });
  document.querySelectorAll('[data-delete-row]').forEach(button=>button.onclick=()=>{rows.splice(Number(button.dataset.deleteRow),1);markDirty();renderTables();});
  $('#addRow').onclick=()=>{ rows.push(Object.fromEntries(headers[table].map(key=>[key,baseKeys()[key]??'']))); markDirty();renderTables(); };
}
function renderPlaytest() {
  const playtest = state.playtest;
  const run = playtest.run;
  const isStale = playtest.context && !isPlaytestCurrent(state,playtest);
  const canChoose = !playtest.busy && !isStale;
  const notice = isStale ? '<p class="notice">원고가 수정되었습니다. 수정한 원고로 다시 시작하세요.</p>' : '';
  const image = run?.background ? `<img class="playtest-backdrop" src="${escapeHtml(run.background.url)}" alt="${escapeHtml(run.background.altText)}">` : '';
  const reader = run ? `<article class="playtest-letter" aria-label="이야기 미리보기" tabindex="-1">
      <p class="playtest-sender">${escapeHtml(run.node.sender)}</p>
      <div class="playtest-body">${escapeHtml(run.node.body)}</div>
      ${run.node.type === 'ending' ? '<p class="playtest-ending">이 경로의 이야기가 끝났습니다.</p>' : ''}
      <div class="playtest-choices">${run.choices.map(choice => `<button class="playtest-choice" data-preview-choice="${escapeHtml(choice.id)}" ${canChoose ? '' : 'disabled'}>${escapeHtml(choice.text)}</button>`).join('')}</div>
    </article>` : '<div class="playtest-empty"><h3>편지를 열고 선택을 따라가 보세요</h3><p>현재 편집 중인 원고를 검사한 뒤 처음 장면부터 읽습니다. 저장하지 않은 문장도 확인할 수 있습니다.</p></div>';
  const history = run ? `<details class="playtest-history"><summary>선택 기록 ${run.history.length}개</summary><ol>${run.history.map(step => `<li><span>${escapeHtml(step.sender)}</span><p>${escapeHtml(step.choiceText)}</p></li>`).join('')}</ol><dl class="playtest-flags">${Object.entries(run.flags).map(([id,value]) => `<dt>${escapeHtml(id)}</dt><dd>${value ? '예' : '아니요'}</dd>`).join('')}</dl></details>` : '';
  $('#panel-playtest').innerHTML = `<div class="section-heading"><div><h2>플레이 미리보기</h2><p class="work-description">분기와 문장을 직접 읽고 확인합니다. 앱의 플레이 기록은 바뀌지 않습니다.</p></div></div>
    <div class="playtest-toolbar"><button id="previewStart" class="button secondary" ${playtest.busy ? 'disabled' : ''}>${playtest.busy ? '검사하는 중…' : run ? '처음부터 다시 읽기' : '원고로 시작'}</button>
    <button id="previewBack" class="button ghost" ${canChoose && playtest.choiceIds.length ? '' : 'disabled'}>이전 선택으로</button>
    <button id="previewExport" class="button ghost" ${run && canChoose ? '' : 'disabled'}>플레이 경로 내보내기</button></div>
    ${notice}${playtest.error ? `<p class="form-error" role="alert">${escapeHtml(playtest.error)}</p>` : ''}
    ${run?.pendingAssetCount ? `<p class="work-description">미완성 에셋 ${run.pendingAssetCount}개는 표시하지 않습니다.</p>` : ''}
    <div class="playtest-stage ${run?.background ? 'has-artwork' : ''}">${image}${reader}</div>${history}`;
  $('#previewStart').onclick = () => previewChoices([], true);
  $('#previewBack').onclick = () => previewChoices(playtest.choiceIds.slice(0,-1));
  $('#previewExport').onclick = exportPreviewPath;
  document.querySelectorAll('[data-preview-choice]').forEach(button => {
    button.onclick = () => previewChoices([...playtest.choiceIds, button.dataset.previewChoice]);
  });
}

function exportPreviewPath() {
  try {
    const work = state.playtest.snapshot.story_work[0];
    openJsonExport({title:'플레이 경로 내보내기',label:'플레이 경로 JSON',text:exportPlaytest(state,state.playtest),
      description:'선택 순서·도착 장면·상태값·당시 원고 사본을 보관합니다. 게임 저장 파일이나 원고 복원 백업이 아니며 실제 에셋 파일·AI 설정은 포함하지 않습니다.',
      filename:`${work.story_id}-v${work.working_version}-${work.locale}-playtest.json`});
  } catch (error) { toast(error.message); }
}

async function previewChoices(choiceIds, restart = false) {
  const request = previewDocument(state,state.playtest,choiceIds,restart,(directory,tables,choiceIds) => api('/api/preview', {
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({directory,tables,choiceIds}),
  }));
  renderPlaytest();
  let hasPreviewed = false;
  try { hasPreviewed = await request === 'previewed'; }
  catch (error) { toast(error.message); }
  finally {
    renderPlaytest();
    if (hasPreviewed && state.tab === 'playtest') {
      const letter = $('.playtest-letter');
      letter?.focus({preventScroll:true});
      (state.playtest.run?.background ? $('.playtest-stage') : letter)?.scrollIntoView({block:'start'});
    }
  }
}

function renderReview() {
  const tables = state.current.tables;
  const review = state.review;
  const current = isReviewCurrent(state,review);
  const result = review.result;
  const status = review.busy ? '현재 원고를 검사하고 있습니다.' : result
    ? current ? '현재 원고와 일치하는 검수 결과입니다.' : '검수 이후 원고가 바뀌었습니다. 다시 검사하세요.'
    : '현재 편집 중인 원고를 검사해 제작표와 분기를 확인하세요. CSV는 저장하지 않습니다.';
  const details = result ? `<p class="work-description">검수 시각 ${escapeHtml(new Date(result.validation.validatedAt).toLocaleString('ko-KR'))}
      · 검수 당시 ${result.wasUnsaved ? '미저장 원고' : '저장된 원고'}</p>
    <details><summary>검수 원장 식별값</summary><code>${escapeHtml(result.validation.revision)}</code></details>
    <div class="review-grid"><section><div class="section-heading"><h2>${current ? '' : '이전 검수의 '}제작표</h2></div><pre>${escapeHtml(result.validation.report)}</pre></section>
      <section><div class="section-heading"><h2>${current ? '' : '이전 검수의 '}분기 구조</h2></div><pre>${escapeHtml(result.validation.graph)}</pre></section></div>` : '';
  $('#panel-review').innerHTML = `<div class="section-heading"><div><h2>원고 검수</h2><p class="work-description" role="status">${status}</p></div></div>
    <div class="playtest-toolbar"><button id="reviewValidate" class="button secondary" ${review.busy || state.isLoading || state.isRestoring ? 'disabled' : ''}>${review.busy ? '검사하는 중…' : '현재 원고 검사'}</button>
      <button id="reviewExport" class="button ghost" ${current && !review.busy ? '' : 'disabled'}>검수 기록 내보내기</button></div>
    ${review.error ? `<p class="form-error" role="alert">${escapeHtml(review.error)}</p>` : ''}
    <p class="work-description">현재 편집 원고: 장면 ${tables.scene.length}개 · 본문 ${tables.content_block.length}개 · 선택 ${tables.choice.length}개 · 에셋 ${tables.asset.length}개 · 연출 ${tables.cue.length}개</p>
    ${details}`;
  $('#reviewValidate').onclick = reviewCurrent;
  $('#reviewExport').onclick = () => {
    try {
      const work = tables.story_work[0];
      openJsonExport({ title:'검수 기록 내보내기', label:'검수 JSON', text:exportReview(state,review),
        description:'검사한 원고 사본·시각·식별값·제작표·분기를 보관합니다. 실제 에셋 파일·AI 설정은 포함하지 않으며 출시 승인이나 복원용 백업을 뜻하지 않습니다.',
        filename:`${work.story_id}-v${work.working_version}-${work.locale}-review.json` });
    } catch (error) { toast(error.message); }
  };
}

async function reviewCurrent() {
  const request = validateReview(state,state.review,(directory,tables) => api('/api/validate', {
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({directory,tables}),
  }));
  renderReview();
  try {
    const result = await request;
    if (result === 'validated') toast('현재 원고의 검수 기록을 만들었습니다. CSV는 저장하지 않았습니다.');
    if (result === 'stale') toast('검사 중 원고가 바뀌어 결과를 적용하지 않았습니다. 다시 검사하세요.');
  } catch (error) { toast(error.message); }
  finally { renderReview(); }
}

async function save() {
  if (!state.dirty || state.isSaving || state.isLoading || state.isRestoring || isReadonly()) return;
  const directory = state.current.entry.directory;
  const sequence = state.loadSequence;
  const request = saveDocument(state, (directory, payload) => api(`/api/work?directory=${encodeURIComponent(directory)}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  }));
  $('#saveButton').disabled = true;
  renderUndo();
  $('#saveState').textContent = '검증하고 저장하는 중';
  try {
    const result = await request;
    if (result === 'stale' || result === 'skipped') return;
    renderAll();
    $('#saveState').textContent = state.dirty ? '추가 변경을 저장하세요' : '검증 완료 · 모두 저장됨';
    toast(state.dirty ? '요청 이후 수정한 내용은 아직 저장되지 않았습니다.' : '원고를 검증하고 저장했습니다.');
  } catch (error) {
    if (state.current.entry.directory !== directory || state.loadSequence !== sequence) return;
    $('#saveState').textContent = '저장 실패';
    toast(error.message);
  } finally {
    $('#saveButton').disabled = state.isSaving || state.isLoading || state.isRestoring || isReadonly() || !state.dirty;
    renderUndo();
  }
}

function renderUndo() { $('#undoButton').disabled = !canUndoDocument(state); }

function rememberStructure(previous, sceneId) {
  rememberUndo(state, previous);
  state.undoScene = sceneId;
  renderUndo();
}

function undoStructure() {
  const sceneId = state.undoScene;
  if (!undoDocument(state)) return;
  state.selectedScene = sceneId;
  Object.assign(state.ai, { proposal:null, meta:null, context:null, image:null });
  renderAll();
  $('#saveState').textContent = '구조 변경 취소 · 저장 필요';
  toast('직전 구조 변경을 되돌렸습니다. 내용 확인 후 저장하세요.');
}

async function deleteEntry(table, id) {
  if (state.isDeleting || state.isSaving || state.isLoading || state.isRestoring || isReadonly()) return;
  const current = state.current;
  const revision = state.revision;
  const sceneId = state.selectedScene;
  const previous = { tables:structuredClone(current.tables), preview:current.preview };
  state.isDeleting = true;
  try {
    const next = removeAuthoringRow(current.tables, table, id);
    if (!await confirmAction('원장 행 삭제', `${id}와 관련된 ${next.removedCount}개 행을 삭제할까요? 실제 이미지·사운드 파일은 보존됩니다.`, '검사하고 삭제')) return;
    if (state.current !== current || state.revision !== revision) return;
    const preview = await api('/api/validate', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({directory:current.entry.directory,tables:next.tables}) });
    if (state.current !== current || state.revision !== revision || state.isSaving || state.isLoading || state.isRestoring) throw new Error('검사 중 편집이 바뀌어 삭제하지 않았습니다. 현재 변경을 보존했습니다.');
    current.tables = next.tables;
    current.preview = preview;
    markDirty();
    rememberStructure(previous, sceneId);
    renderAll();
    toast('검증한 행을 삭제했습니다. 다른 편집 전에는 직전 구조 변경을 취소할 수 있습니다.');
  } catch (error) { toast(error.message); }
  finally { state.isDeleting = false; }
}

function openSceneForm() {
  if (isReadonly() || state.isSaving || state.isLoading || state.isRestoring) return;
  const tables = state.current.tables;
  const form = $('#sceneForm');
  form.reset();
  $('#sceneFormError').textContent = '';
  $('#newSceneSource').innerHTML = fieldOptions('next_scene_id', tables).filter(([id]) => tables.scene.some(scene => scene.scene_id === id && scene.scene_type === 'letter')).map(([id,label]) => `<option value="${escapeHtml(id)}">${escapeHtml(label)}</option>`).join('');
  $('#newSceneSource').value = tables.scene.find(scene => scene.scene_id === state.selectedScene && scene.scene_type === 'letter')?.scene_id || tables.story_work[0].start_scene_id;
  $('#newSceneNext').innerHTML = fieldOptions('next_scene_id', tables).map(([id,label]) => `<option value="${escapeHtml(id)}">${escapeHtml(label)}</option>`).join('');
  const firstChoice = tables.choice.find(choice => choice.scene_id === $('#newSceneSource').value);
  $('#newSceneNext').value = firstChoice?.next_scene_id || '';
  $('#newSceneId').value = nextId('scene', tables.scene, 'scene_id');
  updateSceneForm();
  $('#sceneDialog').showModal();
}

function updateSceneForm() {
  const isEnding = $('#newSceneType').value === 'ending';
  $('#sceneLetterFields').hidden = isEnding;
  $('#sceneEndingFields').hidden = !isEnding;
  for (const id of ['newSceneSender','newSceneNext','newSceneContinue']) $(`#${id}`).required = !isEnding;
  $('#newSceneEndingId').required = isEnding;
}

function setSceneBusy(isBusy) {
  $('#sceneForm').querySelectorAll('input,textarea,select').forEach(control => { control.disabled = isBusy; });
  $('#sceneSubmit').disabled = isBusy;
}

async function addSceneBranch(event) {
  event.preventDefault();
  if ($('#sceneSubmit').disabled) return;
  const current = state.current;
  const revision = state.revision;
  const sequence = ++state.sceneSequence;
  const previous = { tables:structuredClone(current.tables), preview:current.preview };
  const previousScene = state.selectedScene;
  const request = {
    sourceSceneId: $('#newSceneSource').value, sceneId: $('#newSceneId').value.trim(), sceneType: $('#newSceneType').value,
    body: $('#newSceneBody').value, entryText: $('#newSceneEntry').value, sender: $('#newSceneSender').value,
    nextSceneId: $('#newSceneNext').value, continueText: $('#newSceneContinue').value, endingId: $('#newSceneEndingId').value.trim(),
  };
  $('#sceneFormError').textContent = '';
  setSceneBusy(true);
  try {
    const tables = createSceneBranch(current.tables, request);
    const preview = await api('/api/validate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ directory: current.entry.directory, tables }) });
    if (sequence !== state.sceneSequence || !$('#sceneDialog').open) return;
    if (current !== state.current || revision !== state.revision || state.isSaving || state.isLoading || state.isRestoring) throw new Error('검사하는 동안 원고가 바뀌었습니다. 현재 편집을 유지했습니다. 다시 추가하세요.');
    current.tables = tables;
    current.preview = preview;
    state.selectedScene = request.sceneId;
    state.sceneQuery = '';
    Object.assign(state.ai, { proposal: null, meta: null, context: null, image: null });
    markDirty();
    rememberStructure(previous, previousScene);
    $('#sceneDialog').close();
    renderAll();
    selectTab('manuscript');
    focusScene();
    toast('검증한 새 장면과 선택지를 추가했습니다. 확인 후 저장하세요.');
  } catch (error) {
    if (sequence === state.sceneSequence) $('#sceneFormError').textContent = error.message;
  } finally {
    if (sequence === state.sceneSequence) setSceneBusy(false);
  }
}

function openJsonExport({title,description,label,text,filename}) {
  const link = $('#backupDownload');
  if (link.href.startsWith('blob:')) URL.revokeObjectURL(link.href);
  link.href = URL.createObjectURL(new Blob([text],{type:'application/json'}));
  link.download = filename;
  $('#backupTitle').textContent = title;
  $('#backupDescription').textContent = description;
  $('#backupLabel').textContent = label;
  $('#backupText').value = text;
  $('#backupDialog').showModal();
}

function openBackup() {
  if (!state.current) return;
  try {
    const work = state.current.tables.story_work[0];
    openJsonExport({title:'원고 백업',label:'백업 JSON',text:createBackup(state.current.tables,headers),
      description:'미저장 변경을 포함한 제작 테이블입니다. 이미지·사운드 실제 파일은 별도로 보관하세요. AI 연결 정보는 포함하지 않습니다.',
      filename:`${work.story_id}-v${work.working_version}-${work.locale}-backup.json`});
  } catch (error) { toast(error.message); }
}

async function restoreBackup(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file || !state.current) return;
  const current = state.current;
  const revision = state.revision;
  try {
    if (file.size > maximumBackupBytes) throw new Error('5MB 이하의 제작실 백업 파일을 선택하세요.');
    const text = await file.text();
    if (state.current !== current || state.revision !== revision) return;
    const tables = readBackup(text, current.tables, headers);
    const restoring = restoreDocument(state, tables,
      (directory, tables) => api('/api/validate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ directory, tables }) }),
      () => confirmAction('백업 불러오기', '현재 편집 내용을 백업으로 교체합니다. 불러온 뒤 변경사항을 저장해야 CSV에 반영됩니다.', '편집기에 불러오기'));
    $('#restoreButton').disabled = true;
    $('#saveButton').disabled = true;
    renderUndo();
    const result = await restoring;
    if (result === 'stale') { toast('불러오는 동안 원고가 바뀌어 복원을 취소했습니다. 현재 변경을 보존했습니다.'); return; }
    if (result !== 'restored') return;
    state.selectedScene = tables.scene[0]?.scene_id || '';
    state.sceneQuery = '';
    Object.assign(state.ai, { proposal: null, meta: null, context: null, image: null });
    renderAll();
    $('#saveState').textContent = '백업을 불러옴 · 저장 필요';
    toast('백업을 편집기에 불러왔습니다. 확인 후 저장하세요.');
  } catch (error) { toast(error.message); }
  finally {
    $('#restoreButton').disabled = isReadonly() || state.isSaving || state.isLoading || state.isRestoring;
    $('#saveButton').disabled = isReadonly() || !state.dirty || state.isSaving || state.isLoading || state.isRestoring;
    renderUndo();
  }
}

function setCloneBusy(isBusy) {
  state.isCloning = isBusy;
  for (const control of $('#cloneForm').querySelectorAll('input,button')) control.disabled = isBusy;
  $('#cloneForm [type="submit"]').textContent = isBusy ? '작업본 만드는 중…' : '작업본 만들기';
}

function openClone() {
  if (state.dirty || state.isSaving || state.isLoading || state.isRestoring || state.isCloning) {
    toast('현재 변경사항을 저장한 뒤 작업본을 복제하세요.');
    return;
  }
  const next = Math.max(...state.works.filter(work => work.storyId === state.current.entry.storyId).map(work => work.version),0) + 1;
  $('#cloneVersion').value = next;
  $('#cloneVersion').min = Number(state.current.tables.story_work[0].working_version) + 1;
  $('#cloneError').textContent = '';
  $('#cloneDialog').showModal();
}

async function clone(event) {
  event.preventDefault();
  if (state.isCloning || state.dirty || state.isSaving || state.isLoading || state.isRestoring) return;
  const current = state.current;
  const context = {current,revision:state.revision,loadSequence:state.loadSequence};
  const payload = { sourceDirectory:current.entry.directory,expectedRevision:current.revision,newVersion:Number($('#cloneVersion').value) };
  $('#cloneError').textContent = '';
  setCloneBusy(true);
  try {
    const result = await cloneAndRefresh(payload,
      body => api('/api/clone',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),
      async entry => {
        $('#cloneDialog').close();
        await refreshWorkList();
      });
    if (result.refreshError) {
      state.workRefreshError = `v${result.entry.workingVersion} 작업본은 생성됐습니다. 목록을 갱신하지 못했습니다. ‘작품 목록 다시 읽기’로 새 작업본을 찾으세요. 현재 편집 내용은 유지됩니다. ${result.refreshError}`;
      renderWorkList();
      $('#retryWorkList').focus({preventScroll:true});
      $('#workRefreshNotice').scrollIntoView({block:'center'});
    } else {
      const opened = canOpenClone(state,context) ? await loadWork(result.entry.directory) : 'skipped';
      if (opened === 'loaded') focusWorkCard(result.entry.directory);
      toast(opened === 'failed'
        ? `v${result.entry.workingVersion} 작업본은 생성됐습니다. 원고 다시 열기로 재시도하세요.`
        : `v${result.entry.workingVersion} 작업본을 만들었습니다.`);
    }
  } catch (error) { $('#cloneError').textContent = error.message; }
  finally { setCloneBusy(false); }
}

function selectTab(tab) { state.tab=tab;if(tab==='review')renderReview();document.querySelectorAll('.tab').forEach(button=>{const isActive=button.dataset.tab===tab;button.classList.toggle('active',isActive);button.setAttribute('aria-pressed',String(isActive));});document.querySelectorAll('.tab-panel').forEach(panel=>panel.hidden=panel.id!==`panel-${tab}`); }

function applyAiSettings(settings) {
  state.ai.capabilities={content:settings.content,image:settings.image};
  if(state.current) renderAi();
}
function renderAiSettings() {
  const connection = state.ai.connection;
  const credential = connection.settings?.credential;
  const busy = connection.isLoading || connection.isWriting;
  $('#saveAiCredential').disabled = busy || !credential?.storageAvailable;
  $('#deleteAiCredential').hidden = credential?.source !== 'macos-keychain';
  $('#deleteAiCredential').disabled = busy;
  $('#openAiApiKey').disabled = busy;
  $('#aiSettingsCancel').disabled = connection.isWriting;
  $('#saveAiCredential').textContent = connection.isWriting ? '설정 반영 중…' : 'Keychain에 저장';
  $('#aiSettingsError').textContent = connection.error;
  const status=$('#aiCredentialStatus');
  if (!credential || busy) {
    status.className='credential-status';
    status.textContent = connection.isWriting ? '연결 설정을 반영하는 중입니다.'
      : connection.isLoading ? '연결 상태를 확인하는 중입니다.' : '연결 상태를 확인하지 못했습니다. 설정을 다시 열어 확인하세요.';
    return;
  }
  const sourceLabel=credential.source==='environment'?'환경변수':credential.source==='macos-keychain'?'macOS Keychain':'연결되지 않음';
  status.className=`credential-status ${credential.configured?'connected':'disconnected'}`;
  status.innerHTML=`<span aria-hidden="true"></span><div><strong>${credential.configured?'API 연결 정보 있음':'API 키가 필요합니다'}</strong><small>${escapeHtml(sourceLabel)}${credential.maskedKey?` · ${escapeHtml(credential.maskedKey)}`:''}<br>${escapeHtml(credential.storageLabel)}</small></div>`;
}
async function refreshAiConnection(request = () => api('/api/settings/ai'), isWriting = false) {
  const pending = requestConnection(state.ai.connection,request,isWriting);
  renderAiSettings();
  const result = await pending;
  if (result === 'applied') applyAiSettings(state.ai.connection.settings);
  renderAiSettings();
  return result;
}
async function openAiSettings() {
  if ($('#aiSettingsDialog').open) return;
  $('#openAiApiKey').value='';
  $('#aiSettingsDialog').showModal();
  await refreshAiConnection();
}
async function saveAiCredential(event) {
  event.preventDefault();
  const connection = state.ai.connection;
  if (connection.isLoading || connection.isWriting || !connection.settings?.credential.storageAvailable) return;
  const apiKey=$('#openAiApiKey').value.trim();
  if (!apiKey) { connection.error='프로젝트 API 키를 입력하세요.';renderAiSettings();return; }
  const result = await refreshAiConnection(() => api('/api/settings/ai',{
    method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({apiKey}),
  }),true);
  if (result === 'applied') {
    $('#openAiApiKey').value='';
    toast('API 키를 macOS Keychain에 저장했습니다.');
  }
}
async function deleteAiCredential() {
  const connection = state.ai.connection;
  if (connection.isLoading || connection.isWriting || connection.settings?.credential.source !== 'macos-keychain') return;
  if (!await confirmAction('저장된 키 삭제', 'macOS Keychain에 저장된 Story Post API 키를 삭제할까요?', '키 삭제')) return;
  if (connection.isLoading || connection.isWriting || connection.settings?.credential.source !== 'macos-keychain') return;
  if (await refreshAiConnection(() => api('/api/settings/ai',{method:'DELETE'}),true) === 'applied') {
    toast('저장된 API 키를 삭제했습니다.');
  }
}

$('#retryWorkLoad').onclick = async () => {
  const directory = state.loadFailure?.directory;
  if (!directory || state.isLoading || state.isRestoring) return;
  if (await attemptLoad(directory) === 'loaded') focusWorkCard(directory);
};
$('#retryWorkList').onclick = async () => {
  const revision = state.revision;
  $('#retryWorkList').disabled = true;
  try {
    await refreshWorkList();
    if (state.revision === revision) {
      if (state.current) focusWorkCard(state.current.entry.directory);
    }
  }
  catch (error) {
    state.workRefreshError = `작품 목록을 읽지 못했습니다. 다시 시도하세요. ${error.message}`;
    renderWorkList();
  } finally { $('#retryWorkList').disabled = false; }
};
$('#undoButton').onclick=undoStructure;
$('#sceneForm').onsubmit=addSceneBranch;
$('#newSceneType').onchange=updateSceneForm;
$('#sceneCancel').onclick=()=>$('#sceneDialog').close();
$('#sceneDialog').addEventListener('close',()=>{ state.sceneSequence++; setSceneBusy(false); });
const rulesEditor = createChoiceRulesEditor({
  state, dialog:$('#rulesDialog'), onError:toast,
  onApplied:choiceId => {
    const button = document.querySelector(`[data-edit-rules="${CSS.escape(choiceId)}"]`);
    button?.focus({preventScroll:true});
    button?.scrollIntoView({block:'center'});
  },
  validate:(directory,tables) => api('/api/validate', { method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({directory,tables}) }),
  apply:(tables,preview) => {
    const previous = {tables:structuredClone(state.current.tables),preview:structuredClone(state.current.preview)};
    state.undoScene = state.selectedScene;
    state.current.tables = tables;
    state.current.preview = preview;
    markDirty();
    rememberUndo(state,previous);
    Object.assign(state.ai,{proposal:null,context:null,image:null});
    renderAll();
    toast('선택 규칙을 검사해 적용했습니다. 확인 후 원고를 저장하세요.');
  },
});

$('#backupButton').onclick=openBackup;
$('#backupClose').onclick=()=>$('#backupDialog').close();
$('#backupCopy').onclick=async()=>{
  try { await navigator.clipboard.writeText($('#backupText').value); toast('JSON을 복사했습니다. 파일로 보관하세요.'); }
  catch { $('#backupText').select(); toast('복사할 수 없어 JSON 본문을 선택했습니다. 직접 복사하세요.'); }
};
$('#restoreButton').onclick=()=>$('#backupFile').click();
$('#backupFile').onchange=restoreBackup;
$('#saveButton').onclick=save; $('#cloneButton').onclick=openClone; $('#cloneForm').onsubmit=clone; $('#cloneCancel').onclick=()=>{if(!state.isCloning)$('#cloneDialog').close();};
$('#cloneDialog').addEventListener('cancel',event=>{if(state.isCloning)event.preventDefault();});
$('#aiSettingsButton').onclick=openAiSettings;$('#aiSettingsForm').onsubmit=saveAiCredential;$('#aiSettingsCancel').onclick=()=>{if(!state.ai.connection.isWriting)$('#aiSettingsDialog').close();};$('#deleteAiCredential').onclick=deleteAiCredential;
$('#aiSettingsDialog').addEventListener('cancel',event=>{if(state.ai.connection.isWriting)event.preventDefault();});
$('#aiSettingsDialog').addEventListener('close',()=>{$('#openAiApiKey').value='';});
document.querySelectorAll('.tab').forEach(button=>button.onclick=()=>selectTab(button.dataset.tab));
window.addEventListener('beforeunload',event=>{if(state.dirty){event.preventDefault();event.returnValue='';}});
loadWorks().catch(error=>{ $('#emptyState h1').textContent='제작실을 열지 못했습니다';$('#emptyState p').textContent=error.message;$('#saveState').textContent='오류'; });
refreshAiConnection();
