import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authoringHeaders } from '../scripts/authoring-contract';
import { readTables } from '../scripts/authoring-files';
import { createBackup, readBackup, maximumBackupBytes } from '../tools/authoring-studio/backup.mjs';

type BackupEnvelope = { tables: Record<string, Record<string, unknown>[]>; [key: string]: unknown };
const tables = () => readTables('content/authoring/works/little-post-office-v4');
const exportedAt = new Date('2026-10-01T00:00:00.000Z');

test('backups round-trip unsaved text, flags and cues without retaining unrelated settings', () => {
  const source = tables();
  source.scene[0].notes = '아직 저장하지 않은 메모';
  source.content_block[0].text = '편지에 남은 줄바꿈\n두 번째 문장';
  const text = createBackup(source, authoringHeaders, exportedAt);
  const envelope = JSON.parse(text);
  assert.equal(envelope.exportedAt, exportedAt.toISOString());
  assert.deepEqual(Object.keys(envelope), ['format', 'version', 'exportedAt', 'work', 'tables']);
  const result = readBackup(text, tables(), authoringHeaders);
  assert.deepEqual(result, source);
  result.scene[0].notes = '복원 뒤 변경';
  assert.equal(source.scene[0].notes, '아직 저장하지 않은 메모');
});

test('backups reject a different work, version or language', () => {
  const text = createBackup(tables(), authoringHeaders);
  for (const [field, value] of [['story_id','other-story'], ['working_version','5'], ['locale','en']]) {
    const target = tables();
    target.story_work[0][field] = value;
    assert.throws(() => readBackup(text, target, authoringHeaders), /작품·버전·언어/);
  }
});

test('released source and destination backups cannot be restored', () => {
  const released = tables();
  released.story_work[0].status = 'released';
  assert.throws(() => readBackup(createBackup(released, authoringHeaders), tables(), authoringHeaders), /배포본/);
  assert.throws(() => readBackup(createBackup(tables(), authoringHeaders), released, authoringHeaders), /배포본/);
});

test('backup identity cannot hide changed table identity', () => {
  const envelope = JSON.parse(createBackup(tables(), authoringHeaders));
  envelope.work.storyId = 'another-story';
  assert.throws(() => readBackup(JSON.stringify(envelope), tables(), authoringHeaders), /작품·버전·언어/);
});

test('unknown tables, columns, malformed cells and extra metadata are rejected', () => {
  const changes = [
    (value: BackupEnvelope) => { value.tables.unregistered = []; },
    (value: BackupEnvelope) => { value.tables.scene[0].apiKey = 'must-not-be-imported'; },
    (value: BackupEnvelope) => { delete value.tables.scene[0].notes; },
    (value: BackupEnvelope) => { value.tables.scene[0].notes = { nested: true }; },
    (value: BackupEnvelope) => { value.connection = {}; },
    (value: BackupEnvelope) => { value.exportedAt = 'not-a-date'; },
  ];
  for (const change of changes) {
    const envelope = JSON.parse(createBackup(tables(), authoringHeaders));
    change(envelope);
    assert.throws(() => readBackup(JSON.stringify(envelope), tables(), authoringHeaders));
  }
});

test('malformed and oversized backup files fail before table validation', () => {
  assert.throws(() => readBackup('{', tables(), authoringHeaders), /JSON/);
  assert.throws(() => readBackup('한'.repeat(Math.ceil(maximumBackupBytes / 3)), tables(), authoringHeaders), /5MB/);
  const source = tables();
  source.scene[0].notes = 'x'.repeat(50001);
  assert.throws(() => createBackup(source, authoringHeaders), /값/);
  source.scene = Array.from({ length: 5001 }, () => source.scene[0]);
  assert.throws(() => createBackup(source, authoringHeaders), /행 수/);
});
