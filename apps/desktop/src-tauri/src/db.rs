// Snapvere by Brendigo
//! Lokalna SQLite baza za povijest screenshotova, tagove i pretragu.
//! Shema prati `docs/SPECIFICATION.md` §6.1.

use std::collections::HashMap;
use std::path::Path;
use std::time::Duration;

use rusqlite::{params, Connection, OptionalExtension};

use crate::models::Screenshot;

pub struct Db {
    conn: Connection,
}

/// A deletion intent survives an unexpected process termination. Its staged
/// files always remain on the same volume as the originals.
pub struct PendingDeletion {
    pub id: String,
    pub file_path: String,
    pub staged_file_path: String,
    pub thumb_path: Option<String>,
    pub staged_thumb_path: Option<String>,
    pub committed: bool,
}

impl Db {
    /// Otvori (ili kreiraj) bazu na zadanoj putanji i pokreni migracije.
    pub fn open(path: &Path) -> anyhow::Result<Self> {
        let conn = Connection::open(path)?;
        conn.busy_timeout(Duration::from_secs(5))?;
        // Inspect the existing database before running schema changes. Never
        // replace damaged user data with a new, empty gallery.
        let integrity: String = conn.query_row("PRAGMA quick_check(1)", [], |row| row.get(0))?;
        anyhow::ensure!(
            integrity == "ok",
            "SQLite gallery integrity check failed: {integrity}"
        );
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "FULL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        let db = Self { conn };
        db.migrate()?;
        crate::gallery_delete::recover(&db)?;
        Ok(db)
    }

    /// Isolated test fixture: production must never silently substitute an
    /// ephemeral database when the on-disk gallery cannot be opened.
    #[cfg(test)]
    fn open_in_memory() -> anyhow::Result<Self> {
        let conn = Connection::open_in_memory()?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        let db = Self { conn };
        db.migrate()?;
        Ok(db)
    }

    fn migrate(&self) -> anyhow::Result<()> {
        // SQLite DDL participates in transactions: partial schema upgrades
        // must not leave a database that looks successfully migrated.
        self.conn.execute_batch(
            r#"
            BEGIN IMMEDIATE;
            CREATE TABLE IF NOT EXISTS screenshots (
                id            TEXT PRIMARY KEY,
                file_path     TEXT NOT NULL,
                thumb_path    TEXT,
                name          TEXT NOT NULL,
                format        TEXT NOT NULL,
                width         INTEGER NOT NULL,
                height        INTEGER NOT NULL,
                size_bytes    INTEGER NOT NULL,
                source        TEXT NOT NULL,
                created_at    INTEGER NOT NULL,
                remote_id     TEXT,
                remote_slug   TEXT,
                remote_url    TEXT,
                remote_expires_at INTEGER,
                is_uploaded   INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_screenshots_created ON screenshots(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_screenshots_name ON screenshots(name);

            CREATE TABLE IF NOT EXISTS tags (
                id   INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE
            );
            CREATE TABLE IF NOT EXISTS screenshot_tags (
                screenshot_id TEXT NOT NULL REFERENCES screenshots(id) ON DELETE CASCADE,
                tag_id        INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
                PRIMARY KEY (screenshot_id, tag_id)
            );

            -- Persisted BEFORE files are staged, retained AFTER row deletion,
            -- and cleared only after rollback or cleanup succeeds.
            CREATE TABLE IF NOT EXISTS pending_deletions (
                id                TEXT PRIMARY KEY,
                file_path         TEXT NOT NULL,
                staged_file_path  TEXT NOT NULL,
                thumb_path        TEXT,
                staged_thumb_path TEXT,
                committed         INTEGER NOT NULL DEFAULT 0 CHECK (committed IN (0, 1))
            );
            PRAGMA user_version = 1;
            COMMIT;
            "#,
        )?;
        Ok(())
    }

    /// Ubaci novi zapis screenshota.
    pub fn insert(&self, s: &Screenshot) -> anyhow::Result<()> {
        self.conn.execute(
            r#"INSERT INTO screenshots
               (id, file_path, thumb_path, name, format, width, height, size_bytes, source, created_at, is_uploaded)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)"#,
            params![
                s.id,
                s.file_path,
                s.thumb_path,
                s.name,
                s.format,
                s.width,
                s.height,
                s.size_bytes as i64,
                s.source,
                s.created_at,
                s.is_uploaded as i32,
            ],
        )?;
        Ok(())
    }

    /// The same paginated SQL result set powers All, Images, Videos and text search.
    /// Category fragments are selected from fixed literals, never user-supplied SQL.
    pub fn gallery_page(
        &self,
        query: &str,
        category: &str,
        limit: u32,
        offset: u32,
    ) -> anyhow::Result<Vec<Screenshot>> {
        anyhow::ensure!(
            query.chars().count() <= 128,
            "Search query exceeds 128 characters"
        );
        let category_sql = match category {
            "all" => "1",
            "images" => "NOT (s.source = 'recording' OR s.format = 'mp4')",
            "videos" => "(s.source = 'recording' OR s.format = 'mp4')",
            _ => anyhow::bail!("Invalid gallery category"),
        };
        // Literal wildcard behavior must stay identical to legacy gallery search.
        let escaped = query
            .trim()
            .replace('\\', "\\\\")
            .replace('%', "\\%")
            .replace('_', "\\_");
        let pattern = if escaped.is_empty() {
            String::new()
        } else {
            format!("%{escaped}%")
        };
        let sql = format!(
            r#"SELECT s.id, s.file_path, s.thumb_path, s.name, s.format, s.width,
                      s.height, s.size_bytes, s.source, s.created_at, s.is_uploaded
               FROM screenshots s
               WHERE {category_sql}
                 AND (?1 = '' OR s.name LIKE ?1 ESCAPE '\'
                      OR EXISTS (
                          SELECT 1 FROM screenshot_tags st
                          JOIN tags t ON t.id = st.tag_id
                          WHERE st.screenshot_id = s.id AND t.name LIKE ?1 ESCAPE '\'
                      ))
               ORDER BY s.created_at DESC, s.id DESC
               LIMIT ?2 OFFSET ?3"#
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(params![pattern, limit.min(500), offset], Self::map_row)?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        self.attach_tags(&mut out)?;
        Ok(out)
    }

    /// Most recent captures, with stable pagination and tag hydration.
    pub fn list(&self, limit: u32, offset: u32) -> anyhow::Result<Vec<Screenshot>> {
        self.gallery_page("", "all", limit, offset)
    }

    /// Jedan zapis po id-u (preglednik u galeriji).
    pub fn get(&self, id: &str) -> anyhow::Result<Option<Screenshot>> {
        let mut stmt = self.conn.prepare(
            r#"SELECT id, file_path, thumb_path, name, format, width, height, size_bytes,
                      source, created_at, is_uploaded
               FROM screenshots
               WHERE id = ?1"#,
        )?;
        let mut rows = stmt.query_map(params![id], Self::map_row)?;
        match rows.next() {
            Some(r) => {
                let mut s = r?;
                s.tags = self.tags_for(&s.id)?;
                Ok(Some(s))
            }
            None => Ok(None),
        }
    }


    pub fn search(&self, query: &str, limit: u32, offset: u32) -> anyhow::Result<Vec<Screenshot>> {
        self.gallery_page(query, "all", limit, offset)
    }

    /// Write durable intent before the filesystem is touched.
    pub fn prepare_delete(&self, job: &PendingDeletion) -> anyhow::Result<()> {
        let changed = self.conn.execute(
            "INSERT INTO pending_deletions
             (id, file_path, staged_file_path, thumb_path, staged_thumb_path, committed)
             SELECT ?1, ?2, ?3, ?4, ?5, 0
             FROM screenshots WHERE id = ?1",
            params![
                job.id,
                job.file_path,
                job.staged_file_path,
                job.thumb_path,
                job.staged_thumb_path
            ],
        )?;
        anyhow::ensure!(changed == 1, "Gallery item disappeared before delete");
        Ok(())
    }

    /// Atomically remove the row and mark its staged media as safe to clean.
    pub fn commit_delete(&mut self, id: &str) -> anyhow::Result<()> {
        let tx = self.conn.transaction()?;
        let removed = tx.execute("DELETE FROM screenshots WHERE id = ?1", params![id])?;
        anyhow::ensure!(removed == 1, "No gallery entry to delete");
        let marked = tx.execute(
            "UPDATE pending_deletions SET committed = 1 WHERE id = ?1 AND committed = 0",
            params![id],
        )?;
        anyhow::ensure!(marked == 1, "Missing prepared gallery deletion");
        tx.commit()?;
        Ok(())
    }

    pub fn forget_delete(&self, id: &str) -> anyhow::Result<()> {
        self.conn
            .execute("DELETE FROM pending_deletions WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn pending_delete(&self, id: &str) -> anyhow::Result<Option<PendingDeletion>> {
        Ok(self
            .conn
            .query_row(
                "SELECT id, file_path, staged_file_path, thumb_path, staged_thumb_path, committed
                 FROM pending_deletions WHERE id = ?1",
                params![id],
                Self::map_pending,
            )
            .optional()?)
    }

    pub fn pending_deletions(&self) -> anyhow::Result<Vec<PendingDeletion>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, file_path, staged_file_path, thumb_path, staged_thumb_path, committed
             FROM pending_deletions ORDER BY id",
        )?;
        let rows = stmt.query_map([], Self::map_pending)?;
        let pending = rows.collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(pending)
    }

    fn map_pending(row: &rusqlite::Row) -> rusqlite::Result<PendingDeletion> {
        Ok(PendingDeletion {
            id: row.get(0)?,
            file_path: row.get(1)?,
            staged_file_path: row.get(2)?,
            thumb_path: row.get(3)?,
            staged_thumb_path: row.get(4)?,
            committed: row.get::<_, i32>(5)? != 0,
        })
    }

    /// Dodaj tag screenshotu (kreira tag ako ne postoji).
    pub fn add_tag(&self, screenshot_id: &str, tag: &str) -> anyhow::Result<()> {
        let tag = tag.trim();
        anyhow::ensure!(!tag.is_empty(), "Tag cannot be empty");
        anyhow::ensure!(tag.chars().count() <= 64, "Tag exceeds 64 characters");
        anyhow::ensure!(
            !tag.chars().any(char::is_control),
            "Tag contains control characters"
        );
        let exists: bool = self.conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM screenshots WHERE id = ?1)",
            params![screenshot_id],
            |row| row.get(0),
        )?;
        anyhow::ensure!(exists, "Screenshot does not exist");
        self.conn
            .execute("INSERT OR IGNORE INTO tags(name) VALUES (?1)", params![tag])?;
        self.conn.execute(
            r#"INSERT OR IGNORE INTO screenshot_tags(screenshot_id, tag_id)
               VALUES (?1, (SELECT id FROM tags WHERE name = ?2))"#,
            params![screenshot_id, tag],
        )?;
        Ok(())
    }

    /// Load tags for one page using one SQL query (avoids N+1 tag lookups).
    fn attach_tags(&self, items: &mut [Screenshot]) -> anyhow::Result<()> {
        if items.is_empty() {
            return Ok(());
        }
        let slots = vec!["?"; items.len()].join(", ");
        let sql = format!(
            "SELECT st.screenshot_id, t.name FROM screenshot_tags st
             JOIN tags t ON t.id = st.tag_id
             WHERE st.screenshot_id IN ({slots}) ORDER BY t.name"
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let pairs = stmt.query_map(
            rusqlite::params_from_iter(items.iter().map(|s| s.id.as_str())),
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )?;
        let mut tags: HashMap<String, Vec<String>> = HashMap::new();
        for pair in pairs {
            let (id, name) = pair?;
            tags.entry(id).or_default().push(name);
        }
        for item in items {
            item.tags = tags.remove(&item.id).unwrap_or_default();
        }
        Ok(())
    }

    fn tags_for(&self, screenshot_id: &str) -> anyhow::Result<Vec<String>> {
        let mut stmt = self.conn.prepare(
            r#"SELECT t.name FROM tags t
               JOIN screenshot_tags st ON st.tag_id = t.id
               WHERE st.screenshot_id = ?1
               ORDER BY t.name"#,
        )?;
        let rows = stmt.query_map(params![screenshot_id], |row| row.get::<_, String>(0))?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    fn map_row(row: &rusqlite::Row) -> rusqlite::Result<Screenshot> {
        Ok(Screenshot {
            id: row.get(0)?,
            file_path: row.get(1)?,
            thumb_path: row.get(2)?,
            name: row.get(3)?,
            format: row.get(4)?,
            width: row.get(5)?,
            height: row.get(6)?,
            size_bytes: row.get::<_, i64>(7)? as u64,
            source: row.get(8)?,
            created_at: row.get(9)?,
            is_uploaded: row.get::<_, i32>(10)? != 0,
            tags: Vec::new(),
        })
    }
}

#[cfg(test)]
mod gallery_tests {
    use super::*;

    fn shot(id: &str, time: i64) -> Screenshot {
        Screenshot {
            id: id.into(),
            file_path: format!("/tmp/{id}.png"),
            thumb_path: None,
            name: format!("Snapvere {id}"),
            format: "png".into(),
            width: 4,
            height: 4,
            size_bytes: 64,
            source: "region".into(),
            created_at: time,
            is_uploaded: false,
            tags: Vec::new(),
        }
    }
    #[test]
    fn list_search_pagination_and_tag_loading() -> anyhow::Result<()> {
        let db = Db::open_in_memory()?;
        db.insert(&shot("one", 100))?;
        db.insert(&shot("two", 200))?;
        db.add_tag("one", "design")?;
        db.add_tag("one", "team")?;
        db.add_tag("two", "team")?;
        let all = db.list(200, 0)?;
        assert_eq!(all.len(), 2);
        assert_eq!(all[0].id, "two");
        assert_eq!(all[0].tags, vec!["team"]);
        assert_eq!(all[1].tags, vec!["design", "team"]);
        assert_eq!(db.search("design", 200, 0)?[0].tags, vec!["design", "team"]);
        assert_eq!(db.list(1, 1)?[0].id, "one");
        assert!(db.list(1, 10)?.is_empty());
        assert!(db.list(0, 0)?.is_empty());
        Ok(())
    }

    #[test]
    fn search_treats_wildcards_as_literal_characters() -> anyhow::Result<()> {
        let db = Db::open_in_memory()?;
        db.insert(&shot("one%two", 100))?;
        db.insert(&shot("one_two", 200))?;
        db.insert(&shot("oneXtwo", 300))?;
        assert_eq!(db.search("%", 200, 0)?[0].id, "one%two");
        assert_eq!(db.search("%", 200, 0)?.len(), 1);
        assert_eq!(db.search("_", 200, 0)?[0].id, "one_two");
        assert_eq!(db.search("_", 200, 0)?.len(), 1);
        assert_eq!(db.search("one", 200, 0)?.len(), 3);
        Ok(())
    }

    #[test]
    fn stable_pagination_across_matching_timestamps() -> anyhow::Result<()> {
        let db = Db::open_in_memory()?;
        db.insert(&shot("same_a", 100))?;
        db.insert(&shot("same_b", 100))?;
        db.insert(&shot("older", 90))?;
        assert_eq!(db.list(1, 0)?[0].id, "same_b");
        assert_eq!(db.list(1, 1)?[0].id, "same_a");
        assert_eq!(db.list(1, 2)?[0].id, "older");
        assert_eq!(db.search("same", 1, 0)?[0].id, "same_b");
        assert_eq!(db.search("same", 1, 1)?[0].id, "same_a");
        assert!(db.search("same", 1, 2)?.is_empty());
        Ok(())
    }

    #[test]
    fn category_filter_pages_entire_gallery_before_limiting() -> anyhow::Result<()> {
        let db = Db::open_in_memory()?;
        for i in 0..135 {
            db.insert(&shot(&format!("image-{i:03}"), i + 100))?;
        }
        let mut older_video = shot("older-gif", 2);
        older_video.format = "gif".into();
        older_video.source = "recording".into();
        db.insert(&older_video)?;
        db.add_tag("older-gif", "training")?;
        let mut mp4 = shot("older-mp4", 3);
        mp4.format = "mp4".into();
        mp4.source = "fullscreen".into();
        db.insert(&mp4)?;

        let videos = db.gallery_page("", "videos", 120, 0)?;
        assert_eq!(videos.len(), 2);
        assert_eq!(videos[0].id, "older-mp4");
        assert_eq!(videos[1].id, "older-gif");
        assert_eq!(videos[1].tags, vec!["training"]);
        assert_eq!(db.gallery_page("", "images", 120, 0)?.len(), 120);
        assert_eq!(db.gallery_page("", "images", 120, 120)?.len(), 15);
        assert_eq!(db.gallery_page("", "all", 120, 120)?.len(), 17);
        assert_eq!(db.gallery_page("training", "videos", 10, 0)?[0].id, "older-gif");
        assert!(db.gallery_page("training", "images", 10, 0)?.is_empty());
        assert!(db.gallery_page("", "unexpected", 10, 0).is_err());
        assert!(db.gallery_page(&"x".repeat(129), "all", 10, 0).is_err());
        Ok(())
    }

    #[test]
    fn reject_invalid_tags_and_oversized_search() -> anyhow::Result<()> {
        let db = Db::open_in_memory()?;
        db.insert(&shot("one", 100))?;
        assert!(db.add_tag("one", "").is_err());
        assert!(db.add_tag("one", "a\nb").is_err());
        assert!(db.add_tag("one", &"x".repeat(65)).is_err());
        assert!(db.add_tag("missing", "valid").is_err());
        db.add_tag("one", "  useful  ")?;
        assert_eq!(db.get("one")?.expect("record").tags, vec!["useful"]);
        assert!(db.search(&"x".repeat(129), 10, 0).is_err());
        Ok(())
    }

    #[test]
    fn search_does_not_duplicate_matches_across_tags() -> anyhow::Result<()> {
        let db = Db::open_in_memory()?;
        db.insert(&shot("one", 100))?;
        db.add_tag("one", "meeting")?;
        db.add_tag("one", "meet-up")?;
        assert_eq!(db.search("meet", 10, 0)?.len(), 1);
        Ok(())
    }

    #[test]
    fn reopening_existing_gallery_preserves_capture_tags_and_legacy_metadata() -> anyhow::Result<()>
    {
        let folder = std::env::temp_dir().join(format!(
            "snapvere-db-upgrade-{}",
            uuid::Uuid::new_v4().simple()
        ));
        std::fs::create_dir_all(&folder)?;
        let path = folder.join("gallery.db");

        let result = (|| -> anyhow::Result<()> {
            {
                let original = Db::open(&path)?;
                original.insert(&shot("saved-before-upgrade", 100))?;
                original.add_tag("saved-before-upgrade", "keep-me")?;
                original.conn.execute(
                    "UPDATE screenshots SET remote_id = ?1, remote_url = ?2 WHERE id = ?3",
                    params![
                        "legacy-upload",
                        "legacy-remote-link",
                        "saved-before-upgrade"
                    ],
                )?;
            }
            {
                // The same public API opens an existing on-disk SQLite/WAL
                // gallery after a dependency upgrade; no destructive migrations.
                let upgraded = Db::open(&path)?;
                let version: i64 = upgraded
                    .conn
                    .query_row("PRAGMA user_version", [], |r| r.get(0))?;
                assert_eq!(version, 1);
                let record = upgraded.get("saved-before-upgrade")?.expect("saved record");
                assert_eq!(record.tags, vec!["keep-me"]);
                assert_eq!(upgraded.list(10, 0)?.len(), 1);
                let (id, url): (String, String) = upgraded.conn.query_row(
                    "SELECT remote_id, remote_url FROM screenshots WHERE id = ?1",
                    params!["saved-before-upgrade"],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )?;
                assert_eq!(id, "legacy-upload");
                assert_eq!(url, "legacy-remote-link");
            }
            Ok(())
        })();

        // Remove test-only DB and its WAL/SHM companions after closing both
        // connections, leaving no real user data touched.
        let _ = std::fs::remove_dir_all(folder);
        result
    }

    #[test]
    fn in_memory_delete_cascades_tag_relations() -> anyhow::Result<()> {
        let db = Db::open_in_memory()?;
        db.insert(&shot("one", 100))?;
        db.add_tag("one", "important")?;
        // Validate SQLite foreign-key behavior without bypassing the
        // crash-recoverable deletion API in production.
        db.conn
            .execute("DELETE FROM screenshots WHERE id = ?1", params!["one"])?;
        let count: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM screenshot_tags", [], |r| r.get(0))?;
        assert_eq!(count, 0);
        Ok(())
    }
}

#[cfg(test)]
mod database_corruption_tests {
    use super::*;

    #[test]
    fn invalid_existing_database_is_preserved_for_recovery() {
        let path = std::env::temp_dir().join(format!(
            "snapvere-broken-db-{}.sqlite",
            uuid::Uuid::new_v4()
        ));
        let original = b"This is not an SQLite database. User files must survive.";
        std::fs::write(&path, original).unwrap();

        assert!(Db::open(&path).is_err(), "Corrupt DB must not open");
        assert_eq!(std::fs::read(&path).unwrap(), original);
        std::fs::remove_file(&path).unwrap();
    }
}
