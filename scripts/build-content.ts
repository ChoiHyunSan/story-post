import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import {
  emptyPresentationPackage,
  parsePresentationPackage,
  presentationPackageSchema,
} from '../src/content/presentation-package';
import { parseStory, storySchema } from '../src/engine/story';
const manifest: unknown = JSON.parse(readFileSync('content/manifest.json', 'utf8'));
if (!Array.isArray(manifest)) throw new Error('Invalid manifest');
function findJsonFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? findJsonFiles(path) : entry.isFile() && entry.name.endsWith('.json') ? [path] : [];
  });
}
const versions = new Set<string>();
const registeredPaths = new Set<string>();
const registeredPresentationPaths = new Set<string>();
const entries = manifest.map((entry: unknown) => {
  if (!entry || typeof entry !== 'object' || !('path' in entry) || !('developmentOnly' in entry) ||
      !('showInLibrary' in entry) || typeof entry.path !== 'string' ||
      typeof entry.developmentOnly !== 'boolean' || typeof entry.showInLibrary !== 'boolean' ||
      !/^content\/(fixtures|stories)\/[a-z0-9-/]+\.json$/.test(entry.path) || entry.path.includes('..')) {
    throw new Error('Invalid content entry');
  }
  if (entry.path.startsWith('content/fixtures/') && !entry.developmentOnly) {
    throw new Error(`Fixture cannot be production content: ${entry.path}`);
  }
  if (entry.path.startsWith('content/fixtures/') && entry.showInLibrary) {
    throw new Error(`Fixture cannot appear in the story library: ${entry.path}`);
  }
  if (!entry.developmentOnly && !entry.showInLibrary) {
    throw new Error(`Production content must appear in the story library: ${entry.path}`);
  }
  if (registeredPaths.has(entry.path)) throw new Error(`Duplicate content path: ${entry.path}`);
  registeredPaths.add(entry.path);
  const raw = readFileSync(entry.path);
  const story = parseStory(JSON.parse(raw.toString('utf8')));
  let presentation = emptyPresentationPackage;
  let presentationHash: string | undefined;
  let presentationPath: string | undefined;
  if ('presentationPath' in entry && entry.presentationPath !== undefined) {
    if (typeof entry.presentationPath !== 'string' ||
        !/^content\/presentations\/[a-z0-9-/]+\.json$/.test(entry.presentationPath) ||
        entry.presentationPath.includes('..')) {
      throw new Error(`Invalid presentation path: ${String(entry.presentationPath)}`);
    }
    if (registeredPresentationPaths.has(entry.presentationPath)) {
      throw new Error(`Duplicate presentation path: ${entry.presentationPath}`);
    }
    registeredPresentationPaths.add(entry.presentationPath);
    const presentationRaw = readFileSync(entry.presentationPath);
    presentation = parsePresentationPackage(JSON.parse(presentationRaw.toString('utf8')), story);
    presentationHash = createHash('sha256').update(presentationRaw).digest('hex');
    presentationPath = entry.presentationPath;
    for (const asset of presentation.assets) {
      if (!existsSync(asset.bundlePath)) throw new Error(`Missing presentation asset: ${asset.bundlePath}`);
      const actualHash = createHash('sha256').update(readFileSync(asset.bundlePath)).digest('hex');
      if (actualHash !== asset.hash) throw new Error(`Presentation asset hash differs: ${asset.bundlePath}`);
    }
  }
  const key = `${story.storyId}@${story.version}`;
  if (versions.has(key)) throw new Error(`Duplicate release: ${key}`);
  versions.add(key);
  return { story, presentation, presentationHash, presentationPath,
    hash: createHash('sha256').update(raw).digest('hex'),
    developmentOnly: entry.developmentOnly, showInLibrary: entry.showInLibrary };
});
for (const path of [...findJsonFiles('content/fixtures'), ...findJsonFiles('content/stories')]) {
  if (!registeredPaths.has(path)) throw new Error(`Unregistered content source: ${path}`);
}
for (const path of findJsonFiles('content/presentations')) {
  if (!registeredPresentationPaths.has(path)) throw new Error(`Unregistered presentation source: ${path}`);
}
const lockPath = 'content/releases.lock.json';
const hashes = Object.fromEntries(entries.map(entry => [`${entry.story.storyId}@${entry.story.version}`, entry.hash]));
if (existsSync(lockPath)) {
  const previous: unknown = JSON.parse(readFileSync(lockPath, 'utf8'));
  if (!previous || typeof previous !== 'object' || Array.isArray(previous)) throw new Error('Invalid release lock');
  for (const [key, hash] of Object.entries(previous)) {
    if (hashes[key] !== hash) throw new Error(`Immutable release changed or removed: ${key}. Add a new version and keep the old file.`);
  }
}
const presentationLockPath = 'content/presentations.lock.json';
const presentationHashes = Object.fromEntries(entries.flatMap(entry =>
  entry.presentationHash ? [[`${entry.story.storyId}@${entry.story.version}`, entry.presentationHash]] : []));
if (existsSync(presentationLockPath)) {
  const previous: unknown = JSON.parse(readFileSync(presentationLockPath, 'utf8'));
  if (!previous || typeof previous !== 'object' || Array.isArray(previous)) throw new Error('Invalid presentation lock');
  for (const [key, hashValue] of Object.entries(previous)) {
    if (presentationHashes[key] !== hashValue) {
      throw new Error(`Immutable presentation changed or removed: ${key}. Add a new version and keep the old file.`);
    }
  }
}
const lockOutput = JSON.stringify(hashes, null, 2) + '\n';
const presentationLockOutput = JSON.stringify(presentationHashes, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (!existsSync(lockPath) || readFileSync(lockPath, 'utf8') !== lockOutput) throw new Error('Run pnpm content:build to register releases');
  if (!existsSync(presentationLockPath) || readFileSync(presentationLockPath, 'utf8') !== presentationLockOutput) {
    throw new Error('Run pnpm content:build to register presentation releases');
  }
}
const productionEntries = entries.filter(entry => !entry.developmentOnly);
const output = '// Generated by pnpm content:build. Edit manifest and source JSON.\n' +
  'export const productionContent = ' + JSON.stringify(productionEntries, null, 2) + ';\n' +
  '// Metro replaces __DEV__ at bundle time, so development manuscripts are absent from production bytecode.\n' +
  'export const developmentContent = (typeof __DEV__ === \'undefined\' || __DEV__)\n' +
  '  ? ' + JSON.stringify(entries, null, 2) + '\n  : productionContent;\n';
const target = 'src/generated/content.ts';
const assetTarget = 'src/generated/assets.ts';
const jsonSchemaPath = 'content/story.schema.json';
const presentationSchemaPath = 'content/presentation.schema.json';
const jsonSchemaOutput = JSON.stringify({
  $id: 'https://story-post.local/schemas/story-v1.json',
  title: 'Story Post content v1',
  ...z.toJSONSchema(storySchema, { target: 'draft-2020-12' }),
}, null, 2) + '\n';
const presentationSchemaOutput = JSON.stringify({
  $id: 'https://story-post.local/schemas/presentation-v1.json',
  title: 'Story Post presentation package v1',
  ...z.toJSONSchema(presentationPackageSchema, { target: 'draft-2020-12' }),
}, null, 2) + '\n';
function assetModuleOutput(sourceEntries: typeof entries): string {
  const modules = sourceEntries.flatMap(entry => entry.presentation.assets.map(asset => ({
    key: `${entry.story.storyId}@${entry.story.version}:${asset.id}`,
    path: `../../${asset.bundlePath}`,
  })));
  return modules.map(item => `    ${JSON.stringify(item.key)}: require(${JSON.stringify(item.path)}),`).join('\n');
}
const productionAssetOutput = assetModuleOutput(productionEntries);
const developmentAssetOutput = assetModuleOutput(entries);
const assetOutput = '// Generated by pnpm content:build. Edit the authoring asset ledger.\n' +
  "import type { ImageSourcePropType } from 'react-native';\n" +
  'export const productionAssetModules: Record<string, ImageSourcePropType> = {\n' + productionAssetOutput + '\n};\n' +
  '// Metro replaces __DEV__ at bundle time, so development assets are absent from production bytecode.\n' +
  "export const developmentAssetModules: Record<string, ImageSourcePropType> = (typeof __DEV__ !== 'undefined' && __DEV__)\n" +
  '  ? {\n' + developmentAssetOutput + '\n  }\n  : productionAssetModules;\n';
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== output) throw new Error('Run pnpm content:build');
  if (!existsSync(assetTarget) || readFileSync(assetTarget, 'utf8') !== assetOutput) {
    throw new Error('Run pnpm content:build to update asset modules');
  }
  if (!existsSync(jsonSchemaPath) || readFileSync(jsonSchemaPath, 'utf8') !== jsonSchemaOutput) {
    throw new Error('Run pnpm content:build to update the authoring schema');
  }
  if (!existsSync(presentationSchemaPath) || readFileSync(presentationSchemaPath, 'utf8') !== presentationSchemaOutput) {
    throw new Error('Run pnpm content:build to update the presentation schema');
  }
} else {
  writeFileSync(lockPath, lockOutput);
  writeFileSync(presentationLockPath, presentationLockOutput);
  writeFileSync(target, output);
  writeFileSync(assetTarget, assetOutput);
  writeFileSync(jsonSchemaPath, jsonSchemaOutput);
  writeFileSync(presentationSchemaPath, presentationSchemaOutput);
}
console.log(`Verified ${entries.length} content release(s); ${entries.filter(entry => !entry.developmentOnly).length} production`);
