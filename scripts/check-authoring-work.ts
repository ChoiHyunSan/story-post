import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { importAuthoringCsv } from './authoring-csv';
import { buildBranchGraph, buildProductionReport } from './authoring-report';
import { createAuthoringDatabase, exportRuntimeStory } from './authoring-store';

const directory = 'content/authoring/works/little-post-office-v3';
const runtimePath = 'content/stories/little-post-office/episode-01-v3.json';
const expected = JSON.parse(readFileSync(runtimePath, 'utf8')) as unknown;
const database = createAuthoringDatabase();
try {
  importAuthoringCsv(database, directory);
  const actual = exportRuntimeStory(database, {
    storyId: 'little-post-office',
    workingVersion: 3,
    locale: 'ko',
  });
  assert.deepStrictEqual(actual, expected, 'Committed authoring tables differ from runtime v3');

  const assets = database.prepare(`
    SELECT asset_id, source_path, status, rights_holder, license, content_hash
    FROM asset ORDER BY asset_id
  `).all() as {
    asset_id: string;
    source_path: string;
    status: string;
    rights_holder: string;
    license: string;
    content_hash: string | null;
  }[];
  assert.equal(assets.length, 1, 'Expected the current development cover in the asset ledger');
  for (const asset of assets) {
    if (!existsSync(asset.source_path)) throw new Error(`Missing asset file: ${asset.asset_id}`);
    if (['ready', 'approved'].includes(asset.status)) {
      assert.ok(asset.rights_holder, `Missing rights holder: ${asset.asset_id}`);
      assert.ok(asset.license, `Missing license: ${asset.asset_id}`);
      assert.ok(asset.content_hash, `Missing content hash: ${asset.asset_id}`);
      const hash = createHash('sha256').update(readFileSync(asset.source_path)).digest('hex');
      assert.equal(hash, asset.content_hash, `Asset hash differs: ${asset.asset_id}`);
    }
  }
  const cueCount = (database.prepare('SELECT count(*) AS count FROM cue').get() as { count: number }).count;
  assert.equal(cueCount, 1, 'Expected the opening background cue in the authoring ledger');
  const key = { storyId: 'little-post-office', workingVersion: 3, locale: 'ko' };
  assert.equal(
    buildProductionReport(database, key),
    readFileSync('docs/little-post-office-production-sheet.md', 'utf8'),
    'Run pnpm authoring:inspect to update the production report',
  );
  assert.equal(
    buildBranchGraph(actual),
    readFileSync('docs/little-post-office-branch.mmd', 'utf8'),
    'Run pnpm authoring:inspect to update the branch graph',
  );
  console.log(`Verified committed authoring work: 18 scenes, ${assets.length} asset, ${cueCount} cue`);
} finally {
  database.close();
}
