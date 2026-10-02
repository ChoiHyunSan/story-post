import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { AiProposal, AiTableRows } from '../scripts/ai-content';
import { authoringHeaders } from '../scripts/authoring-contract';
import { importAuthoringCsv, parseCsv } from '../scripts/authoring-csv';
import { createAuthoringDatabase, exportPresentationPackage, exportRuntimeStory } from '../scripts/authoring-store';
import { applyProposal, matchesContext, nextOrdinal } from '../tools/authoring-studio/proposal.mjs';
import { advance, initialFlags } from '../src/engine/story';

const draftDirectory = 'content/authoring/works/little-post-office-v4';
const key = { storyId: 'little-post-office', workingVersion: 4, locale: 'ko' };

function tables(): AiTableRows {
  return Object.fromEntries(Object.entries(authoringHeaders).map(([table, columns]) => {
    const rows = parseCsv(readFileSync(`${draftDirectory}/${table}.csv`, 'utf8')).slice(1);
    return [table, rows.map(row => Object.fromEntries(columns.map((column, index) => [column, row[index]])))];
  })) as AiTableRows;
}

function sceneProposal(): Pick<AiProposal, 'scene' | 'art' | 'sound'> {
  return {
    scene: {
      sceneId: 'ten-year-mail', sender: '수정된 보낸 이', notes: '검토',
      blocks: [{ blockId: 'ten-year-mail-body', blockType: 'narration', speaker: '', text: '수정한 본문' }],
      choices: [{ choiceId: 'accept-first-letter', text: '편지를 받는다', nextSceneId: 'first-letter', editorialNote: '' }],
    },
    art: null, sound: null,
  };
}

test('invalid AI destination leaves source tables untouched', () => {
  const source = tables();
  const before = structuredClone(source);
  const proposal = sceneProposal();
  proposal.scene!.choices[0].nextSceneId = 'missing';
  assert.throws(() => applyProposal(source, 'ten-year-mail', proposal), /없는 다음 장면/);
  assert.deepEqual(source, before);
});

test('AI block collisions cannot overwrite another scene', () => {
  const source = tables();
  const before = structuredClone(source);
  const proposal = sceneProposal();
  proposal.scene!.blocks[0].blockId = 'first-letter-body';
  assert.throws(() => applyProposal(source, 'ten-year-mail', proposal), /다른 장면/);
  assert.deepEqual(source, before);
});

test('AI proposal merges with stable ordinals and preserves existing choice conditions', () => {
  const source = tables();
  source.content_block[0].ordinal = '4';
  const proposal = sceneProposal();
  proposal.scene!.blocks.push({ blockId: 'new-block', blockType: 'caption', speaker: '', text: '새 단서' });
  const next = applyProposal(source, 'ten-year-mail', proposal);
  assert.equal(next.content_block.find(row => row.block_id === 'new-block')?.ordinal, '5');
  assert.deepEqual(next.choice_condition, source.choice_condition);
  assert.deepEqual(next.choice_effect, source.choice_effect);
  assert.notEqual(next, source);
  assert.equal(source.scene[0].sender, '작은 세계 우체국의 소라');
});

test('AI proposals cannot change released works or cross scene boundaries', () => {
  const source = tables();
  assert.throws(() => applyProposal(source, 'first-letter', sceneProposal()), /장면과 제안/);
  source.story_work[0].status = 'released';
  assert.throws(() => applyProposal(source, 'ten-year-mail', sceneProposal()), /배포본/);
  assert.equal(matchesContext({ directory: 'v4', sceneId: 'a' }, { directory: 'v3', sceneId: 'a' }), false);
  assert.equal(matchesContext({ directory: 'v4', sceneId: 'a' }, { directory: 'v4', sceneId: 'b' }), false);
  assert.equal(matchesContext({ directory: 'v4', sceneId: 'a', revision: 1 }, { directory: 'v4', sceneId: 'a', revision: 2 }), false);
});

test('draft export keeps unfinished directions in the ledger but excludes them from runtime preview', () => {
  const database = createAuthoringDatabase();
  try {
    importAuthoringCsv(database, draftDirectory);
    const cueCount = database.prepare('SELECT count(*) AS count FROM cue').get()?.count;
    database.exec("UPDATE asset SET status = 'planned', content_hash = NULL");
    assert.throws(() => exportPresentationPackage(database, key), /not ready/);
    assert.deepEqual(exportPresentationPackage(database, key, { allowPlanned: true }).assets, []);
    assert.deepEqual(exportPresentationPackage(database, key, { allowPlanned: true }).cues, []);
    assert.equal(database.prepare('SELECT count(*) AS count FROM cue').get()?.count, cueCount);
    database.exec("UPDATE cue SET channel = 'portrait'");
    assert.throws(() => exportPresentationPackage(database, key, { allowPlanned: true }), /channel differs/);
  } finally {
    database.close();
  }
});

test('ready assets require actual file hash and rights even in a draft', () => {
  const database = createAuthoringDatabase();
  try {
    importAuthoringCsv(database, draftDirectory);
    database.exec("UPDATE asset SET content_hash = '" + 'f'.repeat(64) + "' WHERE asset_id = 'little-post-office-cover'");
    assert.throws(() => exportPresentationPackage(database, key, { allowPlanned: true }), /hash differs/);
    database.exec("UPDATE asset SET license = '' WHERE asset_id = 'little-post-office-cover'");
    assert.throws(() => exportPresentationPackage(database, key, { allowPlanned: true }), /lacks hash or rights/);
    database.exec("UPDATE asset SET license = 'project use', source_path = '../outside.png' WHERE asset_id = 'little-post-office-cover'");
    assert.throws(() => exportPresentationPackage(database, key, { allowPlanned: true }), /bundlePath/);
  } finally {
    database.close();
  }
});

test('cue blocks must belong to the cue scene', () => {
  const database = createAuthoringDatabase();
  try {
    importAuthoringCsv(database, draftDirectory);
    database.exec("UPDATE cue SET trigger = 'before_block', block_id = 'first-letter-body'");
    assert.throws(() => exportPresentationPackage(database, key, { allowPlanned: true }), /another scene/);
  } finally {
    database.close();
  }
});

test('v4 manuscript completes every opening, companion, record, reply and ending combination', () => {
  const database = createAuthoringDatabase();
  try {
    importAuthoringCsv(database, draftDirectory);
    const story = exportRuntimeStory(database, key);
    for (const asksSender of [false, true]) for (const companion of ['shared', 'call', 'solo']) {
      for (const addresses of [false, true]) for (const reply of [false, true]) for (const returned of [false, true]) {
        const withSora = companion !== 'solo';
        const choices = [
          ...(asksSender ? ['ask-sender', 'open-after-answer'] : ['accept-first-letter']),
          ...(companion === 'shared' ? ['show-warning', 'enter-bookshop-together']
            : ['hide-warning', companion === 'call' ? 'call-sora' : 'enter-bookshop-alone']),
          addresses ? 'read-address-book' : 'read-personal-diary',
          ...(reply ? ['write-haejin', 'follow-haejin-map'] : ['leave-before-answer']),
          withSora ? 'walk-with-sora' : 'walk-alone',
          addresses ? 'sort-undelivered-mail' : 'read-yeonwoo-confession',
          addresses ? 'leave-sealed' : 'keep-confession-complete',
          withSora ? 'let-sora-turn-key' : 'turn-key-alone',
          withSora ? 'take-final-mail-together' : 'take-final-mail-alone',
          returned ? 'return-ledger' : 'keep-last-letter',
        ];
        let nodeId = story.startNodeId;
        let flags = initialFlags(story);
        for (const choice of choices) {
          const result = advance(story, nodeId, flags, choice);
          nodeId = result.node.id;
          flags = result.flags;
        }
        assert.equal(nodeId, returned ? 'returned-ending' : 'kept-ending');
        assert.equal(flags['with-sora'], withSora);
      }
    }
    const body = (id: string) => story.nodes.find(node => node.id === id)!.body;
    assert.match(body('first-letter'), /녹슨 열쇠가 무릎 위로 떨어졌다/);
    assert.match(body('first-letter'), /오늘 밤 열두 시/);
    assert.doesNotMatch(body('shared-vigil'), /자신에게 온 봉투/);
    assert.match(body('kept-ending'), /장부를 마지막 칸에 놓아두고/);
  } finally {
    database.close();
  }
});

test('manual insertions follow maximum ordinal after deletion', () => {
  const rows = [{ scene_id: 'a', ordinal: '0' }, { scene_id: 'a', ordinal: '3' }, { scene_id: 'b', ordinal: '8' }];
  assert.equal(nextOrdinal(rows, row => row.scene_id === 'a'), '4');
  assert.equal(nextOrdinal([], () => true), '0');
});

test('reapplying art preserves completed assets and cue order, and sound stop creates no asset', () => {
  const source = tables();
  source.cue[0].ordinal = '4';
  const proposal: Pick<AiProposal, 'scene' | 'art' | 'sound'> = {
    scene: null,
    art: {
      assetId: 'little-post-office-cover', assetType: 'background',
      purpose: '장소', subject: '우체국', composition: '와이드', lighting: '밤', palette: '청색',
      continuityAnchors: [], prompt: '검증', avoid: '문자', altText: '우체국',
      trigger: 'scene_enter', action: 'show', fadeMs: 0,
    },
    sound: { assetId: 'stop-bgm', channel: 'bgm', trigger: 'scene_exit', action: 'stop',
      prompt: '', volume: 0, loop: false, fadeMs: 0, editorialNote: '' },
  };
  const applied = applyProposal(source, 'ten-year-mail', proposal);
  assert.deepEqual(applied.asset, source.asset);
  assert.equal(applied.cue.find(row => row.cue_id === 'little-post-office-cover-cue')?.ordinal, '5');
  assert.equal(applied.cue.find(row => row.cue_id === 'stop-bgm-cue')?.asset_id, '');
  assert.deepEqual(applyProposal(applied, 'ten-year-mail', proposal), applied);
});


test('completed assets are checked even before they are connected to a scene', () => {
  const database = createAuthoringDatabase();
  try {
    importAuthoringCsv(database, draftDirectory);
    database.exec('DELETE FROM cue');
    const originalHash = database.prepare("SELECT content_hash FROM asset WHERE asset_id = 'little-post-office-cover'").get()!.content_hash;
    database.prepare("UPDATE asset SET content_hash = ? WHERE asset_id = 'little-post-office-cover'").run('f'.repeat(64));
    assert.throws(() => exportPresentationPackage(database, key, { allowPlanned: true }), /hash differs: little-post-office-cover/);
    database.prepare("UPDATE asset SET content_hash = ?, source_path = 'assets/nonexistent-image.png' WHERE asset_id = 'little-post-office-cover'").run(originalHash!);
    assert.throws(() => exportPresentationPackage(database, key, { allowPlanned: true }), /missing or unreadable: little-post-office-cover/);
    database.exec("UPDATE asset SET status = 'planned', content_hash = NULL");
    assert.deepEqual(exportPresentationPackage(database, key, { allowPlanned: true }).assets, []);
  } finally {
    database.close();
  }
});

test('planned files can be reserved or blank without leaking placeholder media into runtime', () => {
  const database = createAuthoringDatabase();
  try {
    importAuthoringCsv(database, draftDirectory);
    database.exec("UPDATE asset SET status = 'planned', content_hash = NULL, source_path = 'assets/planned/' || asset_id || '.png'");
    assert.deepEqual(exportPresentationPackage(database, key, { allowPlanned: true }).assets, []);
    assert.deepEqual(exportPresentationPackage(database, key, { allowPlanned: true }).cues, []);
    database.exec("UPDATE asset SET source_path = '' WHERE asset_id = 'little-post-office-cover'");
    assert.deepEqual(exportPresentationPackage(database, key, { allowPlanned: true }).assets, []);
    assert.deepEqual(exportPresentationPackage(database, key, { allowPlanned: true }).cues, []);
    assert.equal(database.prepare("SELECT source_path FROM asset WHERE asset_id = 'little-post-office-cover'").get()!.source_path, '');
  } finally {
    database.close();
  }
});
