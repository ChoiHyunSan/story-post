import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { URL } from 'node:url';
import { z } from 'zod';
import { aiCapabilities, aiTaskSchema, generateAiProposal } from './ai-content';
import { aiCredentialStatus, deleteOpenAiApiKey, saveOpenAiApiKey } from './ai-credentials';
import {
  adoptStoryImage,
  generateStoryImage,
  imageAdoptRequestSchema,
  imageCapabilities,
  imageGenerateRequestSchema,
  readImagePreview,
} from './ai-image';
import type { Story } from '../src/engine/story';
import type { PresentationPackage } from '../src/content/presentation-package';
import { studioErrorMessage } from './authoring-errors';
import { imageAssetPath, readImageAsset } from './authoring-assets';
import { previewStory } from './authoring-preview';
import { authoringHeaders, type AuthoringTable } from './authoring-contract';
import { importAuthoringCsv } from './authoring-csv';
import { publishWorkTables, readTables, replaceWorkTables, tablesRevision, writeTables, type TableRows } from './authoring-files';
import { loadAuthoringManifest, type AuthoringManifestEntry } from './authoring-manifest';
import { buildBranchGraph, buildProductionReport } from './authoring-report';
import {
  createAuthoringDatabase,
  exportPresentationPackage,
  exportRuntimeStory,
} from './authoring-store';

const host = '127.0.0.1';
const port = Number(process.env.AUTHORING_STUDIO_PORT ?? 4179);
const studioRoot = 'tools/authoring-studio';
const maximumBodyBytes = 5 * 1024 * 1024;
const cloneRequest = z.object({
  sourceDirectory: z.string(),
  newVersion: z.number().int().positive(),
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict();
const aiGenerateRequest = z.object({
  directory: z.string(),
  task: aiTaskSchema,
  brief: z.string().max(4000),
  sceneId: z.string(),
  tables: z.unknown(),
}).strict();
const validateRequest = z.object({ directory: z.string(), tables: z.unknown() }).strict();
const previewRequest = z.object({
  directory: z.string(), tables: z.unknown(), choiceIds: z.array(z.string().max(64)).max(200),
}).strict();
const assetPreviewRequest = z.object({
  path: imageAssetPath,
  hash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
const aiSettingsRequest = z.object({ apiKey: z.string().max(512) }).strict();


function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
}

function staticFile(response: ServerResponse, path: string): void {
  if (!existsSync(path)) {
    response.writeHead(404); response.end('Not found'); return;
  }
  const contentType = extname(path) === '.css' ? 'text/css; charset=utf-8'
    : ['.js', '.mjs'].includes(extname(path)) ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8';
  response.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-store' });
  response.end(readFileSync(path));
}

async function requestJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maximumBodyBytes) throw new Error('Request is too large');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

function manifestEntry(directory: string): AuthoringManifestEntry {
  const entry = loadAuthoringManifest().find(item => item.directory === directory);
  if (!entry) throw new Error('Unknown authoring work');
  return entry;
}

function normalizedTables(input: unknown): TableRows {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid table payload');
  const source = input as Record<string, unknown>;
  const result = {} as TableRows;
  for (const [table, headers] of Object.entries(authoringHeaders) as [AuthoringTable, readonly string[]][]) {
    const rows = source[table];
    if (!Array.isArray(rows) || rows.length > 5000) throw new Error(`Invalid rows for ${table}`);
    result[table] = rows.map((row, rowIndex) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`Invalid ${table} row ${rowIndex + 1}`);
      const record = row as Record<string, unknown>;
      return Object.fromEntries(headers.map(header => {
        const value = record[header];
        if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) {
          throw new Error(`Invalid ${table}.${header}`);
        }
        return [header, value === null || value === undefined ? '' : String(value)];
      }));
    });
  }
  return result;
}

function assertWorkIdentity(tables: TableRows, entry: AuthoringManifestEntry) {
  const work = tables.story_work[0];
  if (tables.story_work.length !== 1 || work.story_id !== entry.storyId || work.working_version !== String(entry.workingVersion) || work.locale !== entry.locale) {
    throw new Error('작품 ID·버전·언어를 다른 원고로 변경할 수 없습니다. 새 작업 버전을 만드세요.');
  }
  return work;
}

function validateTables(tables: TableRows, entry: AuthoringManifestEntry): {
  report: string;
  graph: string;
  story: Story;
  presentation: PresentationPackage;
} {
  const work = assertWorkIdentity(tables, entry);
  const sceneIds = new Set(tables.scene.map(scene => scene.scene_id));
  for (const choice of tables.choice) {
    if (!sceneIds.has(choice.next_scene_id)) {
      throw new Error(`선택지 ${choice.choice_id}의 다음 장면 '${choice.next_scene_id}'이 등록되지 않았습니다. 장면 ID를 확인하세요.`);
    }
  }
  if (!sceneIds.has(work.start_scene_id)) throw new Error('시작 장면이 등록되지 않았습니다. 작품의 시작 장면 ID를 확인하세요.');
  const outgoing = new Map<string, string[]>();
  for (const choice of tables.choice) {
    const targets = outgoing.get(choice.scene_id);
    if (targets) targets.push(choice.next_scene_id);
    else outgoing.set(choice.scene_id, [choice.next_scene_id]);
  }
  const reached = new Set<string>();
  const queue = [work.start_scene_id];
  while (queue.length) {
    const id = queue.pop()!;
    if (reached.has(id)) continue;
    reached.add(id);
    queue.push(...(outgoing.get(id) ?? []));
  }
  const disconnected = tables.scene.filter(scene => !reached.has(scene.scene_id));
  if (disconnected.length) throw new Error(`연결이 끊긴 장면이 있습니다: ${disconnected.slice(0,10).map(scene => scene.scene_id).join(', ')}. 다른 선택지로 연결하거나 장면을 정리하세요.`);
  const temporary = mkdtempSync(join(tmpdir(), 'story-post-studio-'));
  const database = createAuthoringDatabase();
  try {
    writeTables(temporary, tables);
    importAuthoringCsv(database, temporary);
    const key = { storyId: entry.storyId, workingVersion: entry.workingVersion, locale: entry.locale };
    const story = exportRuntimeStory(database, key);
    return {
      report: buildProductionReport(database, key),
      graph: buildBranchGraph(story),
      story,
      presentation: exportPresentationPackage(database, key, { allowPlanned: tables.story_work[0]?.status === 'draft' }),
    };
  } finally {
    database.close();
    rmSync(temporary, { recursive: true, force: true });
  }
}

function workSummary(entry: AuthoringManifestEntry): Record<string, unknown> {
  const tables = readTables(entry.directory);
  const work = tables.story_work[0];
  return {
    directory: entry.directory,
    storyId: entry.storyId,
    version: entry.workingVersion,
    locale: entry.locale,
    title: work?.title ?? entry.storyId,
    status: work?.status ?? 'unknown',
  };
}

function replaceVersion(path: string, version: number): string {
  const extension = extname(path);
  const stem = path.slice(0, -extension.length).replace(/-v\d+$/, '');
  return `${stem}-v${version}${extension}`;
}

function cloneWork(source: AuthoringManifestEntry, newVersion: number, tables: TableRows): AuthoringManifestEntry {
  if (newVersion <= source.workingVersion) throw new Error('새 버전 번호는 현재 버전보다 커야 합니다.');
  const manifestPath = 'content/authoring/manifest.json';
  const expectedManifest = readFileSync(manifestPath, 'utf8');
  const manifest = loadAuthoringManifest();
  const directory = `content/authoring/works/${source.storyId}-v${newVersion}`;
  if (existsSync(directory) || manifest.some(entry => entry.storyId === source.storyId && entry.workingVersion === newVersion)) {
    throw new Error('그 작업 버전이 이미 있습니다. 다른 버전 번호를 선택하세요.');
  }
  for (const [table, headers] of Object.entries(authoringHeaders) as [AuthoringTable, readonly string[]][]) {
    if (headers.some(header => header === 'working_version')) {
      for (const row of tables[table]) row.working_version = String(newVersion);
    }
  }
  tables.story_work[0].status = 'draft';
  for (const row of tables.scene) row.production_status = 'draft';
  tables.release_candidate = [];
  const entry: AuthoringManifestEntry = {
    directory,
    storyId: source.storyId,
    workingVersion: newVersion,
    locale: source.locale,
    storyPath: replaceVersion(source.storyPath, newVersion),
    presentationPath: replaceVersion(source.presentationPath, newVersion),
    reportPath: `docs/${source.storyId}-v${newVersion}-production-sheet.md`,
    graphPath: `docs/${source.storyId}-v${newVersion}-branch.mmd`,
  };
  validateTables(tables, entry);
  publishWorkTables(directory, tables, { path:manifestPath, expected:expectedManifest,
    updated:`${JSON.stringify([...manifest, entry], null, 2)}\n` });
  return entry;
}

function mutationAllowed(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  return !origin || origin === `http://${host}:${port}` || origin === `http://localhost:${port}`;
}

function aiSettings(): Record<string, unknown> {
  return {
    credential: aiCredentialStatus(),
    content: aiCapabilities(),
    image: imageCapabilities(),
    accountReuseSupported: false,
    accountExplanation: 'Codex/ChatGPT login sessions cannot authenticate ordinary OpenAI API requests. Register a Platform project API key.',
  };
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${host}:${port}`);
    if (request.method === 'GET' && url.pathname === '/api/settings/ai') {
      json(response, 200, aiSettings()); return;
    }
    if (request.method === 'PUT' && url.pathname === '/api/settings/ai') {
      if (!mutationAllowed(request)) { json(response, 403, { error: 'Origin is not allowed' }); return; }
      const body = aiSettingsRequest.parse(await requestJson(request));
      saveOpenAiApiKey(body.apiKey);
      json(response, 200, aiSettings()); return;
    }
    if (request.method === 'DELETE' && url.pathname === '/api/settings/ai') {
      if (!mutationAllowed(request)) { json(response, 403, { error: 'Origin is not allowed' }); return; }
      deleteOpenAiApiKey();
      json(response, 200, aiSettings()); return;
    }
    if (request.method === 'GET' && url.pathname === '/api/works') {
      json(response, 200, loadAuthoringManifest().map(workSummary)); return;
    }
    if (request.method === 'GET' && url.pathname === '/api/ai/capabilities') {
      json(response, 200, { content: aiCapabilities(), image: imageCapabilities() }); return;
    }
    if (request.method === 'GET' && url.pathname === '/api/work') {
      const entry = manifestEntry(url.searchParams.get('directory') ?? '');
      const tables = readTables(entry.directory);
      assertWorkIdentity(tables, entry);
      let preview;
      try { preview = validateTables(tables, entry); }
      catch (error) { preview = { report:'',graph:'',error:studioErrorMessage(error) }; }
      json(response, 200, { entry, tables, revision: tablesRevision(tables), preview }); return;
    }
    if (request.method === 'POST' && url.pathname === '/api/validate') {
      if (!mutationAllowed(request)) { json(response, 403, { error: 'Origin is not allowed' }); return; }
      const body = validateRequest.parse(await requestJson(request));
      const entry = manifestEntry(body.directory);
      const tables = normalizedTables(body.tables);
      const { report, graph } = validateTables(tables, entry);
      json(response, 200, { report, graph, revision: tablesRevision(tables), validatedAt: new Date().toISOString() }); return;
    }
    if (request.method === 'POST' && url.pathname === '/api/preview') {
      if (!mutationAllowed(request)) { json(response, 403, { error: 'Origin is not allowed' }); return; }
      const body = previewRequest.parse(await requestJson(request));
      const entry = manifestEntry(body.directory);
      const tables = normalizedTables(body.tables);
      const preview = validateTables(tables, entry);
      json(response, 200, { ...previewStory(preview.story, preview.presentation, body.choiceIds),
        revision:tablesRevision(tables),previewedAt:new Date().toISOString(),
        pendingAssetCount: tables.asset.filter(asset => !['ready', 'approved'].includes(asset.status)).length }); return;
    }
    if (request.method === 'POST' && url.pathname === '/api/asset-inspect') {
      if (!mutationAllowed(request)) { json(response, 403, { error: 'Origin is not allowed' }); return; }
      const body = z.object({ path:imageAssetPath }).strict().parse(await requestJson(request));
      const { hash, bytes, mimeType } = readImageAsset(body.path);
      json(response, 200, { path:body.path, hash, bytes, mimeType }); return;
    }
    if (request.method === 'GET' && url.pathname === '/api/asset-preview') {
      const asset = assetPreviewRequest.parse({ path: url.searchParams.get('path'), hash: url.searchParams.get('hash') });
      const { data, hash, mimeType } = readImageAsset(asset.path);
      if (hash !== asset.hash) {
        json(response, 409, { error: '이미지 파일이 변경되었습니다. 에셋 해시를 갱신한 뒤 다시 미리보기를 시작하세요.' }); return;
      }
      response.writeHead(200, { 'content-type': mimeType, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      response.end(data); return;
    }
    if (request.method === 'POST' && url.pathname === '/api/clone') {
      if (!mutationAllowed(request)) { json(response, 403, { error: 'Origin is not allowed' }); return; }
      const body = cloneRequest.parse(await requestJson(request));
      const source = manifestEntry(body.sourceDirectory);
      const tables = readTables(source.directory);
      if (!body.expectedRevision) {
        json(response, 428, { code:'revision_required',error:'원고를 다시 열어 최신 상태를 확인한 뒤 복제하세요.' }); return;
      }
      if (body.expectedRevision !== tablesRevision(tables)) {
        json(response, 409, { code:'work_conflict',error:'원본 원고가 다른 탭 또는 파일에서 바뀌었습니다. 최신 원고를 다시 열어 확인한 뒤 복제하세요.' }); return;
      }
      json(response, 201, cloneWork(source, body.newVersion, tables)); return;
    }
    if (request.method === 'POST' && url.pathname === '/api/ai/generate') {
      if (!mutationAllowed(request)) { json(response, 403, { error: 'Origin is not allowed' }); return; }
      const body = aiGenerateRequest.parse(await requestJson(request));
      const entry = manifestEntry(body.directory);
      const current = readTables(entry.directory);
      if (current.story_work[0]?.status === 'released') {
        json(response, 409, { error: 'Released work is read-only. Clone it before using AI.' }); return;
      }
      const tables = normalizedTables(body.tables);
      json(response, 200, await generateAiProposal({
        task: body.task,
        brief: body.brief,
        sceneId: body.sceneId,
        tables,
      })); return;
    }
    if (request.method === 'POST' && url.pathname === '/api/ai/image-generate') {
      if (!mutationAllowed(request)) { json(response, 403, { error: 'Origin is not allowed' }); return; }
      const body = imageGenerateRequestSchema.parse(await requestJson(request));
      const entry = manifestEntry(body.directory);
      const current = readTables(entry.directory);
      if (current.story_work[0]?.status === 'released') {
        json(response, 409, { error: 'Released work is read-only. Clone it before generating images.' }); return;
      }
      json(response, 200, await generateStoryImage(body)); return;
    }
    if (request.method === 'GET' && url.pathname === '/api/ai/image-preview') {
      const preview = readImagePreview(url.searchParams.get('runId') ?? '');
      response.writeHead(200, { 'content-type': preview.mimeType, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      response.end(preview.data); return;
    }
    if (request.method === 'POST' && url.pathname === '/api/ai/image-adopt') {
      if (!mutationAllowed(request)) { json(response, 403, { error: 'Origin is not allowed' }); return; }
      const body = imageAdoptRequestSchema.parse(await requestJson(request));
      const entry = manifestEntry(body.directory);
      const current = readTables(entry.directory);
      if (current.story_work[0]?.status === 'released') {
        json(response, 409, { error: 'Released work is read-only. Clone it before adopting images.' }); return;
      }
      json(response, 200, adoptStoryImage(body)); return;
    }
    if (request.method === 'PUT' && url.pathname === '/api/work') {
      if (!mutationAllowed(request)) { json(response, 403, { error: 'Origin is not allowed' }); return; }
      const entry = manifestEntry(url.searchParams.get('directory') ?? '');
      const body = await requestJson(request) as { tables?: unknown; expectedRevision?: unknown };
      const current = readTables(entry.directory);
      if (current.story_work[0]?.status === 'released') {
        json(response, 409, { error: 'Released work is read-only. Clone it as a new version.' }); return;
      }
      if (typeof body.expectedRevision !== 'string') {
        json(response, 428, { code: 'revision_required', error: '원고를 다시 열어 최신 상태를 확인한 뒤 저장하세요.' }); return;
      }
      if (body.expectedRevision !== tablesRevision(current)) {
        json(response, 409, { code: 'work_conflict', error: '다른 탭 또는 파일에서 원고가 변경되었습니다. 현재 편집 내용을 백업한 뒤 다른 원고로 전환했다가 최신 원고를 다시 여세요.' }); return;
      }
      const tables = normalizedTables(body.tables);
      const preview = validateTables(tables, entry);
      replaceWorkTables(entry.directory, tables);
      json(response, 200, { saved: true, revision: tablesRevision(tables), preview }); return;
    }
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      staticFile(response, `${studioRoot}/index.html`); return;
    }
    if (request.method === 'GET' && ['/app.js', '/proposal.mjs', '/session.mjs', '/backup.mjs', '/fields.mjs', '/scene.mjs', '/editing.mjs', '/review.mjs', '/playtest.mjs', '/clone.mjs', '/connection.mjs', '/choice-rules.mjs', '/choice-rules-editor.mjs', '/styles.css'].includes(url.pathname)) {
      staticFile(response, `${studioRoot}/${basename(url.pathname)}`); return;
    }
    response.writeHead(404); response.end('Not found');
  } catch (error) {
    const message = studioErrorMessage(error);
    json(response, 400, { error: message });
  }
});

server.listen(port, host, () => {
  console.log(`Story Post Authoring Studio: http://${host}:${port}`);
  console.log('Press Ctrl+C to stop. The server only accepts local connections.');
});
