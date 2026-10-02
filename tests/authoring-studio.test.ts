import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { removeAuthoringRow } from '../tools/authoring-studio/editing.mjs';
import { readTables, writeTables } from '../scripts/authoring-files';
import type { AiTableRows } from '../scripts/ai-content';

test('authoring studio serves the editor and refuses to mutate a released work', { timeout: 30_000 }, async t => {
  const project = process.cwd();
  const temporary = mkdtempSync(join(tmpdir(), 'story-post-studio-http-'));
  for (const path of ['content/authoring', 'content/ai', 'assets', 'tools/authoring-studio']) {
    cpSync(join(project, path), join(temporary, path), { recursive: true });
  }
  const port = 46_000 + (process.pid % 1_000);
  const origin = `http://127.0.0.1:${port}`;
  const processHandle = spawn(
    process.execPath,
    [join(project, 'node_modules/tsx/dist/cli.mjs'), join(project, 'scripts/authoring-studio.ts')],
    {
      cwd: temporary,
      env: { ...process.env, AUTHORING_STUDIO_PORT: String(port), OPENAI_API_KEY: 'sk-proj-test-fixture-no-external-calls', STORY_AI_PROVIDER: 'mock', STORY_IMAGE_PROVIDER: 'mock' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  t.after(() => {
    processHandle.kill('SIGTERM');
    rmSync(temporary, { recursive: true, force: true });
  });
  let output = '';
  const capture = (chunk: Buffer) => { output = (output + chunk.toString()).slice(-4000); };
  processHandle.stdout?.on('data', capture);
  processHandle.stderr?.on('data', capture);

  let response: Response | undefined;
  const readyDeadline = Date.now() + 12_000;
  while (Date.now() < readyDeadline) {
    if (processHandle.exitCode !== null) break;
    try {
      response = await fetch(`${origin}/api/works`);
      if (response.ok) break;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  assert.ok(response?.ok, `studio server did not become ready: ${output}`);
  const works = await response.json() as { directory: string; status: string }[];
  const released = works.find(work => work.status === 'released');
  const draft = works.find(work => work.status === 'draft');
  assert.ok(released);
  assert.ok(draft);

  const capabilities = await fetch(`${origin}/api/ai/capabilities`);
  assert.equal(capabilities.status, 200);
  const capabilityResult = await capabilities.json() as { content: { available: boolean }; image: { available: boolean } };
  assert.equal(capabilityResult.content.available, true);
  assert.equal(capabilityResult.image.available, true);

  const settingsResponse = await fetch(`${origin}/api/settings/ai`);
  assert.equal(settingsResponse.status, 200);
  const settings = await settingsResponse.json() as {
    credential: { configured: boolean; source: string; maskedKey: string | null };
    content: { available: boolean };
    image: { available: boolean };
    accountReuseSupported: boolean;
  };
  assert.equal(settings.content.available, true);
  assert.equal(settings.image.available, true);
  assert.equal(settings.accountReuseSupported, false);
  assert.equal('apiKey' in settings.credential, false);

  const invalidKeyResponse = await fetch(`${origin}/api/settings/ai`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ apiKey: 'not-a-key' }),
  });
  assert.equal(invalidKeyResponse.status, 400);

  const page = await fetch(origin);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Story Post — 제작실/);

  const workResponse = await fetch(`${origin}/api/work?directory=${encodeURIComponent(released.directory)}`);
  assert.equal(workResponse.status, 200);
  const work = await workResponse.json() as { tables: unknown };
  const saveResponse = await fetch(`${origin}/api/work?directory=${encodeURIComponent(released.directory)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ tables: work.tables }),
  });
  assert.equal(saveResponse.status, 409);
  assert.deepEqual(await saveResponse.json(), {
    error: 'Released work is read-only. Clone it as a new version.',
  });

  const draftResponse = await fetch(`${origin}/api/work?directory=${encodeURIComponent(draft.directory)}`);
  const draftWork = await draftResponse.json() as { tables: AiTableRows; revision: string };
  assert.match(draftWork.revision, /^[a-f0-9]{64}$/);
  const missingRevision = await fetch(`${origin}/api/work?directory=${encodeURIComponent(draft.directory)}`, {
    method: 'PUT', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ tables: draftWork.tables }),
  });
  assert.equal(missingRevision.status, 428);
  const staleRevision = await fetch(`${origin}/api/work?directory=${encodeURIComponent(draft.directory)}`, {
    method: 'PUT', headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ tables: draftWork.tables, expectedRevision: '0'.repeat(64) }),
  });
  assert.equal(staleRevision.status, 409);
  assert.equal((await staleRevision.json() as { code: string }).code, 'work_conflict');

  const invalidTables = structuredClone(draftWork.tables);
  invalidTables.choice[0].next_scene_id = 'missing-test-scene';
  const invalidSave = await fetch(`${origin}/api/work?directory=${encodeURIComponent(draft.directory)}`, {
    method: 'PUT', headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ tables: invalidTables, expectedRevision: draftWork.revision }),
  });
  assert.equal(invalidSave.status, 400);
  assert.match((await invalidSave.json() as { error: string }).error, /선택지.*missing-test-scene.*장면 ID/);
  const unchangedDraft = await fetch(`${origin}/api/work?directory=${encodeURIComponent(draft.directory)}`);
  assert.deepEqual((await unchangedDraft.json() as { tables: unknown }).tables, draftWork.tables);

  const validateResponse = await fetch(`${origin}/api/validate`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ directory: draft.directory, tables: draftWork.tables }),
  });
  assert.equal(validateResponse.status, 200);
  const validated = await validateResponse.json() as { report: string; graph: string; revision:string; validatedAt:string };
  assert.match(validated.graph, /ten-year-mail/);
  assert.equal(validated.revision,draftWork.revision);
  assert.equal(Number.isFinite(Date.parse(validated.validatedAt)),true);
  const invalidValidation = await fetch(`${origin}/api/validate`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ directory: draft.directory, tables: invalidTables }),
  });
  assert.equal(invalidValidation.status, 400);
  assert.deepEqual((await (await fetch(`${origin}/api/work?directory=${encodeURIComponent(draft.directory)}`)).json() as { tables: unknown }).tables, draftWork.tables);

  const damaged = readTables(join(temporary,draft.directory));
  damaged.choice[0].next_scene_id = 'repairable-missing-scene';
  writeTables(join(temporary,draft.directory),damaged);
  const repairableResponse = await fetch(`${origin}/api/work?directory=${encodeURIComponent(draft.directory)}`);
  assert.equal(repairableResponse.status,200);
  const repairable = await repairableResponse.json() as {tables:AiTableRows;revision:string;preview:{error:string}};
  assert.match(repairable.preview.error,/repairable-missing-scene/);
  assert.equal(repairable.tables.choice[0].next_scene_id,'repairable-missing-scene');
  const repairedSave = await fetch(`${origin}/api/work?directory=${encodeURIComponent(draft.directory)}`,{
    method:'PUT',headers:{'content-type':'application/json',origin},
    body:JSON.stringify({tables:draftWork.tables,expectedRevision:repairable.revision}),
  });
  assert.equal(repairedSave.status,200);
  const repaired = await repairedSave.json() as {preview:{error?:string}};
  assert.equal(repaired.preview.error,undefined);

  const mismatchedCue = structuredClone(draftWork.tables);
  mismatchedCue.cue[0].channel = 'voice';
  const invalidDirection = await fetch(`${origin}/api/validate`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ directory: draft.directory, tables: mismatchedCue }),
  });
  assert.equal(invalidDirection.status, 400);
  assert.match((await invalidDirection.json() as { error: string }).error, /연출 종류와 에셋 종류.*ten-year-mail-cover/);

  const deletion = removeAuthoringRow(readTables(draft.directory),'choice','call-sora');
  const validDeletion = await fetch(`${origin}/api/validate`, {
    method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({directory:draft.directory,tables:deletion.tables}),
  });
  assert.equal(validDeletion.status,200);

  const disconnectedDeletion = removeAuthoringRow(readTables(draft.directory),'choice','ask-sender');
  const refusedDeletion = await fetch(`${origin}/api/validate`, {
    method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({directory:draft.directory,tables:disconnectedDeletion.tables}),
  });
  assert.equal(refusedDeletion.status,400);
  assert.match((await refusedDeletion.json() as {error:string}).error,/연결이 끊긴 장면.*sora-answer/);
  const wrongIdentity = structuredClone(draftWork.tables);
  wrongIdentity.story_work[0].working_version = '999';
  const refusedIdentity = await fetch(`${origin}/api/validate`, {
    method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({directory:draft.directory,tables:wrongIdentity}),
  });
  assert.equal(refusedIdentity.status,400);
  assert.match((await refusedIdentity.json() as {error:string}).error,/작품 ID·버전·언어/);

  const storyPreviewResponse = await fetch(`${origin}/api/preview`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ directory: draft.directory, tables: draftWork.tables, choiceIds: [] }),
  });
  assert.equal(storyPreviewResponse.status, 200);
  const previewRun = await storyPreviewResponse.json() as { node: { id: string }; choices: unknown[]; background: { url: string };revision:string;previewedAt:string };
  assert.equal(previewRun.revision,draftWork.revision);
  assert.ok(Number.isFinite(Date.parse(previewRun.previewedAt)));
  assert.equal(previewRun.node.id, draftWork.tables.story_work[0].start_scene_id);
  assert.equal(previewRun.choices.length, 2);
  const assetPreview = await fetch(`${origin}${previewRun.background.url}`);
  assert.equal(assetPreview.status, 200);
  assert.equal(assetPreview.headers.get('content-type'), 'image/jpeg');
  assert.ok((await assetPreview.arrayBuffer()).byteLength > 1_000);
  const inspectImage = await fetch(`${origin}/api/asset-inspect`,{
    method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({path:'assets/little-post-office-cover.jpg'}),
  });
  assert.equal(inspectImage.status,200);
  const inspectedImage = await inspectImage.json() as {hash:string;bytes:number;mimeType:string};
  assert.equal(inspectedImage.hash,draftWork.tables.asset.find(asset => asset.asset_id === 'little-post-office-cover')!.content_hash);
  assert.equal(inspectedImage.mimeType,'image/jpeg');
  assert.ok(inspectedImage.bytes > 1000);
  const badInspectionOrigin = await fetch(`${origin}/api/asset-inspect`,{
    method:'POST',headers:{'content-type':'application/json',origin:'https://example.com'},body:JSON.stringify({path:'assets/little-post-office-cover.jpg'}),
  });
  assert.equal(badInspectionOrigin.status,403);
  const missingImageFile = await fetch(`${origin}/api/asset-inspect`,{
    method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({path:'assets/nonexistent-image.png'}),
  });
  assert.equal(missingImageFile.status,400);
  assert.match((await missingImageFile.json() as {error:string}).error,/파일 위치/);
  const wrongHash = await fetch(`${origin}/api/asset-preview?path=assets/little-post-office-cover.jpg&hash=${'0'.repeat(64)}`);
  assert.equal(wrongHash.status, 409);
  const traversal = await fetch(`${origin}/api/asset-preview?path=assets/../README.md&hash=${'0'.repeat(64)}`);
  assert.equal(traversal.status, 400);
  const invalidPreview = await fetch(`${origin}/api/preview`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ directory: draft.directory, tables: draftWork.tables, choiceIds: ['missing-choice'] }),
  });
  assert.equal(invalidPreview.status, 400);
  const afterPreview = await fetch(`${origin}/api/work?directory=${encodeURIComponent(draft.directory)}`);
  assert.deepEqual((await afterPreview.json() as { tables: AiTableRows }).tables, draftWork.tables);

  const editedTables = structuredClone(draftWork.tables);
  editedTables.scene[0].notes = '첫 번째 탭의 저장';
  const validSave = await fetch(`${origin}/api/work?directory=${encodeURIComponent(draft.directory)}`, {
    method: 'PUT', headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ tables: editedTables, expectedRevision: draftWork.revision }),
  });
  assert.equal(validSave.status, 200);
  const savedWork = await validSave.json() as { revision: string };
  assert.notEqual(savedWork.revision, draftWork.revision);
  const secondTabSave = await fetch(`${origin}/api/work?directory=${encodeURIComponent(draft.directory)}`, {
    method: 'PUT', headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ tables: draftWork.tables, expectedRevision: draftWork.revision }),
  });
  assert.equal(secondTabSave.status, 409);
  const afterConflict = await fetch(`${origin}/api/work?directory=${encodeURIComponent(draft.directory)}`);
  assert.deepEqual((await afterConflict.json() as { tables: AiTableRows }).tables, editedTables);


  const missingCloneRevision = await fetch(`${origin}/api/clone`, {
    method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({sourceDirectory:draft.directory,newVersion:5}),
  });
  assert.equal(missingCloneRevision.status,428);
  const staleClone = await fetch(`${origin}/api/clone`, {
    method:'POST',headers:{'content-type':'application/json',origin},
    body:JSON.stringify({sourceDirectory:draft.directory,newVersion:5,expectedRevision:draftWork.revision}),
  });
  assert.equal(staleClone.status,409);
  const cloneResponse = await fetch(`${origin}/api/clone`, {
    method:'POST',headers:{'content-type':'application/json',origin},
    body:JSON.stringify({sourceDirectory:draft.directory,newVersion:5,expectedRevision:savedWork.revision}),
  });
  assert.equal(cloneResponse.status,201);
  const cloned = await cloneResponse.json() as {directory:string;workingVersion:number};
  assert.equal(cloned.workingVersion,5);
  const clonedWork = await (await fetch(`${origin}/api/work?directory=${encodeURIComponent(cloned.directory)}`)).json() as {tables:AiTableRows};
  assert.equal(clonedWork.tables.story_work[0].status,'draft');
  assert.equal(clonedWork.tables.story_work[0].working_version,'5');
  assert.equal(clonedWork.tables.content_block[0].text,editedTables.content_block[0].text);
  assert.deepEqual(clonedWork.tables.release_candidate,[]);
  assert.deepEqual(clonedWork.tables.asset,editedTables.asset);
  const duplicateClone = await fetch(`${origin}/api/clone`, {
    method:'POST',headers:{'content-type':'application/json',origin},
    body:JSON.stringify({sourceDirectory:draft.directory,newVersion:5,expectedRevision:savedWork.revision}),
  });
  assert.equal(duplicateClone.status,400);

  const aiResponse = await fetch(`${origin}/api/ai/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({
      directory: draft.directory,
      task: 'art_direction',
      brief: '첫 장면의 고요한 불안을 보여줘',
      sceneId: draftWork.tables.scene[0].scene_id,
      tables: draftWork.tables,
    }),
  });
  assert.equal(aiResponse.status, 200);
  const aiResult = await aiResponse.json() as { proposal: { art: { assetId: string; assetType: string } | null }; meta: { provider: string } };
  assert.equal(aiResult.meta.provider, 'mock');
  assert.ok(aiResult.proposal.art?.assetId);

  const imageResponse = await fetch(`${origin}/api/ai/image-generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({
      directory: draft.directory,
      sceneId: draftWork.tables.scene[0].scene_id,
      rendition: 'draft',
      art: aiResult.proposal.art,
    }),
  });
  assert.equal(imageResponse.status, 200);
  const imageResult = await imageResponse.json() as { runId: string; previewUrl: string; provider: string; prompt: string };
  assert.equal(imageResult.provider, 'mock');
  assert.match(imageResult.prompt, /연속성 고정 요소:/);
  const previewResponse = await fetch(`${origin}${imageResult.previewUrl}`);
  assert.equal(previewResponse.status, 200);
  assert.equal(previewResponse.headers.get('content-type'), 'image/jpeg');
  assert.ok((await previewResponse.arrayBuffer()).byteLength > 1_000);
});
