-- Executable design contract, not an installed app migration.
-- Enable on every connection, before beginning a transaction.
PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;
CREATE TABLE story (
    story_id TEXT PRIMARY KEY NOT NULL CHECK(length(story_id) > 0)
) STRICT;
CREATE TABLE story_release (
    story_id TEXT NOT NULL REFERENCES story(story_id) ON DELETE RESTRICT,
    content_version INTEGER NOT NULL CHECK(content_version > 0),
    content_hash TEXT NOT NULL CHECK(length(content_hash) = 64 AND content_hash NOT GLOB '*[^0-9a-f]*'),
    content_schema_version INTEGER NOT NULL CHECK(content_schema_version > 0),
    engine_contract_version INTEGER NOT NULL CHECK(engine_contract_version > 0),
    start_node_id TEXT NOT NULL CHECK(length(start_node_id) > 0),
    PRIMARY KEY(story_id, content_version)
) STRICT;
CREATE TABLE playthrough (
    playthrough_id TEXT PRIMARY KEY NOT NULL CHECK(length(playthrough_id) > 0),
    story_id TEXT NOT NULL,
    content_version INTEGER NOT NULL,
    current_node_id TEXT NOT NULL CHECK(length(current_node_id) > 0),
    status TEXT NOT NULL CHECK(status IN ('active', 'completed', 'abandoned')),
    revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
    created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
    updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= created_at_ms),
    finished_at_ms INTEGER,
    FOREIGN KEY(story_id, content_version) REFERENCES story_release(story_id, content_version) ON DELETE RESTRICT,
    CHECK((status = 'active' AND finished_at_ms IS NULL) OR
          (status IN ('completed', 'abandoned') AND finished_at_ms IS NOT NULL AND
           finished_at_ms >= created_at_ms AND finished_at_ms <= updated_at_ms))
) STRICT;
CREATE UNIQUE INDEX one_active_playthrough_per_story ON playthrough(story_id) WHERE status = 'active';
CREATE INDEX playthrough_release ON playthrough(story_id, content_version);
CREATE TABLE playthrough_flag (
    playthrough_id TEXT NOT NULL REFERENCES playthrough(playthrough_id) ON DELETE CASCADE,
    flag_id TEXT NOT NULL CHECK(length(flag_id) > 0),
    value INTEGER NOT NULL CHECK(value IN (0, 1)),
    PRIMARY KEY(playthrough_id, flag_id)
) STRICT;
CREATE TABLE choice_history (
    playthrough_id TEXT NOT NULL REFERENCES playthrough(playthrough_id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL CHECK(sequence > 0),
    from_node_id TEXT NOT NULL CHECK(length(from_node_id) > 0),
    choice_id TEXT NOT NULL CHECK(length(choice_id) > 0),
    to_node_id TEXT NOT NULL CHECK(length(to_node_id) > 0),
    selected_at_ms INTEGER NOT NULL CHECK(selected_at_ms >= 0),
    PRIMARY KEY(playthrough_id, sequence)
) STRICT;
CREATE TABLE ending_unlock (
    story_id TEXT NOT NULL,
    ending_id TEXT NOT NULL CHECK(length(ending_id) > 0),
    first_content_version INTEGER NOT NULL,
    unlocked_at_ms INTEGER NOT NULL CHECK(unlocked_at_ms >= 0),
    PRIMARY KEY(story_id, ending_id),
    FOREIGN KEY(story_id, first_content_version) REFERENCES story_release(story_id, content_version) ON DELETE RESTRICT
) STRICT;
CREATE INDEX ending_unlock_release ON ending_unlock(story_id, first_content_version);
CREATE TABLE app_settings (
    singleton_id INTEGER PRIMARY KEY CHECK(singleton_id = 1),
    text_scale REAL NOT NULL DEFAULT 1.0 CHECK(text_scale BETWEEN 0.8 AND 2.0),
    reduce_motion INTEGER NOT NULL DEFAULT 0 CHECK(reduce_motion IN (0, 1))
) STRICT;
INSERT INTO app_settings(singleton_id) VALUES(1);
PRAGMA user_version = 2;
COMMIT;
