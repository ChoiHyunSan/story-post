import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const manifest = JSON.parse(readFileSync('content/manifest.json', 'utf8'));
const forbiddenHashes = manifest.filter(entry => entry.developmentOnly).map(entry => ({
  path: entry.path,
  hash: createHash('sha256').update(readFileSync(entry.path)).digest('hex'),
}));
const forbiddenDevelopmentMarkers = [
  'NATIVE_STORAGE_CHECK_PASS',
  'story-post-check-',
  'local storage initialized',
  'api.openai.com',
  'OPENAI_API_KEY',
  'OPENAI_STORY_MODEL',
  'OPENAI_IMAGE_MODEL',
  'STORY_IMAGE_PROVIDER',
  'gpt-image-2',
  'story-post.authoring.openai',
  'macos-keychain',
  'LOCAL AI CONNECTION',
  'story_content_proposal',
  'AI CO-WRITER',
  'story-post-authoring',
  'newSceneSource',
  'backupDialog',
  'rulesDialog',
  'story-post-review',
  '/api/asset-inspect',
  'story-post-playtest',
];
const forbiddenAssetPaths = ['assets/little-post-office-cover.jpg', 'assets/little-post-office-tide-road-v2.png'];
const forbiddenAssetHashes = forbiddenAssetPaths.map(path => ({
  path,
  hash: createHash('sha256').update(readFileSync(path)).digest('hex'),
}));

const compiler = process.platform === 'darwin'
  ? 'node_modules/hermes-compiler/hermesc/osx-bin/hermesc'
  : process.platform === 'win32'
    ? 'node_modules/hermes-compiler/hermesc/win64-bin/hermesc.exe'
    : 'node_modules/hermes-compiler/hermesc/linux64-bin/hermesc';
if (!existsSync(compiler)) throw new Error(`Hermes compiler is unavailable for ${process.platform}`);

function files(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? files(path) : entry.isFile() ? [path] : [];
  });
}

const bundles = files('dist/_expo/static/js').filter(path => path.endsWith('.hbc'));
if (!bundles.length) throw new Error('No production Hermes bundles found; run expo export first');
for (const bundle of bundles) {
  const bytecode = execFileSync(compiler, ['-dump-bytecode', bundle], { maxBuffer: 128 * 1024 * 1024 });
  for (const entry of forbiddenHashes) {
    if (bytecode.includes(Buffer.from(entry.hash))) {
      throw new Error(`Development content leaked into ${bundle}: ${entry.path}`);
    }
  }
  for (const marker of forbiddenDevelopmentMarkers) {
    if (bytecode.includes(Buffer.from(marker))) {
      throw new Error(`Development-only code leaked into ${bundle}: ${marker}`);
    }
  }
}
for (const path of files('dist')) {
  const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
  const leaked = forbiddenAssetHashes.find(entry => entry.hash === hash);
  if (leaked) throw new Error(`Development asset leaked into ${path}: ${leaked.path}`);
}
console.log(`Verified ${bundles.length} production bundle(s); ${forbiddenHashes.length} development release(s), development-only code and ${forbiddenAssetHashes.length} asset(s) absent`);
