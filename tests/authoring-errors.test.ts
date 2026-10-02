import assert from 'node:assert/strict';
import { test } from 'node:test';
import { studioErrorMessage } from '../scripts/authoring-errors';

test('presentation validation identifies the cue and corrective field in Korean', () => {
  assert.equal(studioErrorMessage(new Error('Presentation cue channel differs from asset type: opening-cover')),
    '연출 종류와 에셋 종류가 다릅니다. 대상 opening-cover의 설정을 확인하세요.');
  assert.match(studioErrorMessage(new Error('Presentation action is invalid for channel: bell')), /연출 종류.*동작.*bell/);
  assert.match(studioErrorMessage(new Error('Visual presentation cue cannot use volume or loop: cover')), /음량.*반복.*cover/);
  assert.equal(studioErrorMessage(new Error('원본은 보존했습니다.')), '원본은 보존했습니다.');
  assert.match(studioErrorMessage(new Error('Cycle')), /장면 연결이 순환/);
  assert.match(studioErrorMessage(new Error('Conditions make nodes unreachable')), /선택 조건.*도달/);
  assert.match(studioErrorMessage(new Error('Dead end: tide-road')), /선택지.*tide-road/);
  assert.equal(studioErrorMessage(null), '제작실 요청을 처리하지 못했습니다.');
});


test('asset preparation errors keep the asset ID and identify a corrective field', () => {
  assert.match(studioErrorMessage(new Error('Ready asset lacks hash or rights: cover')), /해시.*권리.*cover/);
  assert.match(studioErrorMessage(new Error('Asset hash differs: cover')), /SHA-256.*갱신.*cover/);
  assert.match(studioErrorMessage(new Error('Asset file is missing or unreadable: cover')), /파일 위치.*cover/);
});
