import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { parsePresentationPackage, presentationPackageSchema, type PresentationPackage } from '../src/content/presentation-package';
import { parseStory, type Story } from '../src/engine/story';

export type WorkKey = {
  storyId: string;
  workingVersion: number;
  locale: string;
};

type WorkRow = {
  story_id: string;
  working_version: number;
  locale: 'ko';
  schema_version: 1;
  engine_contract_version: 1;
  title: string;
  description: string;
  start_scene_id: string;
};

type SceneRow = {
  scene_id: string;
  scene_type: 'letter' | 'ending';
  sender: string | null;
  ending_id: string | null;
};

type BlockRow = { text: string };
type FlagRow = { flag_id: string; default_value: 'true' | 'false' };
type ChoiceRow = { choice_id: string; text: string; next_scene_id: string };
type ConditionRow = { flag_id: string; expected_value: 'true' | 'false' };
type EffectRow = { flag_id: string; value: 'true' | 'false' };
type PresentationAssetRow = {
  asset_id: string;
  asset_type: 'background' | 'portrait' | 'overlay' | 'bgm' | 'sfx' | 'voice';
  source_path: string;
  status: 'planned' | 'missing' | 'ready' | 'approved';
  rights_holder: string;
  license: string;
  content_hash: string | null;
  alt_text: string;
  duration_ms: number | null;
};
type PresentationCueRow = {
  cue_id: string;
  scene_id: string;
  block_id: string | null;
  choice_id: string | null;
  trigger: 'scene_enter' | 'before_block' | 'after_block' | 'choices_visible' | 'choice_selected' | 'scene_exit';
  channel: 'background' | 'portrait' | 'overlay' | 'bgm' | 'sfx' | 'voice';
  action: 'show' | 'hide' | 'swap' | 'play' | 'stop' | 'fade_in' | 'fade_out' | 'crossfade';
  asset_id: string | null;
  ordinal: number;
  fade_ms: number;
  volume: number | null;
  loop: 0 | 1;
  duration_ms: number | null;
};

export function createAuthoringDatabase(path: string = ':memory:'): DatabaseSync {
  const database = new DatabaseSync(path);
  database.exec(readFileSync('content/authoring/schema.sql', 'utf8'));
  return database;
}

export function openAuthoringDatabase(path: string): DatabaseSync {
  const database = new DatabaseSync(path);
  const schemaTable = database.prepare(`
    SELECT 1 AS present FROM sqlite_schema WHERE type = 'table' AND name = 'story_work'
  `).get();
  if (!schemaTable) {
    database.close();
    throw new Error(`Not an authoring database: ${path}`);
  }
  database.exec('PRAGMA foreign_keys = ON');
  return database;
}

export function importRuntimeStory(database: DatabaseSync, input: unknown): WorkKey {
  const story = parseStory(input);
  const key = { storyId: story.storyId, workingVersion: story.version, locale: story.locale };
  database.exec('BEGIN IMMEDIATE');
  try {
    database.prepare(`
      INSERT INTO story_work (
        story_id, working_version, locale, schema_version, engine_contract_version,
        title, description, start_scene_id, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft')
    `).run(
      story.storyId, story.version, story.locale, story.schemaVersion, story.engineContractVersion,
      story.title, story.description, story.startNodeId,
    );

    const insertScene = database.prepare(`
      INSERT INTO scene (
        story_id, working_version, locale, scene_id, ordinal, scene_type,
        sender, ending_id, production_status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', '')
    `);
    const insertBlock = database.prepare(`
      INSERT INTO content_block (
        story_id, working_version, locale, block_id, scene_id, ordinal, block_type, speaker, text
      ) VALUES (?, ?, ?, ?, ?, 0, 'narration', NULL, ?)
    `);
    story.nodes.forEach((node, ordinal) => {
      insertScene.run(
        story.storyId, story.version, story.locale, node.id, ordinal, node.type,
        node.type === 'letter' ? node.sender : null,
        node.type === 'ending' ? node.endingId : null,
      );
      insertBlock.run(story.storyId, story.version, story.locale, `${node.id}-body`, node.id, node.body);
    });

    const insertFlag = database.prepare(`
      INSERT INTO flag_definition (
        story_id, working_version, locale, flag_id, ordinal, value_type, default_value, description
      ) VALUES (?, ?, ?, ?, ?, 'boolean', ?, '')
    `);
    story.flags.forEach((flag, ordinal) => {
      insertFlag.run(
        story.storyId, story.version, story.locale, flag.id, ordinal,
        flag.defaultValue ? 'true' : 'false',
      );
    });

    const insertChoice = database.prepare(`
      INSERT INTO choice (
        story_id, working_version, locale, choice_id, scene_id, ordinal, text, next_scene_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertCondition = database.prepare(`
      INSERT INTO choice_condition (
        story_id, working_version, locale, choice_id, ordinal, flag_id, operator, expected_value
      ) VALUES (?, ?, ?, ?, ?, ?, 'equals', ?)
    `);
    const insertEffect = database.prepare(`
      INSERT INTO choice_effect (
        story_id, working_version, locale, choice_id, ordinal, flag_id, operation, value
      ) VALUES (?, ?, ?, ?, ?, ?, 'set', ?)
    `);
    for (const node of story.nodes) {
      if (node.type === 'ending') continue;
      node.choices.forEach((choice, ordinal) => {
        insertChoice.run(
          story.storyId, story.version, story.locale, choice.id, node.id, ordinal,
          choice.text, choice.nextNodeId,
        );
        choice.requires.forEach((condition, conditionOrdinal) => {
          insertCondition.run(
            story.storyId, story.version, story.locale, choice.id, conditionOrdinal,
            condition.flagId, condition.equals ? 'true' : 'false',
          );
        });
        choice.effects.forEach((effect, effectOrdinal) => {
          insertEffect.run(
            story.storyId, story.version, story.locale, choice.id, effectOrdinal,
            effect.flagId, effect.setValue ? 'true' : 'false',
          );
        });
      });
    }
    database.exec('COMMIT');
    return key;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function booleanValue(value: 'true' | 'false'): boolean {
  return value === 'true';
}

export function exportRuntimeStory(database: DatabaseSync, key: WorkKey): Story {
  const parameters = [key.storyId, key.workingVersion, key.locale] as const;
  const work = database.prepare(`
    SELECT story_id, working_version, locale, schema_version, engine_contract_version,
           title, description, start_scene_id
    FROM story_work
    WHERE story_id = ? AND working_version = ? AND locale = ?
  `).get(...parameters) as WorkRow | undefined;
  if (!work) throw new Error(`Unknown authoring work: ${key.storyId}@${key.workingVersion}/${key.locale}`);

  const flags = (database.prepare(`
    SELECT flag_id, default_value
    FROM flag_definition
    WHERE story_id = ? AND working_version = ? AND locale = ?
    ORDER BY ordinal
  `).all(...parameters) as FlagRow[]).map(flag => ({
    id: flag.flag_id,
    defaultValue: booleanValue(flag.default_value),
  }));

  const sceneRows = database.prepare(`
    SELECT scene_id, scene_type, sender, ending_id
    FROM scene
    WHERE story_id = ? AND working_version = ? AND locale = ?
    ORDER BY ordinal
  `).all(...parameters) as SceneRow[];
  const nodes = sceneRows.map(scene => {
    const sceneParameters = [...parameters, scene.scene_id] as const;
    const body = (database.prepare(`
      SELECT text FROM content_block
      WHERE story_id = ? AND working_version = ? AND locale = ? AND scene_id = ?
      ORDER BY ordinal
    `).all(...sceneParameters) as BlockRow[]).map(block => block.text).join('\n\n');
    if (scene.scene_type === 'ending') {
      if (!scene.ending_id) throw new Error(`Ending scene lacks ending_id: ${scene.scene_id}`);
      return { id: scene.scene_id, type: 'ending' as const, endingId: scene.ending_id, body };
    }
    if (!scene.sender) throw new Error(`Letter scene lacks sender: ${scene.scene_id}`);
    const choices = (database.prepare(`
      SELECT choice_id, text, next_scene_id
      FROM choice
      WHERE story_id = ? AND working_version = ? AND locale = ? AND scene_id = ?
      ORDER BY ordinal
    `).all(...sceneParameters) as ChoiceRow[]).map(choice => {
      const choiceParameters = [...parameters, choice.choice_id] as const;
      const requires = (database.prepare(`
        SELECT flag_id, expected_value FROM choice_condition
        WHERE story_id = ? AND working_version = ? AND locale = ? AND choice_id = ?
        ORDER BY ordinal
      `).all(...choiceParameters) as ConditionRow[]).map(condition => ({
        flagId: condition.flag_id,
        equals: booleanValue(condition.expected_value),
      }));
      const effects = (database.prepare(`
        SELECT flag_id, value FROM choice_effect
        WHERE story_id = ? AND working_version = ? AND locale = ? AND choice_id = ?
        ORDER BY ordinal
      `).all(...choiceParameters) as EffectRow[]).map(effect => ({
        flagId: effect.flag_id,
        setValue: booleanValue(effect.value),
      }));
      return { id: choice.choice_id, text: choice.text, nextNodeId: choice.next_scene_id, requires, effects };
    });
    return { id: scene.scene_id, type: 'letter' as const, sender: scene.sender, body, choices };
  });

  return parseStory({
    storyId: work.story_id,
    version: work.working_version,
    schemaVersion: work.schema_version,
    engineContractVersion: work.engine_contract_version,
    locale: work.locale,
    title: work.title,
    description: work.description,
    startNodeId: work.start_scene_id,
    flags,
    nodes,
  });
}

function presentationAsset(item: PresentationAssetRow, isPending = false) {
  const extension = ['bgm','sfx','voice'].includes(item.asset_type) ? 'wav' : 'png';
  return presentationPackageSchema.shape.assets.element.parse({
    id:item.asset_id,type:item.asset_type,
    bundlePath:item.source_path || (isPending ? `assets/planned/${item.asset_id}.${extension}` : ''),
    hash:isPending ? '0'.repeat(64) : item.content_hash,
    altText:item.alt_text,
    ...(item.duration_ms === null ? {} : {durationMs:item.duration_ms}),
  });
}

export function exportPresentationPackage(
  database: DatabaseSync, key: WorkKey, options: { allowPlanned?: boolean } = {},
): PresentationPackage {
  const story = exportRuntimeStory(database, key);
  const parameters = [key.storyId, key.workingVersion, key.locale] as const;
  const cues = database.prepare(`
    SELECT cue_id, scene_id, block_id, choice_id, trigger, channel, action, asset_id,
           ordinal, fade_ms, volume, loop, duration_ms
    FROM cue
    WHERE story_id = ? AND working_version = ? AND locale = ?
    ORDER BY scene_id, trigger, ordinal
  `).all(...parameters) as PresentationCueRow[];
  const referencedAssetIds = [...new Set(cues.flatMap(cueItem => cueItem.asset_id ? [cueItem.asset_id] : []))];
  for (const item of cues) {
    if (!item.block_id) continue;
    const block = database.prepare(`
      SELECT scene_id FROM content_block
      WHERE story_id = ? AND working_version = ? AND locale = ? AND block_id = ?
    `).get(...parameters, item.block_id) as { scene_id: string } | undefined;
    if (block?.scene_id !== item.scene_id) throw new Error(`Cue block belongs to another scene: ${item.cue_id}`);
  }
  const pendingAssetIds = new Set<string>();
  const assetRows = database.prepare(`
    SELECT asset_id, asset_type, source_path, status, rights_holder, license, content_hash, alt_text, duration_ms
    FROM asset
  `).all() as PresentationAssetRow[];
  const assetsById = new Map(assetRows.map(item => [item.asset_id,item]));
  const readyAssets = new Map<string,ReturnType<typeof presentationAsset>>();
  for (const item of assetRows) {
    if (!['ready','approved'].includes(item.status)) continue;
    if (!item.content_hash || !item.rights_holder.trim() || !item.license.trim()) {
      throw new Error(`Ready asset lacks hash or rights: ${item.asset_id}`);
    }
    const asset = presentationAsset(item);
    let data;
    try { data = readFileSync(asset.bundlePath); }
    catch (error) { throw new Error(`Asset file is missing or unreadable: ${item.asset_id}`,{cause:error}); }
    if (createHash('sha256').update(data).digest('hex') !== asset.hash) {
      throw new Error(`Asset hash differs: ${item.asset_id}`);
    }
    readyAssets.set(item.asset_id,asset);
  }
  const assets = referencedAssetIds.map(assetId => {
    const item = assetsById.get(assetId);
    if (!item) throw new Error(`Cue references missing authoring asset: ${assetId}`);
    const ready = readyAssets.get(assetId);
    if (ready) return ready;
    if (!options.allowPlanned) throw new Error(`Referenced asset is not ready: ${assetId}`);
    pendingAssetIds.add(assetId);
    return presentationAsset(item,true);
  });
  const output = {
    presentationSchemaVersion: 1 as const,
    assets,
    cues: cues.map(item => ({
      id: item.cue_id,
      sceneId: item.scene_id,
      ...(item.block_id ? { blockId: item.block_id } : {}),
      ...(item.choice_id ? { choiceId: item.choice_id } : {}),
      trigger: item.trigger,
      channel: item.channel,
      action: item.action,
      ...(item.asset_id ? { assetId: item.asset_id } : {}),
      ordinal: item.ordinal,
      fadeMs: item.fade_ms,
      ...(item.volume === null ? {} : { volume: item.volume }),
      loop: item.loop === 1,
      ...(item.duration_ms === null ? {} : { durationMs: item.duration_ms }),
    })),
  };
  const validated = parsePresentationPackage(output, story);
  if (!pendingAssetIds.size) return validated;
  return parsePresentationPackage({
    ...validated,
    assets: validated.assets.filter(item => !pendingAssetIds.has(item.id)),
    cues: validated.cues.filter(item => !item.assetId || !pendingAssetIds.has(item.assetId)),
  }, story);
}
