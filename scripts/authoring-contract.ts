export const authoringHeaders = {
  story_work: ['story_id', 'working_version', 'locale', 'schema_version', 'engine_contract_version', 'title', 'description', 'start_scene_id', 'status'],
  scene: ['story_id', 'working_version', 'locale', 'scene_id', 'ordinal', 'scene_type', 'sender', 'ending_id', 'production_status', 'notes'],
  content_block: ['story_id', 'working_version', 'locale', 'block_id', 'scene_id', 'ordinal', 'block_type', 'speaker', 'text'],
  flag_definition: ['story_id', 'working_version', 'locale', 'flag_id', 'ordinal', 'value_type', 'default_value', 'description'],
  choice: ['story_id', 'working_version', 'locale', 'choice_id', 'scene_id', 'ordinal', 'text', 'next_scene_id'],
  choice_condition: ['story_id', 'working_version', 'locale', 'choice_id', 'ordinal', 'flag_id', 'operator', 'expected_value'],
  choice_effect: ['story_id', 'working_version', 'locale', 'choice_id', 'ordinal', 'flag_id', 'operation', 'value'],
  asset: ['asset_id', 'asset_type', 'source_path', 'status', 'rights_holder', 'license', 'content_hash', 'alt_text', 'duration_ms', 'notes'],
  cue: ['story_id', 'working_version', 'locale', 'cue_id', 'scene_id', 'block_id', 'choice_id', 'trigger', 'channel', 'action', 'asset_id', 'ordinal', 'fade_ms', 'volume', 'loop', 'duration_ms'],
  release_candidate: ['candidate_id', 'story_id', 'working_version', 'locale', 'created_at', 'content_hash', 'asset_manifest_hash', 'status'],
} as const;

export type AuthoringTable = keyof typeof authoringHeaders;

export const nullableColumns = new Set([
  'scene.sender',
  'scene.ending_id',
  'content_block.speaker',
  'asset.content_hash',
  'asset.duration_ms',
  'cue.block_id',
  'cue.choice_id',
  'cue.asset_id',
  'cue.volume',
  'cue.duration_ms',
]);
