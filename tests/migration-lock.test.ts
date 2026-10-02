import assert from 'node:assert/strict';
import test from 'node:test';
import { serializeMigrationLock, validateMigrationLock } from '../scripts/migration-lock';

const first = 'a'.repeat(64);
const second = 'b'.repeat(64);

test('migration lock accepts unchanged migrations and newly appended versions', () => {
  assert.doesNotThrow(() => validateMigrationLock(
    { '001_initial.sql': first, '002_add-index.sql': second },
    { '001_initial.sql': first },
  ));
});

test('migration lock rejects changed or removed applied migrations', () => {
  assert.throws(() => validateMigrationLock(
    { '001_initial.sql': second }, { '001_initial.sql': first },
  ), /Immutable migration changed or removed/);
  assert.throws(() => validateMigrationLock({}, { '001_initial.sql': first }),
    /Immutable migration changed or removed/);
});

test('migration lock rejects malformed files, hashes and top-level values', () => {
  assert.throws(() => validateMigrationLock({}, []), /Invalid migration lock/);
  assert.throws(() => validateMigrationLock({}, { '../001.sql': first }), /Invalid migration lock/);
  assert.throws(() => validateMigrationLock({}, { '001_initial.sql': 'not-a-hash' }), /Invalid migration lock/);
  assert.equal(serializeMigrationLock({ '001_initial.sql': first }),
    `${JSON.stringify({ '001_initial.sql': first }, null, 2)}\n`);
});
