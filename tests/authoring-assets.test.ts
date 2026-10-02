import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { readImageAsset } from '../scripts/authoring-assets';

test('local image inspection returns the actual bytes, MIME type and deterministic hash', () => {
  for (const [path,mimeType] of [
    ['assets/little-post-office-cover.jpg','image/jpeg'],
    ['assets/little-post-office-tide-road-v2.png','image/png'],
  ]) {
    const before = readFileSync(path);
    const result = readImageAsset(path);
    assert.equal(result.mimeType,mimeType);
    assert.equal(result.bytes,before.length);
    assert.equal(result.hash,createHash('sha256').update(before).digest('hex'));
    assert.deepEqual(result.data,before);
    assert.deepEqual(readFileSync(path),before);
  }
});

test('inspection refuses traversal, remote paths, symlinks outside assets and mismatched image headers', t => {
  const temporary = mkdtempSync(join(tmpdir(),'story-post-image-inspect-'));
  t.after(() => rmSync(temporary,{recursive:true,force:true}));
  mkdirSync(join(temporary,'assets'));
  cpSync('assets/little-post-office-cover.jpg',join(temporary,'outside.jpg'));
  symlinkSync(join(temporary,'outside.jpg'),join(temporary,'assets/linked.jpg'));
  for (const path of ['../outside.jpg','assets/../outside.jpg','https://example.com/image.png','assets/unsafe.svg']) {
    assert.throws(() => readImageAsset(path,temporary),/파일 위치/);
  }
  assert.throws(() => readImageAsset('assets/linked.jpg',temporary),/이미지 경로/);
  assert.throws(() => readImageAsset('assets/missing.png',temporary),/파일을 찾거나 읽을/);
  writeFileSync(join(temporary,'assets/false.png'),'this is text, not a PNG');
  assert.throws(() => readImageAsset('assets/false.png',temporary),/내용과 확장자/);
  cpSync('assets/little-post-office-cover.jpg',join(temporary,'assets/incorrect.png'));
  assert.throws(() => readImageAsset('assets/incorrect.png',temporary),/내용과 확장자/);
  writeFileSync(join(temporary,'assets/large.png'),'');
  truncateSync(join(temporary,'assets/large.png'),20*1024*1024+1);
  assert.throws(() => readImageAsset('assets/large.png',temporary),/파일 크기/);
});
