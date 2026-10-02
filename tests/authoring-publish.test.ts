import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { publishWorkTables, readTables } from '../scripts/authoring-files';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'story-post-publish-'));
  const directory = join(root, 'new-work');
  const path = join(root, 'manifest.json');
  const expected = '[{"directory":"source"}]\n';
  const updated = '[{"directory":"source"},{"directory":"new-work"}]\n';
  writeFileSync(path, expected);
  return { root, directory, manifest: { path, expected, updated }, tables: readTables('content/authoring/works/little-post-office-v4') };
}

test('work publication registers complete CSV tables without changing the source snapshot', () => {
  const data = fixture();
  const before = structuredClone(data.tables);
  try {
    publishWorkTables(data.directory, data.tables, data.manifest);
    assert.deepEqual(readTables(data.directory), before);
    assert.deepEqual(data.tables, before);
    assert.equal(readFileSync(data.manifest.path, 'utf8'), data.manifest.updated);
    assert.deepEqual(readdirSync(data.root).sort(), ['manifest.json', 'new-work']);
  } finally { rmSync(data.root, { recursive: true, force: true }); }
});

test('manifest publication failure removes the unregistered clone and preserves the old manifest', () => {
  const data = fixture();
  let calls = 0;
  try {
    assert.throws(() => publishWorkTables(data.directory, data.tables, data.manifest, (source, destination) => {
      if (++calls === 2) throw new Error('manifest rename failed');
      renameSync(source, destination);
    }), /manifest rename failed/);
    assert.equal(readFileSync(data.manifest.path, 'utf8'), data.manifest.expected);
    assert.deepEqual(readdirSync(data.root), ['manifest.json']);
    publishWorkTables(data.directory, data.tables, data.manifest);
    assert.deepEqual(readTables(data.directory), data.tables);
  } finally { rmSync(data.root, { recursive: true, force: true }); }
});

test('directory publication failure leaves no incomplete work or manifest temporary files', () => {
  const data = fixture();
  try {
    assert.throws(() => publishWorkTables(data.directory, data.tables, data.manifest, () => { throw new Error('directory rename failed'); }), /directory rename failed/);
    assert.equal(readFileSync(data.manifest.path, 'utf8'), data.manifest.expected);
    assert.deepEqual(readdirSync(data.root), ['manifest.json']);
  } finally { rmSync(data.root, { recursive: true, force: true }); }
});

test('a changed manifest is preserved both before and after directory publication', () => {
  for (const changeAfterPublication of [false, true]) {
    const data = fixture();
    const external = '[{"directory":"source"},{"directory":"external-work"}]\n';
    try {
      if (!changeAfterPublication) writeFileSync(data.manifest.path, external);
      assert.throws(() => publishWorkTables(data.directory, data.tables, data.manifest, (source, destination) => {
        renameSync(source, destination);
        writeFileSync(data.manifest.path, external);
      }), /목록이 변경/);
      assert.equal(readFileSync(data.manifest.path, 'utf8'), external);
      assert.deepEqual(readdirSync(data.root), ['manifest.json']);
    } finally { rmSync(data.root, { recursive: true, force: true }); }
  }
});

test('an existing work directory is preserved instead of being replaced', () => {
  const data = fixture();
  try {
    publishWorkTables(data.directory, data.tables, data.manifest);
    const previous = readFileSync(data.manifest.path, 'utf8');
    assert.throws(() => publishWorkTables(data.directory, data.tables, data.manifest), /이미 있습니다/);
    assert.equal(readFileSync(data.manifest.path, 'utf8'), previous);
    assert.deepEqual(readTables(data.directory), data.tables);
  } finally { rmSync(data.root, { recursive: true, force: true }); }
});
