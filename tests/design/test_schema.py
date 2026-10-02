"""SQL design contract tests; no app runtime or production content involved."""
import sqlite3
import unittest
from pathlib import Path

SCHEMA = (Path(__file__).resolve().parents[2] / "design/schema.sql").read_text()


class StorageContract(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.executescript(SCHEMA)
        self.db.execute("INSERT INTO story VALUES ('test-story')")
        self.db.execute("INSERT INTO story_release VALUES (?, ?, ?, ?, ?, ?)",
                        ("test-story", 1, "a" * 64, 1, 1, "start"))
        self.start("run-1")
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def start(self, run_id, version=1):
        self.db.execute("""INSERT INTO playthrough
            (playthrough_id, story_id, content_version, current_node_id,
             status, created_at_ms, updated_at_ms)
            VALUES (?, 'test-story', ?, 'start', 'active', 1000, 1000)""",
                        (run_id, version))

    def test_foreign_keys_and_schema_version(self):
        self.assertEqual(self.db.execute("PRAGMA foreign_keys").fetchone()[0], 1)
        self.assertEqual(self.db.execute("PRAGMA user_version").fetchone()[0], 2)
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_missing_content_version_is_rejected(self):
        self.db.execute("DELETE FROM playthrough")
        with self.assertRaises(sqlite3.IntegrityError):
            self.start("bad-version", version=99)

    def test_one_active_run_even_across_versions(self):
        self.db.execute("INSERT INTO story_release VALUES (?, ?, ?, ?, ?, ?)",
                        ("test-story", 2, "b" * 64, 1, 1, "start"))
        with self.assertRaises(sqlite3.IntegrityError):
            self.start("duplicate", version=2)

    def test_restart_preserves_unlock_and_previous_run(self):
        with self.db:
            self.db.execute("INSERT INTO ending_unlock VALUES ('test-story', 'end-a', 1, 1000)")
            self.db.execute("""UPDATE playthrough SET status='abandoned',
                updated_at_ms=1100, finished_at_ms=1100 WHERE playthrough_id='run-1'""")
            self.start("run-2")
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM playthrough").fetchone()[0], 2)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM ending_unlock").fetchone()[0], 1)

    def test_invalid_completion_has_no_finished_time(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE playthrough SET status='completed'")

    def test_boolean_and_setting_bounds(self):
        for value in (-1, 2):
            with self.subTest(value=value):
                with self.assertRaises(sqlite3.IntegrityError):
                    self.db.execute("INSERT INTO playthrough_flag VALUES ('run-1', 'clue', ?)", (value,))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE app_settings SET text_scale=4")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO app_settings(singleton_id) VALUES (2)")

    def test_duplicate_choice_sequence_rejected(self):
        self.db.execute("INSERT INTO choice_history VALUES ('run-1', 1, 'start', 'go', 'next', 1100)")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO choice_history VALUES ('run-1', 1, 'start', 'other', 'elsewhere', 1200)")

    def test_save_failure_rolls_back_entire_choice(self):
        with self.assertRaises(sqlite3.IntegrityError):
            with self.db:
                self.db.execute("UPDATE playthrough SET current_node_id='next', revision=1, updated_at_ms=1100")
                self.db.execute("INSERT INTO playthrough_flag VALUES ('run-1', 'clue', 1)")
                self.db.execute("INSERT INTO choice_history VALUES ('run-1', 0, 'start', 'go', 'next', 1100)")
        self.assertEqual(self.db.execute("SELECT current_node_id, revision FROM playthrough").fetchone(), ('start', 0))
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM playthrough_flag").fetchone()[0], 0)

    def test_ending_and_completion_roll_back_together(self):
        with self.assertRaises(sqlite3.IntegrityError):
            with self.db:
                self.db.execute("""UPDATE playthrough SET status='completed',
                    current_node_id='end-a', finished_at_ms=1100, updated_at_ms=1100""")
                self.db.execute("INSERT INTO ending_unlock VALUES ('test-story', 'end-a', 99, 1100)")
        self.assertEqual(self.db.execute("SELECT status FROM playthrough").fetchone()[0], 'active')

    def test_stale_revision_cannot_advance_again(self):
        query = """UPDATE playthrough SET revision=revision+1, current_node_id='next'
                   WHERE playthrough_id=? AND revision=? AND status='active'"""
        self.assertEqual(self.db.execute(query, ('run-1', 0)).rowcount, 1)
        self.assertEqual(self.db.execute(query, ('run-1', 0)).rowcount, 0)

    def test_unlock_is_unique_across_replays(self):
        self.db.execute("INSERT INTO ending_unlock VALUES ('test-story', 'end-a', 1, 1000)")
        self.db.execute("""INSERT INTO ending_unlock VALUES ('test-story', 'end-a', 1, 2000)
                          ON CONFLICT(story_id, ending_id) DO NOTHING""")
        self.assertEqual(self.db.execute("SELECT unlocked_at_ms FROM ending_unlock").fetchone()[0], 1000)

    def test_delete_run_cascades_history_but_keeps_unlock(self):
        self.db.execute("INSERT INTO ending_unlock VALUES ('test-story', 'end-a', 1, 1000)")
        self.db.execute("INSERT INTO playthrough_flag VALUES ('run-1', 'clue', 1)")
        self.db.execute("INSERT INTO choice_history VALUES ('run-1', 1, 'start', 'go', 'next', 1100)")
        self.db.execute("DELETE FROM playthrough WHERE playthrough_id='run-1'")
        for table in ('playthrough_flag', 'choice_history'):
            self.assertEqual(self.db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0], 0)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM ending_unlock").fetchone()[0], 1)

    def test_referenced_release_cannot_be_removed(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM story_release")

    def test_unknown_playthrough_flag_rejected(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO playthrough_flag VALUES ('missing-run', 'clue', 1)")


if __name__ == '__main__':
    unittest.main()
