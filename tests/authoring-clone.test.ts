import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readTables } from '../scripts/authoring-files';
import { createSession, markEdited } from '../tools/authoring-studio/session.mjs';
import { canOpenClone, cloneAndRefresh } from '../tools/authoring-studio/clone.mjs';

const payload = {sourceDirectory:'v4',expectedRevision:'a'.repeat(64),newVersion:5};
const entry = {directory:'v5',workingVersion:5};

test('refresh failure preserves a successful clone and does not resubmit publication', async () => {
  let submissions = 0;
  const published = new Set<string>();
  const result = await cloneAndRefresh(payload,async body => {
    submissions++;
    assert.deepEqual(body,payload);
    published.add(entry.directory);
    return entry;
  },async target => {
    assert.equal(published.has(target.directory),true);
    throw new Error('list network failure');
  });
  assert.equal(submissions,1);
  assert.equal(published.has('v5'),true);
  assert.deepEqual(result,{entry,refreshError:'list network failure'});
  assert.equal(payload.newVersion,5);
});

test('a failed publication does not claim a created work or try to refresh it', async () => {
  let refreshes = 0;
  await assert.rejects(cloneAndRefresh(payload,async () => {throw new Error('stale source');},async () => {refreshes++;}),/stale source/);
  assert.equal(refreshes,0);
});

test('normal refresh selects the returned work and unknown failures remain recoverable', async () => {
  const selected:string[] = [];
  assert.deepEqual(await cloneAndRefresh(payload,async () => entry,async target => {selected.push(target.directory);}),{entry,refreshError:null});
  assert.deepEqual(selected,['v5']);
  assert.match((await cloneAndRefresh(payload,async () => entry,async () => {throw null;})).refreshError!,/작품 목록/);
});


test('edits or newer loading while the list refreshes prevent replacing the editor with the clone', () => {
  const empty = createSession();
  assert.equal(canOpenClone(empty,empty),false);
  for (const change of ['edit','loading','sequence','document','restoring'] as const) {
    const session = createSession();
    session.current = {entry:{directory:'v4'},tables:readTables('content/authoring/works/little-post-office-v4'),revision:'source',preview:null};
    const context = {current:session.current,revision:session.revision,loadSequence:session.loadSequence};
    assert.equal(canOpenClone(session,context),true);
    if (change === 'edit') {session.current.tables.scene[0].notes='preserved';markEdited(session);}
    if (change === 'loading') session.isLoading=true;
    if (change === 'sequence') session.loadSequence++;
    if (change === 'document') session.current=structuredClone(session.current);
    if (change === 'restoring') session.isRestoring=true;
    assert.equal(canOpenClone(session,context),false);
    if (change === 'edit') assert.equal(session.current.tables.scene[0].notes,'preserved');
  }
});
