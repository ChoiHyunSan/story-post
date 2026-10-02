import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readTables } from '../scripts/authoring-files';
import { presentationPackageSchema } from '../src/content/presentation-package';
import { assetImagePreview, channelActions, fieldOptions, preserveCurrentOption, sceneLabel } from '../tools/authoring-studio/fields.mjs';

const tables = () => readTables('content/authoring/works/little-post-office-v4');

test('destination options retain stable IDs while showing sorted scene titles', () => {
  const source = tables();
  source.scene.reverse();
  const before = structuredClone(source);
  const options = fieldOptions('next_scene_id', source)!;
  assert.deepEqual(options[0], ['', '장면을 선택하세요']);
  assert.equal(options[1][0], 'ten-year-mail');
  assert.match(options[1][1], /작은 세계 우체국의 소라/);
  assert.deepEqual(source, before);
  assert.match(sceneLabel(source.scene.find(row => row.scene_type === 'ending')!), /결말/);
});

test('cue references stay inside the selected scene and channel', () => {
  const source = tables();
  source.asset.push({ ...source.asset[0], asset_id: 'planned-voice', asset_type: 'voice' });
  const row = { cue_id: 'test-cue', scene_id: 'first-letter', channel: 'voice' };
  const assets = fieldOptions('asset_id', source, row)!;
  assert.deepEqual(assets.map(([id]) => id), ['', 'planned-voice']);
  assert.deepEqual(fieldOptions('block_id', source, row)!.map(([id]) => id), ['', 'first-letter-body']);
  assert.deepEqual(fieldOptions('choice_id', source, row)!.map(([id]) => id), ['', 'show-warning', 'hide-warning']);
  assert.equal(fieldOptions('asset_id', source, source.asset[0]), null);
});

test('unknown connections remain visible instead of silently replacing manuscript values', () => {
  const options = fieldOptions('action', tables(), { channel: 'sfx' })!;
  const before = structuredClone(options);
  const preserved = preserveCurrentOption(options, 'show')!;
  assert.deepEqual(preserved[0], ['show','등록되지 않은 값: show']);
  assert.deepEqual(options, before);
  assert.equal(preserveCurrentOption(options, 'play'), options);
  assert.equal(preserveCurrentOption(null, 'plain text'), null);
});

test('media and trigger options match the runtime presentation contract', () => {
  const source = tables();
  assert.deepEqual(channelActions.background, ['show','hide','swap','fade_in','fade_out','crossfade']);
  assert.deepEqual(channelActions.portrait, ['show','hide','swap','fade_in','fade_out','crossfade']);
  const cue = presentationPackageSchema.shape.cues.element.shape;
  assert.deepEqual(fieldOptions('channel', source)!.map(([id]) => id), [...cue.channel.options]);
  assert.deepEqual(fieldOptions('trigger', source)!.map(([id]) => id), [...cue.trigger.options]);
  for (const channel of cue.channel.options) {
    assert.deepEqual(fieldOptions('action', source, { channel })!.map(([id]) => id), channelActions[channel]);
    for (const action of channelActions[channel]) assert.equal(cue.action.safeParse(action).success, true);
  }
});


test('asset image previews require completed visual metadata and stay inside the local image endpoint', () => {
  const asset = tables().asset[0];
  const before = structuredClone(asset);
  assert.match(assetImagePreview(asset)!.url, /^\/api\/asset-preview\?path=assets%2F/);
  assert.equal(assetImagePreview(asset)!.altText,asset.alt_text);
  const overrides: Record<string, string>[] = [
    {status:'planned'}, {status:'missing'}, {asset_type:'voice'}, {source_path:'../outside.png'},
    {source_path:'https://example.com/picture.png'}, {source_path:'assets/unsafe.svg'}, {content_hash:'bad'},
  ];
  for (const override of overrides) assert.equal(assetImagePreview({...asset,...override}),null);
  assert.deepEqual(asset,before);
});
