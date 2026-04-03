import Foundation
import SQLite3

// MARK: - Sync State

enum SyncState: String {
    case localOnly = "local_only"
    case cloudOnly = "cloud_only"
    case synced = "synced"
}

// MARK: - Sync Item (replaces ManifestEntry)

struct SyncItem {
    let id: Int64
    let origin: String              // "local" or "cloud"
    let sourceType: String          // "claude_code", "codex", "cursor", "claude_desktop", "chatgpt", "mcp"
    let sessionId: String           // unique key — session ID or memory ID
    let title: String?
    let project: String
    let localPath: String           // relative to store root
    let sourcePath: String          // original source location
    let localHash: String
    let fileSize: UInt64
    let messageCount: Int?
    let cloudId: String?            // purmemo API memory ID
    let syncState: SyncState
    let sourceDeleted: Bool
    let cloudUpdatedAt: Date?
    let localUpdatedAt: Date
    let createdAt: Date

    // Phase G: Tail metadata from Claude Code JSONL
    let customTitle: String?        // User-set via /rename
    let aiTitle: String?            // Claude-generated session title
    let tags: String?               // Comma-separated tags
    let prLink: String?             // GitHub PR URL
    let lastPrompt: String?         // Last user prompt
    let worktreeBranch: String?     // Worktree branch name
    let sessionMode: String?        // "coordinator" or "normal"

    // Phase N: Project linkage
    let projectId: String?          // FK to projects.id
}

// MARK: - Project (canonical entity)

struct Project {
    let id: String                  // slug: "purmemo", "krawlr", etc.
    let canonicalPath: String?      // /Users/wivak/.../purmemo (nil for cloud-only projects)
    let displayName: String
    let cloudClusterId: String?     // links to cloud semantic_clusters.id
    let sessionCount: Int
    let platformCount: Int          // distinct platforms contributing sessions
    let lastActivityAt: Date?
    let createdAt: Date
    let updatedAt: Date
}

// MARK: - Project Alias (multi-identifier → one project)

struct ProjectAlias {
    let aliasType: String           // "path", "path_hash", "name", "cloud_name", "repo"
    let aliasValue: String          // the identifier value
    let projectId: String           // FK to projects.id
    let confidence: Double          // 1.0 for deterministic, <1.0 for fuzzy
    let createdBy: String           // "scanner", "cloud_extraction", "user", "auto_link"
    let reasoning: String?
    let createdAt: Date
}

// MARK: - Sync Database

/// SQLite-backed sync ledger at ~/purmemo sync/.purmemo.db
/// Tracks all items (local and cloud origin) with their sync state.
/// Replaces the old manifest.json approach for bidirectional sync support.
class SyncDatabase {

    private var db: OpaquePointer?
    private let dbPath: String
    private let queue: DispatchQueue

    private static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    init(path: String, queue: DispatchQueue) {
        self.dbPath = path
        self.queue = queue
        openDatabase()
        createTablesIfNeeded()
    }

    deinit {
        if let db { sqlite3_close(db) }
    }

    // MARK: - Setup

    private func openDatabase() {
        // FULLMUTEX: serialize all access — database is read from main thread (SwiftUI)
        // and written from background queues (session-store, cloud-download, fs-watcher)
        let flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX
        guard sqlite3_open_v2(dbPath, &db, flags, nil) == SQLITE_OK else {
            print("[SyncDatabase] Failed to open database at \(dbPath)")
            return
        }
        // WAL mode for concurrent reads during sync
        exec("PRAGMA journal_mode=WAL")
        exec("PRAGMA synchronous=NORMAL")
        exec("PRAGMA foreign_keys=ON")
    }

    private func createTablesIfNeeded() {
        let sql = """
            CREATE TABLE IF NOT EXISTS sync_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                origin TEXT NOT NULL DEFAULT 'local',
                source_type TEXT NOT NULL DEFAULT 'claude_code',
                session_id TEXT NOT NULL UNIQUE,
                title TEXT,
                project TEXT NOT NULL DEFAULT '',
                local_path TEXT NOT NULL DEFAULT '',
                source_path TEXT NOT NULL DEFAULT '',
                local_hash TEXT NOT NULL DEFAULT '',
                file_size INTEGER NOT NULL DEFAULT 0,
                message_count INTEGER,
                cloud_id TEXT,
                sync_state TEXT NOT NULL DEFAULT 'local_only',
                source_deleted INTEGER NOT NULL DEFAULT 0,
                cloud_updated_at TEXT,
                local_updated_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_sync_session_id ON sync_items(session_id);
            CREATE INDEX IF NOT EXISTS idx_sync_state ON sync_items(sync_state);
            CREATE INDEX IF NOT EXISTS idx_sync_project ON sync_items(project);
            CREATE INDEX IF NOT EXISTS idx_sync_origin ON sync_items(origin);
            CREATE INDEX IF NOT EXISTS idx_sync_source_type ON sync_items(source_type);

            CREATE TABLE IF NOT EXISTS sync_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
        """
        exec(sql)
        migratePhaseG()
        migratePhaseI()
        migratePhaseK()
        migratePhaseN()
    }

    /// Phase G migration: add tail metadata columns to sync_items
    private func migratePhaseG() {
        let migrationKey = "migration_phase_g"
        if getMeta(key: migrationKey) != nil { return }

        let columns = [
            "custom_title TEXT",
            "ai_title TEXT",
            "tags TEXT",
            "pr_link TEXT",
            "last_prompt TEXT",
            "worktree_branch TEXT",
            "session_mode TEXT"
        ]
        for col in columns {
            exec("ALTER TABLE sync_items ADD COLUMN \(col)")
        }

        setMeta(key: migrationKey, value: "done")
    }

    /// Phase K migration: session_files table for file attribution
    private func migratePhaseK() {
        let migrationKey = "migration_phase_k"
        if getMeta(key: migrationKey) != nil { return }

        exec("""
            CREATE TABLE IF NOT EXISTS session_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                file_path TEXT NOT NULL,
                version INTEGER NOT NULL DEFAULT 1,
                UNIQUE(session_id, file_path)
            );
            CREATE INDEX IF NOT EXISTS idx_session_files_session ON session_files(session_id);
            CREATE INDEX IF NOT EXISTS idx_session_files_path ON session_files(file_path);
        """)

        setMeta(key: migrationKey, value: "done")
    }

    // MARK: - Phase N: Unified Intelligence System

    /// Phase N migration: projects, project_aliases, session_intelligence tables + project_id FK
    private func migratePhaseN() {
        let migrationKey = "migration_phase_n"
        if getMeta(key: migrationKey) != nil { return }

        // Projects — canonical entity per project
        exec("""
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                canonical_path TEXT UNIQUE,
                display_name TEXT NOT NULL,
                cloud_cluster_id TEXT,
                session_count INTEGER NOT NULL DEFAULT 0,
                platform_count INTEGER NOT NULL DEFAULT 0,
                last_activity_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
        """)

        // Project aliases — multiple identifiers → one project
        exec("""
            CREATE TABLE IF NOT EXISTS project_aliases (
                alias_type TEXT NOT NULL,
                alias_value TEXT NOT NULL,
                project_id TEXT NOT NULL REFERENCES projects(id),
                confidence REAL NOT NULL DEFAULT 1.0,
                created_by TEXT NOT NULL DEFAULT 'scanner',
                reasoning TEXT,
                created_at TEXT NOT NULL,
                PRIMARY KEY (alias_type, alias_value)
            );
            CREATE INDEX IF NOT EXISTS idx_project_aliases_project ON project_aliases(project_id);
        """)

        // Session intelligence — local + cloud intel per session
        exec("""
            CREATE TABLE IF NOT EXISTS session_intelligence (
                session_id TEXT PRIMARY KEY,
                project_id TEXT REFERENCES projects(id),
                platform TEXT NOT NULL,

                -- LOCAL (free, deterministic extraction)
                summary_local TEXT,
                tools_used TEXT,
                model TEXT,
                token_count INTEGER,
                git_branch TEXT,
                duration_seconds INTEGER,
                msg_count_user INTEGER,
                msg_count_assistant INTEGER,
                has_errors INTEGER DEFAULT 0,
                first_prompt TEXT,
                last_prompt TEXT,
                extracted_at TEXT,

                -- CLOUD (premium, Gemini-extracted, cached locally)
                cloud_memory_id TEXT,
                summary_cloud TEXT,
                category TEXT,
                intent TEXT,
                primary_intent TEXT,
                task_type TEXT,
                next_phase_hint TEXT,
                key_result TEXT,
                cloud_tags TEXT,
                technologies TEXT,
                tools_validated TEXT,
                impact_json TEXT,
                context_json TEXT,
                work_items_json TEXT,
                blockers_json TEXT,
                completions_json TEXT,
                decisions_json TEXT,
                lesson_json TEXT,
                causal_json TEXT,
                workflow_json TEXT,
                cloud_synced_at TEXT,

                FOREIGN KEY (session_id) REFERENCES sync_items(session_id)
            );
            CREATE INDEX IF NOT EXISTS idx_session_intel_project ON session_intelligence(project_id);
            CREATE INDEX IF NOT EXISTS idx_session_intel_platform ON session_intelligence(platform);
        """)

        // Session entities — normalized for cross-session search
        exec("""
            CREATE TABLE IF NOT EXISTS session_entities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                name TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                mentions INTEGER DEFAULT 1,
                source TEXT DEFAULT 'cloud',
                UNIQUE(session_id, name, entity_type)
            );
            CREATE INDEX IF NOT EXISTS idx_session_entities_name ON session_entities(name);
        """)

        // Session tools — tool usage per session
        exec("""
            CREATE TABLE IF NOT EXISTS session_tools (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                tool_name TEXT NOT NULL,
                invocation_count INTEGER DEFAULT 1,
                UNIQUE(session_id, tool_name)
            );
            CREATE INDEX IF NOT EXISTS idx_session_tools_name ON session_tools(tool_name);
        """)

        // Add project_id FK to sync_items
        exec("ALTER TABLE sync_items ADD COLUMN project_id TEXT")
        exec("CREATE INDEX IF NOT EXISTS idx_sync_project_id ON sync_items(project_id)")

        setMeta(key: migrationKey, value: "done")
        print("[SyncDatabase] Phase N migration complete: projects, aliases, intelligence tables created")
    }

    // MARK: - Phase N: Project CRUD

    func upsertProject(_ project: Project) {
        let sql = """
            INSERT INTO projects (id, canonical_path, display_name, cloud_cluster_id,
                                  session_count, platform_count, last_activity_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                canonical_path = COALESCE(excluded.canonical_path, canonical_path),
                display_name = excluded.display_name,
                cloud_cluster_id = COALESCE(excluded.cloud_cluster_id, cloud_cluster_id),
                session_count = excluded.session_count,
                platform_count = excluded.platform_count,
                last_activity_at = MAX(excluded.last_activity_at, last_activity_at),
                updated_at = excluded.updated_at
        """
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else { return }
        defer { sqlite3_finalize(stmt) }

        bind(stmt, 1, project.id)
        bind(stmt, 2, project.canonicalPath)
        bind(stmt, 3, project.displayName)
        bind(stmt, 4, project.cloudClusterId)
        sqlite3_bind_int(stmt, 5, Int32(project.sessionCount))
        sqlite3_bind_int(stmt, 6, Int32(project.platformCount))
        bind(stmt, 7, project.lastActivityAt.map { Self.isoFormatter.string(from: $0) })
        bind(stmt, 8, Self.isoFormatter.string(from: project.createdAt))
        bind(stmt, 9, Self.isoFormatter.string(from: project.updatedAt))
        sqlite3_step(stmt)
    }

    func fetchProject(id: String) -> Project? {
        let sql = "SELECT * FROM projects WHERE id = ? LIMIT 1"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else { return nil }
        defer { sqlite3_finalize(stmt) }

        bind(stmt, 1, id)
        guard sqlite3_step(stmt) == SQLITE_ROW else { return nil }
        return readProjectRow(stmt)
    }

    func fetchAllProjects() -> [Project] {
        let sql = "SELECT * FROM projects ORDER BY last_activity_at DESC"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else { return [] }
        defer { sqlite3_finalize(stmt) }

        var results: [Project] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            results.append(readProjectRow(stmt))
        }
        return results
    }

    /// Refresh session_count and platform_count for a project from sync_items
    func refreshProjectStats(projectId: String) {
        let sql = """
            UPDATE projects SET
                session_count = (SELECT COUNT(*) FROM sync_items WHERE project_id = ?1),
                platform_count = (SELECT COUNT(DISTINCT source_type) FROM sync_items WHERE project_id = ?1),
                last_activity_at = (SELECT MAX(local_updated_at) FROM sync_items WHERE project_id = ?1),
                updated_at = ?2
            WHERE id = ?1
        """
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else { return }
        defer { sqlite3_finalize(stmt) }

        bind(stmt, 1, projectId)
        bind(stmt, 2, Self.isoFormatter.string(from: Date()))
        sqlite3_step(stmt)
    }

    private func readProjectRow(_ stmt: OpaquePointer) -> Project {
        let id = String(cString: sqlite3_column_text(stmt, 0))
        let canonicalPath = sqlite3_column_type(stmt, 1) != SQLITE_NULL
            ? String(cString: sqlite3_column_text(stmt, 1)) : nil
        let displayName = String(cString: sqlite3_column_text(stmt, 2))
        let cloudClusterId = sqlite3_column_type(stmt, 3) != SQLITE_NULL
            ? String(cString: sqlite3_column_text(stmt, 3)) : nil
        let sessionCount = Int(sqlite3_column_int(stmt, 4))
        let platformCount = Int(sqlite3_column_int(stmt, 5))
        let lastActivityAt = sqlite3_column_type(stmt, 6) != SQLITE_NULL
            ? Self.safeDateParse(String(cString: sqlite3_column_text(stmt, 6))) : nil
        let createdAt = Self.safeDateParse(String(cString: sqlite3_column_text(stmt, 7))) ?? Date()
        let updatedAt = Self.safeDateParse(String(cString: sqlite3_column_text(stmt, 8))) ?? Date()

        return Project(
            id: id, canonicalPath: canonicalPath, displayName: displayName,
            cloudClusterId: cloudClusterId, sessionCount: sessionCount,
            platformCount: platformCount, lastActivityAt: lastActivityAt,
            createdAt: createdAt, updatedAt: updatedAt
        )
    }

    // MARK: - Phase N: Alias CRUD

    func insertAlias(_ alias: ProjectAlias) {
        let sql = """
            INSERT OR IGNORE INTO project_aliases
                (alias_type, alias_value, project_id, confidence, created_by, reasoning, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else { return }
        defer { sqlite3_finalize(stmt) }

        bind(stmt, 1, alias.aliasType)
        bind(stmt, 2, alias.aliasValue)
        bind(stmt, 3, alias.projectId)
        sqlite3_bind_double(stmt, 4, alias.confidence)
        bind(stmt, 5, alias.createdBy)
        bind(stmt, 6, alias.reasoning)
        bind(stmt, 7, Self.isoFormatter.string(from: alias.createdAt))
        sqlite3_step(stmt)
    }

    /// Core resolution: look up a project_id from an alias
    func resolveAlias(type: String, value: String) -> String? {
        let sql = "SELECT project_id FROM project_aliases WHERE alias_type = ? AND alias_value = ? LIMIT 1"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else { return nil }
        defer { sqlite3_finalize(stmt) }

        bind(stmt, 1, type)
        bind(stmt, 2, value)
        guard sqlite3_step(stmt) == SQLITE_ROW else { return nil }
        return String(cString: sqlite3_column_text(stmt, 0))
    }

    /// Fuzzy name lookup: find project_id where alias_value matches (case-insensitive)
    func resolveAliasFuzzy(name: String) -> (projectId: String, confidence: Double)? {
        let sql = """
            SELECT project_id, confidence FROM project_aliases
            WHERE alias_type IN ('name', 'cloud_name')
              AND LOWER(alias_value) = LOWER(?)
            ORDER BY confidence DESC
            LIMIT 1
        """
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else { return nil }
        defer { sqlite3_finalize(stmt) }

        bind(stmt, 1, name)
        guard sqlite3_step(stmt) == SQLITE_ROW else { return nil }
        let pid = String(cString: sqlite3_column_text(stmt, 0))
        let conf = sqlite3_column_double(stmt, 1)
        return (pid, conf)
    }

    /// Fetch all aliases for a project
    func fetchAliases(projectId: String) -> [ProjectAlias] {
        let sql = "SELECT * FROM project_aliases WHERE project_id = ? ORDER BY alias_type"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else { return [] }
        defer { sqlite3_finalize(stmt) }

        bind(stmt, 1, projectId)
        var results: [ProjectAlias] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            let aliasType = String(cString: sqlite3_column_text(stmt, 0))
            let aliasValue = String(cString: sqlite3_column_text(stmt, 1))
            let projectId = String(cString: sqlite3_column_text(stmt, 2))
            let confidence = sqlite3_column_double(stmt, 3)
            let createdBy = String(cString: sqlite3_column_text(stmt, 4))
            let reasoning = sqlite3_column_type(stmt, 5) != SQLITE_NULL
                ? String(cString: sqlite3_column_text(stmt, 5)) : nil
            let createdAt = Self.safeDateParse(String(cString: sqlite3_column_text(stmt, 6))) ?? Date()
            results.append(ProjectAlias(
                aliasType: aliasType, aliasValue: aliasValue, projectId: projectId,
                confidence: confidence, createdBy: createdBy, reasoning: reasoning, createdAt: createdAt
            ))
        }
        return results
    }

    // MARK: - Phase N: Session Intelligence

    func upsertSessionIntelligence(sessionId: String, projectId: String?, platform: String,
                                    fields: [String: Any]) {
        // Build dynamic SET clause from fields dict
        var columns = ["session_id", "project_id", "platform"]
        var placeholders = ["?", "?", "?"]
        var updates = ["project_id = COALESCE(excluded.project_id, project_id)",
                       "platform = excluded.platform"]

        let validColumns: Set<String> = [
            "summary_local", "tools_used", "model", "token_count", "git_branch",
            "duration_seconds", "msg_count_user", "msg_count_assistant", "has_errors",
            "first_prompt", "last_prompt", "extracted_at",
            "cloud_memory_id", "summary_cloud", "category", "intent", "primary_intent",
            "task_type", "next_phase_hint", "key_result", "cloud_tags", "technologies",
            "tools_validated", "impact_json", "context_json", "work_items_json",
            "blockers_json", "completions_json", "decisions_json", "lesson_json",
            "causal_json", "workflow_json", "cloud_synced_at"
        ]

        var orderedValues: [Any?] = [sessionId, projectId, platform]

        for (key, value) in fields {
            guard validColumns.contains(key) else { continue }
            columns.append(key)
            placeholders.append("?")
            updates.append("\(key) = COALESCE(excluded.\(key), \(key))")
            orderedValues.append(value)
        }

        let sql = """
            INSERT INTO session_intelligence (\(columns.joined(separator: ", ")))
            VALUES (\(placeholders.joined(separator: ", ")))
            ON CONFLICT(session_id) DO UPDATE SET
                \(updates.joined(separator: ",\n                "))
        """

        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else { return }
        defer { sqlite3_finalize(stmt) }

        for (i, value) in orderedValues.enumerated() {
            let idx = Int32(i + 1)
            if let s = value as? String { bind(stmt, idx, s) }
            else if let n = value as? Int { sqlite3_bind_int64(stmt, idx, Int64(n)) }
            else if let d = value as? Double { sqlite3_bind_double(stmt, idx, d) }
            else { sqlite3_bind_null(stmt, idx) }
        }
        sqlite3_step(stmt)
    }

    // MARK: - Phase N: Tool tracking

    func insertSessionTool(sessionId: String, toolName: String, count: Int) {
        let sql = """
            INSERT INTO session_tools (session_id, tool_name, invocation_count)
            VALUES (?, ?, ?)
            ON CONFLICT(session_id, tool_name) DO UPDATE SET
                invocation_count = invocation_count + excluded.invocation_count
        """
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else { return }
        defer { sqlite3_finalize(stmt) }

        bind(stmt, 1, sessionId)
        bind(stmt, 2, toolName)
        sqlite3_bind_int(stmt, 3, Int32(count))
        sqlite3_step(stmt)
    }

    func fetchToolsForProject(projectId: String, limit: Int = 20) -> [(tool: String, sessions: Int, total: Int)] {
        let sql = """
            SELECT st.tool_name, COUNT(DISTINCT st.session_id), SUM(st.invocation_count)
            FROM session_tools st
            JOIN session_intelligence si ON st.session_id = si.session_id
            WHERE si.project_id = ?
            GROUP BY st.tool_name
            ORDER BY COUNT(DISTINCT st.session_id) DESC
            LIMIT ?
        """
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else { return [] }
        defer { sqlite3_finalize(stmt) }

        bind(stmt, 1, projectId)
        sqlite3_bind_int(stmt, 2, Int32(limit))
        var results: [(String, Int, Int)] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            let tool = String(cString: sqlite3_column_text(stmt, 0))
            let sessions = Int(sqlite3_column_int(stmt, 1))
            let total = Int(sqlite3_column_int(stmt, 2))
            results.append((tool, sessions, total))
        }
        return results
    }

    // MARK: - Phase N: Update project_id on sync_items

    /// Fetch sync_items that have no project_id (for backfill).
    /// Only returns sessionId, sourceType, project, sourcePath — minimal memory footprint.
    func fetchItemsWithoutProject() -> [(sessionId: String, sourceType: String, project: String, sourcePath: String)] {
        let sql = """
            SELECT session_id, source_type, project, source_path
            FROM sync_items WHERE project_id IS NULL
            ORDER BY local_updated_at DESC
        """
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else { return [] }
        defer { sqlite3_finalize(stmt) }

        var results: [(String, String, String, String)] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            let sid = String(cString: sqlite3_column_text(stmt, 0))
            let st = String(cString: sqlite3_column_text(stmt, 1))
            let proj = String(cString: sqlite3_column_text(stmt, 2))
            let sp = String(cString: sqlite3_column_text(stmt, 3))
            results.append((sid, st, proj, sp))
        }
        return results
    }

    func updateSyncItemProjectId(sessionId: String, projectId: String) {
        let sql = "UPDATE sync_items SET project_id = ? WHERE session_id = ?"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else { return }
        defer { sqlite3_finalize(stmt) }

        bind(stmt, 1, projectId)
        bind(stmt, 2, sessionId)
        sqlite3_step(stmt)
    }

    // MARK: - Phase N: Session Entity tracking

    func insertSessionEntity(sessionId: String, name: String, entityType: String,
                              mentions: Int, source: String) {
        let sql = """
            INSERT INTO session_entities (session_id, name, entity_type, mentions, source)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(session_id, name, entity_type) DO UPDATE SET
                mentions = mentions + excluded.mentions
        """
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else { return }
        defer { sqlite3_finalize(stmt) }

        bind(stmt, 1, sessionId)
        bind(stmt, 2, name)
        bind(stmt, 3, entityType)
        sqlite3_bind_int(stmt, 4, Int32(mentions))
        bind(stmt, 5, source)
        sqlite3_step(stmt)
    }

    // MARK: - Phase K: File Attribution

    func insertFileAttribution(sessionId: String, filePath: String, version: Int) {
        let sql = """
            INSERT OR REPLACE INTO session_files (session_id, file_path, version)
            VALUES (?, ?, ?)
        """
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else { return }
        defer { sqlite3_finalize(stmt) }

        bind(stmt, 1, sessionId)
        bind(stmt, 2, filePath)
        sqlite3_bind_int(stmt, 3, Int32(version))
        sqlite3_step(stmt)
    }

    func fetchFilesForSession(sessionId: String) -> [(path: String, version: Int)] {
        let sql = "SELECT file_path, version FROM session_files WHERE session_id = ? ORDER BY version DESC"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else { return [] }
        defer { sqlite3_finalize(stmt) }

        bind(stmt, 1, sessionId)
        var results: [(String, Int)] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            let path = String(cString: sqlite3_column_text(stmt, 0))
            let version = Int(sqlite3_column_int(stmt, 1))
            results.append((path, version))
        }
        return results
    }

    /// Fetch top files for a project (across all sessions in that project)
    func fetchTopFilesForProject(project: String, limit: Int = 8) -> [(path: String, sessions: Int, maxVersion: Int)] {
        let sql = """
            SELECT sf.file_path, COUNT(DISTINCT sf.session_id) as sessions, MAX(sf.version) as max_ver
            FROM session_files sf
            JOIN sync_items si ON sf.session_id = si.session_id
            WHERE si.project = ?
            GROUP BY sf.file_path
            ORDER BY sessions DESC, max_ver DESC
            LIMIT ?
        """
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else { return [] }
        defer { sqlite3_finalize(stmt) }

        bind(stmt, 1, project)
        sqlite3_bind_int(stmt, 2, Int32(limit))
        var results: [(String, Int, Int)] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            let path = String(cString: sqlite3_column_text(stmt, 0))
            let sessions = Int(sqlite3_column_int(stmt, 1))
            let maxVer = Int(sqlite3_column_int(stmt, 2))
            results.append((path, sessions, maxVer))
        }
        return results
    }

    /// Count total unique files and sessions with files for a project
    func fileStatsForProject(project: String) -> (fileCount: Int, sessionCount: Int) {
        let sql = """
            SELECT COUNT(DISTINCT sf.file_path), COUNT(DISTINCT sf.session_id)
            FROM session_files sf
            JOIN sync_items si ON sf.session_id = si.session_id
            WHERE si.project = ?
        """
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else { return (0, 0) }
        defer { sqlite3_finalize(stmt) }

        bind(stmt, 1, project)
        guard sqlite3_step(stmt) == SQLITE_ROW else { return (0, 0) }
        return (Int(sqlite3_column_int(stmt, 0)), Int(sqlite3_column_int(stmt, 1)))
    }

    func hasFileAttribution(sessionId: String) -> Bool {
        let sql = "SELECT COUNT(*) FROM session_files WHERE session_id = ?"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else { return false }
        defer { sqlite3_finalize(stmt) }

        bind(stmt, 1, sessionId)
        guard sqlite3_step(stmt) == SQLITE_ROW else { return false }
        return sqlite3_column_int(stmt, 0) > 0
    }

    /// Phase I migration: session_summaries table for compaction summaries
    private func migratePhaseI() {
        let migrationKey = "migration_phase_i"
        if getMeta(key: migrationKey) != nil { return }

        exec("""
            CREATE TABLE IF NOT EXISTS session_summaries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                collapse_id TEXT,
                summary_text TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sync_items(session_id)
            );
            CREATE INDEX IF NOT EXISTS idx_summaries_session ON session_summaries(session_id);
        """)

        setMeta(key: migrationKey, value: "done")
    }

    // MARK: - Phase I: Compaction Summaries

    func insertSummary(sessionId: String, collapseId: String?, summaryText: String) {
        let sql = """
            INSERT INTO session_summaries (session_id, collapse_id, summary_text, created_at)
            VALUES (?, ?, ?, ?)
        """
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else { return }
        defer { sqlite3_finalize(stmt) }

        bind(stmt, 1, sessionId)
        bind(stmt, 2, collapseId)
        bind(stmt, 3, summaryText)
        bind(stmt, 4, Self.isoFormatter.string(from: Date()))
        sqlite3_step(stmt)
    }

    func fetchSummaries(sessionId: String) -> [String] {
        let sql = "SELECT summary_text FROM session_summaries WHERE session_id = ? ORDER BY id ASC"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else { return [] }
        defer { sqlite3_finalize(stmt) }

        bind(stmt, 1, sessionId)
        var results: [String] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            results.append(String(cString: sqlite3_column_text(stmt, 0)))
        }
        return results
    }

    /// Fetch all session IDs that have at least one summary — single query for batch lookup
    func allSessionIdsWithSummaries() -> Set<String> {
        let sql = "SELECT DISTINCT session_id FROM session_summaries"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else { return [] }
        defer { sqlite3_finalize(stmt) }

        var results: Set<String> = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            results.insert(String(cString: sqlite3_column_text(stmt, 0)))
        }
        return results
    }

    func hasSummaries(sessionId: String) -> Bool {
        let sql = "SELECT COUNT(*) FROM session_summaries WHERE session_id = ?"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else { return false }
        defer { sqlite3_finalize(stmt) }

        bind(stmt, 1, sessionId)
        guard sqlite3_step(stmt) == SQLITE_ROW else { return false }
        return sqlite3_column_int(stmt, 0) > 0
    }

    // MARK: - CRUD

    /// Insert or update a sync item keyed by sessionId
    func upsert(_ item: SyncItem) {
        let sql = """
            INSERT INTO sync_items
                (origin, source_type, session_id, title, project, local_path, source_path,
                 local_hash, file_size, message_count, cloud_id, sync_state, source_deleted,
                 cloud_updated_at, local_updated_at, created_at,
                 custom_title, ai_title, tags, pr_link, last_prompt, worktree_branch, session_mode,
                 project_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET
                title = excluded.title,
                local_path = excluded.local_path,
                source_path = excluded.source_path,
                local_hash = excluded.local_hash,
                file_size = excluded.file_size,
                message_count = excluded.message_count,
                cloud_id = COALESCE(excluded.cloud_id, cloud_id),
                sync_state = excluded.sync_state,
                source_deleted = excluded.source_deleted,
                cloud_updated_at = COALESCE(excluded.cloud_updated_at, cloud_updated_at),
                local_updated_at = excluded.local_updated_at,
                custom_title = COALESCE(excluded.custom_title, custom_title),
                ai_title = COALESCE(excluded.ai_title, ai_title),
                tags = COALESCE(excluded.tags, tags),
                pr_link = COALESCE(excluded.pr_link, pr_link),
                last_prompt = COALESCE(excluded.last_prompt, last_prompt),
                worktree_branch = COALESCE(excluded.worktree_branch, worktree_branch),
                session_mode = COALESCE(excluded.session_mode, session_mode),
                project_id = COALESCE(excluded.project_id, project_id)
        """

        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else { return }
        defer { sqlite3_finalize(stmt) }

        bind(stmt, 1, item.origin)
        bind(stmt, 2, item.sourceType)
        bind(stmt, 3, item.sessionId)
        bind(stmt, 4, item.title)
        bind(stmt, 5, item.project)
        bind(stmt, 6, item.localPath)
        bind(stmt, 7, item.sourcePath)
        bind(stmt, 8, item.localHash)
        sqlite3_bind_int64(stmt, 9, Int64(item.fileSize))
        if let mc = item.messageCount { sqlite3_bind_int(stmt, 10, Int32(mc)) }
        else { sqlite3_bind_null(stmt, 10) }
        bind(stmt, 11, item.cloudId)
        bind(stmt, 12, item.syncState.rawValue)
        sqlite3_bind_int(stmt, 13, item.sourceDeleted ? 1 : 0)
        bind(stmt, 14, item.cloudUpdatedAt.map { Self.isoFormatter.string(from: $0) })
        bind(stmt, 15, Self.isoFormatter.string(from: item.localUpdatedAt))
        bind(stmt, 16, Self.isoFormatter.string(from: item.createdAt))
        bind(stmt, 17, item.customTitle)
        bind(stmt, 18, item.aiTitle)
        bind(stmt, 19, item.tags)
        bind(stmt, 20, item.prLink)
        bind(stmt, 21, item.lastPrompt)
        bind(stmt, 22, item.worktreeBranch)
        bind(stmt, 23, item.sessionMode)
        bind(stmt, 24, item.projectId)

        sqlite3_step(stmt)
    }

    /// Fetch a single item by sessionId
    func fetch(sessionId: String) -> SyncItem? {
        let sql = "SELECT * FROM sync_items WHERE session_id = ? LIMIT 1"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else { return nil }
        defer { sqlite3_finalize(stmt) }

        bind(stmt, 1, sessionId)
        guard sqlite3_step(stmt) == SQLITE_ROW else { return nil }
        return readRow(stmt)
    }

    /// Fetch all items (for migration verification, stats, etc.)
    func fetchAll() -> [SyncItem] {
        let sql = "SELECT * FROM sync_items ORDER BY local_updated_at DESC"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else { return [] }
        defer { sqlite3_finalize(stmt) }

        var items: [SyncItem] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            items.append(readRow(stmt))
        }
        return items
    }

    /// Fetch items that are not marked as source deleted (for deletion detection)
    func fetchNonDeletedSourcePaths() -> [(sessionId: String, sourcePath: String)] {
        let sql = "SELECT session_id, source_path FROM sync_items WHERE source_deleted = 0 AND origin = 'local'"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else { return [] }
        defer { sqlite3_finalize(stmt) }

        var results: [(String, String)] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            let sid = String(cString: sqlite3_column_text(stmt, 0))
            let path = String(cString: sqlite3_column_text(stmt, 1))
            results.append((sid, path))
        }
        return results
    }

    // MARK: - State Updates

    func markSourceDeleted(sessionId: String) {
        exec("UPDATE sync_items SET source_deleted = 1 WHERE session_id = '\(sessionId.sqlEscaped)'")
    }

    /// Delete a sync item from the database entirely
    func delete(sessionId: String) {
        exec("DELETE FROM sync_items WHERE session_id = '\(sessionId.sqlEscaped)'")
    }

    /// Update tail metadata for an existing session (Phase G backfill)
    func updateTailMetadata(sessionId: String, customTitle: String?, aiTitle: String?,
                            tags: String?, prLink: String?, lastPrompt: String?,
                            worktreeBranch: String?, sessionMode: String?) {
        let sql = """
            UPDATE sync_items SET
                custom_title = COALESCE(?, custom_title),
                ai_title = COALESCE(?, ai_title),
                tags = COALESCE(?, tags),
                pr_link = COALESCE(?, pr_link),
                last_prompt = COALESCE(?, last_prompt),
                worktree_branch = COALESCE(?, worktree_branch),
                session_mode = COALESCE(?, session_mode)
            WHERE session_id = ?
        """
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else { return }
        defer { sqlite3_finalize(stmt) }

        bind(stmt, 1, customTitle)
        bind(stmt, 2, aiTitle)
        bind(stmt, 3, tags)
        bind(stmt, 4, prLink)
        bind(stmt, 5, lastPrompt)
        bind(stmt, 6, worktreeBranch)
        bind(stmt, 7, sessionMode)
        bind(stmt, 8, sessionId)

        sqlite3_step(stmt)
    }

    /// Fetch Claude Code session IDs that need tail metadata backfill
    func fetchSessionsNeedingTailMetadata() -> [(sessionId: String, sourcePath: String)] {
        let sql = """
            SELECT session_id, source_path FROM sync_items
            WHERE source_type = 'claude_code'
              AND custom_title IS NULL
              AND ai_title IS NULL
              AND source_deleted = 0
        """
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else { return [] }
        defer { sqlite3_finalize(stmt) }

        var results: [(String, String)] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            let sid = String(cString: sqlite3_column_text(stmt, 0))
            let path = String(cString: sqlite3_column_text(stmt, 1))
            results.append((sid, path))
        }
        return results
    }

    /// Fetch Claude Code sessions that don't have compact summaries yet
    func fetchSessionsNeedingSummaries() -> [(sessionId: String, sourcePath: String)] {
        let sql = """
            SELECT si.session_id, si.source_path FROM sync_items si
            LEFT JOIN session_summaries ss ON si.session_id = ss.session_id
            WHERE si.source_type = 'claude_code'
              AND si.source_deleted = 0
              AND ss.id IS NULL
        """
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else { return [] }
        defer { sqlite3_finalize(stmt) }

        var results: [(String, String)] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            let sid = String(cString: sqlite3_column_text(stmt, 0))
            let path = String(cString: sqlite3_column_text(stmt, 1))
            results.append((sid, path))
        }
        return results
    }

    func markCloudSynced(sessionId: String, cloudId: String? = nil) {
        let now = Self.isoFormatter.string(from: Date())
        if let cloudId {
            exec("""
                UPDATE sync_items SET sync_state = 'synced', cloud_id = '\(cloudId.sqlEscaped)',
                cloud_updated_at = '\(now)' WHERE session_id = '\(sessionId.sqlEscaped)'
            """)
        } else {
            exec("""
                UPDATE sync_items SET sync_state = 'synced',
                cloud_updated_at = '\(now)' WHERE session_id = '\(sessionId.sqlEscaped)'
            """)
        }
    }

    // MARK: - Stats

    func count() -> Int {
        queryInt("SELECT COUNT(*) FROM sync_items")
    }

    func totalSize() -> UInt64 {
        UInt64(queryInt("SELECT COALESCE(SUM(file_size), 0) FROM sync_items"))
    }

    func deletedSourceCount() -> Int {
        queryInt("SELECT COUNT(*) FROM sync_items WHERE source_deleted = 1")
    }

    func pendingCloudSyncCount() -> Int {
        queryInt("SELECT COUNT(*) FROM sync_items WHERE sync_state = 'local_only'")
    }

    func isCloudSynced(sessionId: String) -> Bool {
        let sql = "SELECT sync_state FROM sync_items WHERE session_id = ? LIMIT 1"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else { return false }
        defer { sqlite3_finalize(stmt) }

        bind(stmt, 1, sessionId)
        guard sqlite3_step(stmt) == SQLITE_ROW else { return false }
        let state = String(cString: sqlite3_column_text(stmt, 0))
        return state == SyncState.synced.rawValue || state == SyncState.cloudOnly.rawValue
    }

    // MARK: - Metadata

    func setMeta(key: String, value: String) {
        exec("INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('\(key.sqlEscaped)', '\(value.sqlEscaped)')")
    }

    func getMeta(key: String) -> String? {
        let sql = "SELECT value FROM sync_meta WHERE key = ? LIMIT 1"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else { return nil }
        defer { sqlite3_finalize(stmt) }

        bind(stmt, 1, key)
        guard sqlite3_step(stmt) == SQLITE_ROW else { return nil }
        return String(cString: sqlite3_column_text(stmt, 0))
    }

    // MARK: - Helpers

    private func exec(_ sql: String) {
        var errMsg: UnsafeMutablePointer<CChar>?
        if sqlite3_exec(db, sql, nil, nil, &errMsg) != SQLITE_OK {
            if let errMsg {
                print("[SyncDatabase] SQL error: \(String(cString: errMsg))")
                sqlite3_free(errMsg)
            }
        }
    }

    private func queryInt(_ sql: String) -> Int {
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else { return 0 }
        defer { sqlite3_finalize(stmt) }
        guard sqlite3_step(stmt) == SQLITE_ROW else { return 0 }
        return Int(sqlite3_column_int64(stmt, 0))
    }

    /// Safe date parsing — guards against malformed strings that crash ICU's parser.
    /// ICU's udat_parseCalendar segfaults on certain inputs even when they're ASCII.
    private static let dateRegex = try! NSRegularExpression(pattern: #"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}"#)

    private static func safeDateParse(_ str: String) -> Date? {
        // Must match ISO8601 prefix pattern: YYYY-MM-DDTHH:MM:SS
        let range = NSRange(str.startIndex..., in: str)
        guard dateRegex.firstMatch(in: str, range: range) != nil else { return nil }
        return isoFormatter.date(from: str)
    }

    private func bind(_ stmt: OpaquePointer, _ index: Int32, _ value: String?) {
        if let value {
            sqlite3_bind_text(stmt, index, (value as NSString).utf8String, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self))
        } else {
            sqlite3_bind_null(stmt, index)
        }
    }

    /// Read a SyncItem from a prepared statement at current row position.
    /// Column order matches SELECT * (id, origin, source_type, session_id, title, project,
    /// local_path, source_path, local_hash, file_size, message_count, cloud_id, sync_state,
    /// source_deleted, cloud_updated_at, local_updated_at, created_at,
    /// custom_title, ai_title, tags, pr_link, last_prompt, worktree_branch, session_mode,
    /// project_id)
    private func readRow(_ stmt: OpaquePointer) -> SyncItem {
        let id = sqlite3_column_int64(stmt, 0)
        let origin = String(cString: sqlite3_column_text(stmt, 1))
        let sourceType = String(cString: sqlite3_column_text(stmt, 2))
        let sessionId = String(cString: sqlite3_column_text(stmt, 3))
        let title = sqlite3_column_type(stmt, 4) != SQLITE_NULL ? String(cString: sqlite3_column_text(stmt, 4)) : nil
        let project = String(cString: sqlite3_column_text(stmt, 5))
        let localPath = String(cString: sqlite3_column_text(stmt, 6))
        let sourcePath = String(cString: sqlite3_column_text(stmt, 7))
        let localHash = String(cString: sqlite3_column_text(stmt, 8))
        let fileSize = UInt64(sqlite3_column_int64(stmt, 9))
        let messageCount = sqlite3_column_type(stmt, 10) != SQLITE_NULL ? Int(sqlite3_column_int(stmt, 10)) : nil
        let cloudId = sqlite3_column_type(stmt, 11) != SQLITE_NULL ? String(cString: sqlite3_column_text(stmt, 11)) : nil
        let syncStateRaw = String(cString: sqlite3_column_text(stmt, 12))
        let sourceDeleted = sqlite3_column_int(stmt, 13) != 0
        let cloudUpdatedAt = sqlite3_column_type(stmt, 14) != SQLITE_NULL
            ? Self.safeDateParse(String(cString: sqlite3_column_text(stmt, 14))) : nil
        let localUpdatedAtStr = String(cString: sqlite3_column_text(stmt, 15))
        let createdAtStr = String(cString: sqlite3_column_text(stmt, 16))

        // Phase G: tail metadata columns (17-23)
        let colCount = sqlite3_column_count(stmt)
        let customTitle = colCount > 17 && sqlite3_column_type(stmt, 17) != SQLITE_NULL
            ? String(cString: sqlite3_column_text(stmt, 17)) : nil
        let aiTitle = colCount > 18 && sqlite3_column_type(stmt, 18) != SQLITE_NULL
            ? String(cString: sqlite3_column_text(stmt, 18)) : nil
        let tags = colCount > 19 && sqlite3_column_type(stmt, 19) != SQLITE_NULL
            ? String(cString: sqlite3_column_text(stmt, 19)) : nil
        let prLink = colCount > 20 && sqlite3_column_type(stmt, 20) != SQLITE_NULL
            ? String(cString: sqlite3_column_text(stmt, 20)) : nil
        let lastPromptCol = colCount > 21 && sqlite3_column_type(stmt, 21) != SQLITE_NULL
            ? String(cString: sqlite3_column_text(stmt, 21)) : nil
        let worktreeBranch = colCount > 22 && sqlite3_column_type(stmt, 22) != SQLITE_NULL
            ? String(cString: sqlite3_column_text(stmt, 22)) : nil
        let sessionMode = colCount > 23 && sqlite3_column_type(stmt, 23) != SQLITE_NULL
            ? String(cString: sqlite3_column_text(stmt, 23)) : nil
        let projectId = colCount > 24 && sqlite3_column_type(stmt, 24) != SQLITE_NULL
            ? String(cString: sqlite3_column_text(stmt, 24)) : nil

        return SyncItem(
            id: id,
            origin: origin,
            sourceType: sourceType,
            sessionId: sessionId,
            title: title,
            project: project,
            localPath: localPath,
            sourcePath: sourcePath,
            localHash: localHash,
            fileSize: fileSize,
            messageCount: messageCount,
            cloudId: cloudId,
            syncState: SyncState(rawValue: syncStateRaw) ?? .localOnly,
            sourceDeleted: sourceDeleted,
            cloudUpdatedAt: cloudUpdatedAt,
            localUpdatedAt: Self.safeDateParse(localUpdatedAtStr) ?? Date(),
            createdAt: Self.safeDateParse(createdAtStr) ?? Date(),
            customTitle: customTitle,
            aiTitle: aiTitle,
            tags: tags,
            prLink: prLink,
            lastPrompt: lastPromptCol,
            worktreeBranch: worktreeBranch,
            sessionMode: sessionMode,
            projectId: projectId
        )
    }
}

// MARK: - SQL Escaping

private extension String {
    var sqlEscaped: String {
        replacingOccurrences(of: "'", with: "''")
    }
}
