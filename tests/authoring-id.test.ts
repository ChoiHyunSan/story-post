import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextId } from '../tools/authoring-studio/proposal.mjs';

test('generated IDs stay within the engine limit for maximum-length scene names', () => {
  const prefix = `${'s'.repeat(64)}-block`;
  const rows: Record<string,string>[] = [];
  for (let i = 0; i < 110; i++) {
    const id = nextId(prefix, rows, 'block_id');
    assert.match(id, /^[a-z][a-z0-9-]{0,63}$/);
    assert.equal(rows.some(row => row.block_id === id), false);
    rows.push({ block_id:id });
  }
  const before = structuredClone(rows);
  rows.splice(0,1);
  const id = nextId(prefix, rows, 'block_id');
  assert.equal(rows.some(row => row.block_id === id), false);
  assert.equal(before.length, 110);
  assert.equal(nextId('asset', [], 'asset_id'), 'asset-01');
});
