PRAGMA foreign_keys = ON;

CREATE TABLE story_work (
  story_id TEXT NOT NULL,
  working_version INTEGER NOT NULL CHECK (working_version > 0),
  locale TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  engine_contract_version INTEGER NOT NULL CHECK (engine_contract_version > 0),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description TEXT NOT NULL CHECK (length(trim(description)) > 0),
  start_scene_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'review', 'approved', 'released')),
  PRIMARY KEY (story_id, working_version, locale)
);

CREATE TABLE scene (
  story_id TEXT NOT NULL,
  working_version INTEGER NOT NULL,
  locale TEXT NOT NULL,
  scene_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  scene_type TEXT NOT NULL CHECK (scene_type IN ('letter', 'ending')),
  sender TEXT,
  ending_id TEXT,
  production_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (production_status IN ('draft', 'review', 'approved', 'released')),
  notes TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (story_id, working_version, locale, scene_id),
  UNIQUE (story_id, working_version, locale, ordinal),
  FOREIGN KEY (story_id, working_version, locale)
    REFERENCES story_work (story_id, working_version, locale) ON DELETE CASCADE,
  CHECK (
    (scene_type = 'letter' AND sender IS NOT NULL AND ending_id IS NULL) OR
    (scene_type = 'ending' AND sender IS NULL AND ending_id IS NOT NULL)
  )
);

CREATE TABLE content_block (
  story_id TEXT NOT NULL,
  working_version INTEGER NOT NULL,
  locale TEXT NOT NULL,
  block_id TEXT NOT NULL,
  scene_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  block_type TEXT NOT NULL
    CHECK (block_type IN ('narration', 'dialogue', 'letter_quote', 'caption', 'divider')),
  speaker TEXT,
  text TEXT NOT NULL,
  PRIMARY KEY (story_id, working_version, locale, block_id),
  UNIQUE (story_id, working_version, locale, scene_id, ordinal),
  FOREIGN KEY (story_id, working_version, locale, scene_id)
    REFERENCES scene (story_id, working_version, locale, scene_id) ON DELETE CASCADE
);

CREATE TABLE choice (
  story_id TEXT NOT NULL,
  working_version INTEGER NOT NULL,
  locale TEXT NOT NULL,
  choice_id TEXT NOT NULL,
  scene_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  text TEXT NOT NULL CHECK (length(trim(text)) > 0),
  next_scene_id TEXT NOT NULL,
  PRIMARY KEY (story_id, working_version, locale, choice_id),
  UNIQUE (story_id, working_version, locale, scene_id, ordinal),
  FOREIGN KEY (story_id, working_version, locale, scene_id)
    REFERENCES scene (story_id, working_version, locale, scene_id) ON DELETE CASCADE,
  FOREIGN KEY (story_id, working_version, locale, next_scene_id)
    REFERENCES scene (story_id, working_version, locale, scene_id)
);

CREATE TABLE flag_definition (
  story_id TEXT NOT NULL,
  working_version INTEGER NOT NULL,
  locale TEXT NOT NULL,
  flag_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  value_type TEXT NOT NULL DEFAULT 'boolean' CHECK (value_type = 'boolean'),
  default_value TEXT NOT NULL CHECK (default_value IN ('true', 'false')),
  description TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (story_id, working_version, locale, flag_id),
  UNIQUE (story_id, working_version, locale, ordinal),
  FOREIGN KEY (story_id, working_version, locale)
    REFERENCES story_work (story_id, working_version, locale) ON DELETE CASCADE
);

CREATE TABLE choice_condition (
  story_id TEXT NOT NULL,
  working_version INTEGER NOT NULL,
  locale TEXT NOT NULL,
  choice_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  flag_id TEXT NOT NULL,
  operator TEXT NOT NULL DEFAULT 'equals' CHECK (operator = 'equals'),
  expected_value TEXT NOT NULL CHECK (expected_value IN ('true', 'false')),
  PRIMARY KEY (story_id, working_version, locale, choice_id, ordinal),
  FOREIGN KEY (story_id, working_version, locale, choice_id)
    REFERENCES choice (story_id, working_version, locale, choice_id) ON DELETE CASCADE,
  FOREIGN KEY (story_id, working_version, locale, flag_id)
    REFERENCES flag_definition (story_id, working_version, locale, flag_id)
);

CREATE TABLE choice_effect (
  story_id TEXT NOT NULL,
  working_version INTEGER NOT NULL,
  locale TEXT NOT NULL,
  choice_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  flag_id TEXT NOT NULL,
  operation TEXT NOT NULL DEFAULT 'set' CHECK (operation = 'set'),
  value TEXT NOT NULL CHECK (value IN ('true', 'false')),
  PRIMARY KEY (story_id, working_version, locale, choice_id, ordinal),
  FOREIGN KEY (story_id, working_version, locale, choice_id)
    REFERENCES choice (story_id, working_version, locale, choice_id) ON DELETE CASCADE,
  FOREIGN KEY (story_id, working_version, locale, flag_id)
    REFERENCES flag_definition (story_id, working_version, locale, flag_id)
);

CREATE TABLE asset (
  asset_id TEXT PRIMARY KEY,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('background', 'portrait', 'overlay', 'bgm', 'sfx', 'voice')),
  source_path TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'missing', 'ready', 'approved')),
  rights_holder TEXT NOT NULL DEFAULT '',
  license TEXT NOT NULL DEFAULT '',
  content_hash TEXT,
  alt_text TEXT NOT NULL DEFAULT '',
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE cue (
  story_id TEXT NOT NULL,
  working_version INTEGER NOT NULL,
  locale TEXT NOT NULL,
  cue_id TEXT NOT NULL,
  scene_id TEXT NOT NULL,
  block_id TEXT,
  choice_id TEXT,
  trigger TEXT NOT NULL CHECK (trigger IN (
    'scene_enter', 'before_block', 'after_block', 'choices_visible', 'choice_selected', 'scene_exit'
  )),
  channel TEXT NOT NULL CHECK (channel IN ('background', 'portrait', 'overlay', 'bgm', 'sfx', 'voice')),
  action TEXT NOT NULL CHECK (action IN ('show', 'hide', 'swap', 'play', 'stop', 'fade_in', 'fade_out', 'crossfade')),
  asset_id TEXT,
  ordinal INTEGER NOT NULL DEFAULT 0 CHECK (ordinal >= 0),
  fade_ms INTEGER NOT NULL DEFAULT 0 CHECK (fade_ms >= 0),
  volume REAL CHECK (volume IS NULL OR (volume >= 0 AND volume <= 1)),
  loop INTEGER NOT NULL DEFAULT 0 CHECK (loop IN (0, 1)),
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  PRIMARY KEY (story_id, working_version, locale, cue_id),
  UNIQUE (story_id, working_version, locale, scene_id, trigger, ordinal),
  FOREIGN KEY (story_id, working_version, locale, scene_id)
    REFERENCES scene (story_id, working_version, locale, scene_id) ON DELETE CASCADE,
  FOREIGN KEY (story_id, working_version, locale, block_id)
    REFERENCES content_block (story_id, working_version, locale, block_id),
  FOREIGN KEY (story_id, working_version, locale, choice_id)
    REFERENCES choice (story_id, working_version, locale, choice_id),
  FOREIGN KEY (asset_id) REFERENCES asset (asset_id),
  CHECK (
    (trigger IN ('before_block', 'after_block') AND block_id IS NOT NULL AND choice_id IS NULL) OR
    (trigger = 'choice_selected' AND choice_id IS NOT NULL AND block_id IS NULL) OR
    (trigger IN ('scene_enter', 'choices_visible', 'scene_exit') AND block_id IS NULL AND choice_id IS NULL)
  ),
  CHECK (
    (action IN ('hide', 'stop', 'fade_out') AND asset_id IS NULL) OR
    (action IN ('show', 'swap', 'play', 'fade_in', 'crossfade') AND asset_id IS NOT NULL)
  )
);

CREATE TABLE release_candidate (
  candidate_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  working_version INTEGER NOT NULL,
  locale TEXT NOT NULL,
  created_at TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  asset_manifest_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'review'
    CHECK (status IN ('review', 'approved', 'released', 'rejected')),
  FOREIGN KEY (story_id, working_version, locale)
    REFERENCES story_work (story_id, working_version, locale)
);

CREATE INDEX cue_scene_order ON cue (story_id, working_version, locale, scene_id, trigger, ordinal);
CREATE INDEX choice_scene_order ON choice (story_id, working_version, locale, scene_id, ordinal);
CREATE INDEX content_block_scene_order ON content_block (story_id, working_version, locale, scene_id, ordinal);
