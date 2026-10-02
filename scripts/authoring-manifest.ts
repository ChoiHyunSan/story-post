import { readFileSync } from 'node:fs';
import { z } from 'zod';

const id = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const relativePath = (pattern: RegExp) => z.string().regex(pattern).refine(path => !path.includes('..'));
const entrySchema = z.object({
  directory: relativePath(/^content\/authoring\/works\/[a-z0-9-]+$/),
  storyId: id,
  workingVersion: z.number().int().positive(),
  locale: z.literal('ko'),
  storyPath: relativePath(/^content\/stories\/[a-z0-9-/]+\.json$/),
  presentationPath: relativePath(/^content\/presentations\/[a-z0-9-/]+\.json$/),
  reportPath: relativePath(/^docs\/[a-z0-9-]+\.md$/),
  graphPath: relativePath(/^docs\/[a-z0-9-]+\.mmd$/),
}).strict();
const manifestSchema = z.array(entrySchema).min(1);

export type AuthoringManifestEntry = z.infer<typeof entrySchema>;

export function loadAuthoringManifest(): AuthoringManifestEntry[] {
  const parsed = manifestSchema.parse(JSON.parse(
    readFileSync('content/authoring/manifest.json', 'utf8'),
  ) as unknown);
  const directories = new Set<string>();
  const workKeys = new Set<string>();
  for (const entry of parsed) {
    const key = `${entry.storyId}@${entry.workingVersion}/${entry.locale}`;
    if (directories.has(entry.directory)) throw new Error(`Duplicate authoring directory: ${entry.directory}`);
    if (workKeys.has(key)) throw new Error(`Duplicate authoring work: ${key}`);
    directories.add(entry.directory);
    workKeys.add(key);
  }
  return parsed;
}
