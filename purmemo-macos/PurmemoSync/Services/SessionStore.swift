import Foundation
import CryptoKit
import SQLite3

// MARK: - SessionStore

/// Append-only local store for AI tool sessions.
/// Copies files to ~/purmemo sync/ and tracks sync state in SQLite.
/// Never deletes local copies — if the source tool purges, our copy survives.
@Observable
class SessionStore {

    static let shared = SessionStore()

    /// ~/purmemo sync/claude-code/sessions/
    let storeRoot: URL

    private let claudeProjectsPath: String
    private let fm = FileManager.default
    let queue = DispatchQueue(label: "ai.purmemo.session-store", qos: .utility)

    /// SQLite sync ledger — replaces manifest.json
    private(set) var database: SyncDatabase!

    /// Stats exposed to UI (updated on main thread)
    var syncedCount: Int = 0
    var lastSyncTime: Date?
    var isSyncing: Bool = false

    /// ~/purmemo sync/ — user-visible local store.
    static let purmemoHome: URL = {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("purmemo sync")
    }()

    private init() {
        let home = fm.homeDirectoryForCurrentUser
        claudeProjectsPath = home.appendingPathComponent(".claude/projects").path

        storeRoot = Self.purmemoHome.appendingPathComponent("anthropic/claude-code/sessions")

        // Ensure directories exist
        do {
            try fm.createDirectory(at: storeRoot, withIntermediateDirectories: true)
            Log.shared.info("Store root: \(storeRoot.path)", source: "SessionStore")
        } catch {
            Log.shared.error("Failed to create store directory: \(error)", source: "SessionStore")
        }

        // Initialize SQLite database
        let dbPath = Self.purmemoHome.appendingPathComponent(".purmemo.db").path
        database = SyncDatabase(path: dbPath, queue: queue)

        // Migrate from legacy manifest.json if it exists
        let manifestURL = Self.purmemoHome.appendingPathComponent(".manifest.json")
        ManifestMigrator.migrateIfNeeded(manifestURL: manifestURL, database: database)

        syncedCount = database.count()
        Log.shared.info("Database ready: \(syncedCount) items tracked", source: "SessionStore")
    }

    // MARK: - Full Sync

    /// Scan all Claude Code project dirs and copy new/modified sessions
    func fullSync() {
        queue.async { [self] in
            DispatchQueue.main.async { self.isSyncing = true }

            guard let projectDirs = try? fm.contentsOfDirectory(atPath: claudeProjectsPath) else {
                DispatchQueue.main.async { self.isSyncing = false }
                return
            }

            var newCopies = 0
            var updates = 0

            for dir in projectDirs {
                let dirPath = "\(claudeProjectsPath)/\(dir)"
                guard let files = try? fm.contentsOfDirectory(atPath: dirPath) else { continue }

                let jsonlFiles = files.filter { $0.hasSuffix(".jsonl") }
                let projectName = Self.projectNameFromDir(dir)

                // Phase N: Read real cwd from first JSONL (not dir name decode — ambiguous hyphens)
                let cwd = Self.readCwdFromFirstJsonl(dirPath: dirPath, files: jsonlFiles)
                let projectId = ProjectResolver.shared.resolve(
                    cwd: cwd, displayName: projectName, platform: "claude_code"
                )

                for file in jsonlFiles {
                    let sourcePath = "\(dirPath)/\(file)"
                    let sessionId = file.replacingOccurrences(of: ".jsonl", with: "")

                    let result = syncFile(
                        sourcePath: sourcePath,
                        sessionId: sessionId,
                        project: projectName,
                        projectId: projectId
                    )

                    switch result {
                    case .copied: newCopies += 1
                    case .updated: updates += 1
                    case .skipped, .failed: break
                    }
                }
            }

            // Mark sessions whose source has disappeared
            markDeletedSources()

            // Record last scan time
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            database.setMeta(key: "last_full_scan", value: formatter.string(from: Date()))

            let total = database.count()
            DispatchQueue.main.async {
                self.syncedCount = total
                self.lastSyncTime = Date()
                self.isSyncing = false
            }

            if newCopies > 0 || updates > 0 {
                log("Sync complete: \(newCopies) new, \(updates) updated, \(total) total")
            }

            // Phase G: Backfill tail metadata for sessions that don't have it yet
            backfillTailMetadata()

            // Phase N: Backfill project linkage for existing sessions (runs once)
            ProjectResolver.shared.backfillExistingSyncItems()
        }
    }

    /// Extract tail metadata (titles, tags, PR links) for sessions that haven't been scanned yet.
    /// Runs on the sync queue, after fullSync. Only processes sessions missing metadata.
    private func backfillTailMetadata() {
        let sessions = database.fetchSessionsNeedingTailMetadata()
        guard !sessions.isEmpty else { return }

        var filled = 0
        for (sessionId, sourcePath) in sessions {
            // Prefer the local copy if it exists, fall back to source
            let localCopy = storeRoot.appendingPathComponent(
                database.fetch(sessionId: sessionId)?.localPath ?? ""
            ).path
            let pathToScan = fm.fileExists(atPath: localCopy) ? localCopy : sourcePath
            guard fm.fileExists(atPath: pathToScan) else { continue }

            let tail = SessionScanner.readTailMetadata(filePath: pathToScan)

            // Only update if we found something (metadata OR summaries OR file attribution)
            guard tail.customTitle != nil || tail.aiTitle != nil || tail.lastPrompt != nil
                  || !tail.compactionSummaries.isEmpty || !tail.trackedFiles.isEmpty else { continue }

            database.updateTailMetadata(
                sessionId: sessionId,
                customTitle: tail.customTitle,
                aiTitle: tail.aiTitle,
                tags: tail.tags.isEmpty ? nil : tail.tags.joined(separator: ","),
                prLink: tail.prLink,
                lastPrompt: tail.lastPrompt,
                worktreeBranch: tail.worktreeBranch,
                sessionMode: tail.sessionMode
            )

            // Phase I: Store compaction summaries if found
            if !tail.compactionSummaries.isEmpty && !database.hasSummaries(sessionId: sessionId) {
                for summary in tail.compactionSummaries {
                    database.insertSummary(sessionId: sessionId, collapseId: nil, summaryText: summary)
                }
            }

            // Phase K: Store file attribution if found
            if !tail.trackedFiles.isEmpty && !database.hasFileAttribution(sessionId: sessionId) {
                for (path, version) in tail.trackedFiles {
                    database.insertFileAttribution(sessionId: sessionId, filePath: path, version: version)
                }
            }

            filled += 1
        }

        if filled > 0 {
            log("Tail metadata backfill: \(filled)/\(sessions.count) sessions enriched")
        }

        // Separate pass for compact summaries — needed because the metadata backfill
        // skips sessions that already have titles, but those sessions may still lack summaries.
        backfillCompactSummaries()
    }

    /// Extract compact summaries (isCompactSummary:true) for sessions that don't have them yet.
    /// These are LLM-generated session summaries Claude creates during context compaction.
    private func backfillCompactSummaries() {
        let sessions = database.fetchSessionsNeedingSummaries()
        guard !sessions.isEmpty else { return }

        var filled = 0
        for (sessionId, sourcePath) in sessions {
            let localCopy = storeRoot.appendingPathComponent(
                database.fetch(sessionId: sessionId)?.localPath ?? ""
            ).path
            let pathToScan = fm.fileExists(atPath: localCopy) ? localCopy : sourcePath
            guard fm.fileExists(atPath: pathToScan) else { continue }

            let tail = SessionScanner.readTailMetadata(filePath: pathToScan)
            if !tail.compactionSummaries.isEmpty {
                for summary in tail.compactionSummaries {
                    database.insertSummary(sessionId: sessionId, collapseId: nil, summaryText: summary)
                }
                filled += 1
            }
        }

        if filled > 0 {
            log("Compact summary backfill: \(filled) sessions with summaries extracted")
        }
    }

    // MARK: - Single File Sync

    enum SyncResult {
        case copied, updated, skipped, failed
    }

    /// Sync a single JSONL file. Called by fullSync and by the FSEvents watcher.
    func syncFile(sourcePath: String, sessionId: String, project: String, projectId: String? = nil) -> SyncResult {
        // Guard: skip if source file no longer exists (deleted by Claude Code)
        guard fm.fileExists(atPath: sourcePath) else { return .failed }

        guard let attrs = try? fm.attributesOfItem(atPath: sourcePath),
              let sourceSize = attrs[.size] as? UInt64 else { return .failed }

        guard let sourceHash = hashFile(at: sourcePath) else { return .failed }

        // Check if we already have this session
        if let existing = database.fetch(sessionId: sessionId) {
            if existing.localHash == sourceHash {
                return .skipped
            }
            // Source changed — update our copy
            // Cloud-origin items have localPath relative to ~/purmemo sync/,
            // local-origin items have localPath relative to storeRoot (claude-code/sessions/)
            let localURL = existing.origin == "cloud"
                ? Self.purmemoHome.appendingPathComponent(existing.localPath)
                : storeRoot.appendingPathComponent(existing.localPath)
            do {
                if fm.fileExists(atPath: localURL.path) {
                    try fm.removeItem(at: localURL)
                }
                try fm.copyItem(atPath: sourcePath, toPath: localURL.path)

                database.upsert(SyncItem(
                    id: existing.id,
                    origin: "local",
                    sourceType: existing.sourceType,
                    sessionId: sessionId,
                    title: existing.title,
                    project: existing.project,
                    localPath: existing.localPath,
                    sourcePath: sourcePath,
                    localHash: sourceHash,
                    fileSize: sourceSize,
                    messageCount: existing.messageCount,
                    cloudId: existing.cloudId,
                    syncState: .localOnly, // needs re-sync to cloud
                    sourceDeleted: false,
                    cloudUpdatedAt: existing.cloudUpdatedAt,
                    localUpdatedAt: Date(),
                    createdAt: existing.createdAt,
                    customTitle: existing.customTitle, aiTitle: existing.aiTitle,
                    tags: existing.tags, prLink: existing.prLink,
                    lastPrompt: existing.lastPrompt, worktreeBranch: existing.worktreeBranch,
                    sessionMode: existing.sessionMode,
                    projectId: existing.projectId
                ))
                return .updated
            } catch {
                log("Failed to update \(sessionId): \(error)")
                return .failed
            }
        }

        // New session — copy it
        let relativePath = "\(project)/\(sessionId).jsonl"
        let destURL = storeRoot.appendingPathComponent(relativePath)

        do {
            try fm.createDirectory(at: destURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            if fm.fileExists(atPath: destURL.path) {
                try fm.removeItem(at: destURL)
            }
            try fm.copyItem(atPath: sourcePath, toPath: destURL.path)

            // Run tail metadata extraction on the new local copy
            let tail = SessionScanner.readTailMetadata(filePath: destURL.path)

            database.upsert(SyncItem(
                id: 0,
                origin: "local",
                sourceType: "claude_code",
                sessionId: sessionId,
                title: tail.customTitle ?? tail.aiTitle,
                project: project,
                localPath: relativePath,
                sourcePath: sourcePath,
                localHash: sourceHash,
                fileSize: sourceSize,
                messageCount: nil,
                cloudId: nil,
                syncState: .localOnly,
                sourceDeleted: false,
                cloudUpdatedAt: nil,
                localUpdatedAt: Date(),
                createdAt: Date(),
                customTitle: tail.customTitle, aiTitle: tail.aiTitle,
                tags: tail.tags.isEmpty ? nil : tail.tags.joined(separator: ","),
                prLink: tail.prLink, lastPrompt: tail.lastPrompt,
                worktreeBranch: tail.worktreeBranch, sessionMode: tail.sessionMode,
                projectId: projectId
            ))
            return .copied
        } catch {
            log("Failed to copy \(sessionId): \(error)")
            return .failed
        }
    }

    // MARK: - Detect Deleted Sources

    private func markDeletedSources() {
        let entries = database.fetchNonDeletedSourcePaths()
        for (sessionId, sourcePath) in entries {
            if !fm.fileExists(atPath: sourcePath) {
                database.markSourceDeleted(sessionId: sessionId)
            }
        }
    }

    // MARK: - Helpers

    private func hashFile(at path: String) -> String? {
        guard let handle = FileHandle(forReadingAtPath: path) else { return nil }
        defer { handle.closeFile() }

        var hasher = SHA256()
        while autoreleasepool(invoking: {
            let chunk = handle.readData(ofLength: 65536)
            if chunk.isEmpty { return false }
            hasher.update(data: chunk)
            return true
        }) {}

        let digest = hasher.finalize()
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    static func projectNameFromDir(_ dirName: String) -> String {
        let components = dirName.split(separator: "-").map(String.init)
        let skip = ["Users", "wivak", "puo", "jects", "active", "Library", "CloudStorage", "Dropbox", "home", ""]
        for component in components.reversed() {
            if !skip.contains(component) && !component.isEmpty {
                return component
            }
        }
        return components.last ?? "unknown"
    }

    /// Phase N: Read Codex threads and create sync_items with project resolution
    static func syncCodexThreads(dbPath: String, database: SyncDatabase) {
        var codexDb: OpaquePointer?
        guard sqlite3_open_v2(dbPath, &codexDb, SQLITE_OPEN_READONLY, nil) == SQLITE_OK,
              let codexDb else { return }
        defer { sqlite3_close(codexDb) }

        let sql = "SELECT id, title, cwd, git_branch, model, tokens_used, created_at, updated_at FROM threads ORDER BY updated_at DESC"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(codexDb, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else { return }
        defer { sqlite3_finalize(stmt) }

        var count = 0
        while sqlite3_step(stmt) == SQLITE_ROW {
            let threadId = String(cString: sqlite3_column_text(stmt, 0))
            let title = sqlite3_column_type(stmt, 1) != SQLITE_NULL
                ? String(cString: sqlite3_column_text(stmt, 1)) : nil
            let cwd = sqlite3_column_type(stmt, 2) != SQLITE_NULL
                ? String(cString: sqlite3_column_text(stmt, 2)) : nil
            let createdAt = sqlite3_column_type(stmt, 6) != SQLITE_NULL
                ? Date(timeIntervalSince1970: TimeInterval(sqlite3_column_int64(stmt, 6))) : Date()
            let updatedAt = sqlite3_column_type(stmt, 7) != SQLITE_NULL
                ? Date(timeIntervalSince1970: TimeInterval(sqlite3_column_int64(stmt, 7))) : Date()

            // Resolve project from cwd (deterministic)
            let projectName = cwd.flatMap { ProjectResolver.slugFromPath($0) } ?? "unknown"
            let projectId = ProjectResolver.shared.resolve(
                cwd: cwd, displayName: projectName, platform: "codex"
            )

            database.upsert(SyncItem(
                id: 0, origin: "local", sourceType: "codex",
                sessionId: "codex-\(threadId)",
                title: title, project: projectName,
                localPath: "openai/codex/state.sqlite", sourcePath: dbPath,
                localHash: "", fileSize: 0, messageCount: nil,
                cloudId: nil, syncState: .localOnly, sourceDeleted: false,
                cloudUpdatedAt: nil, localUpdatedAt: updatedAt, createdAt: createdAt,
                customTitle: nil, aiTitle: nil, tags: nil, prLink: nil,
                lastPrompt: nil, worktreeBranch: nil, sessionMode: nil,
                projectId: projectId
            ))
            count += 1
        }

        if count > 0 {
            Log.shared.info("Codex: synced \(count) threads to sync_items with project resolution", source: "SessionStore")
        }
    }

    /// Read the real cwd from the first line of any JSONL in a project directory.
    /// This is the ground truth — dir name decoding is ambiguous for paths with hyphens.
    static func readCwdFromFirstJsonl(dirPath: String, files: [String]) -> String? {
        for file in files {
            let path = "\(dirPath)/\(file)"
            guard let handle = FileHandle(forReadingAtPath: path) else { continue }
            defer { handle.closeFile() }

            let chunk = handle.readData(ofLength: 4096)
            guard let line = String(data: chunk, encoding: .utf8)?
                    .components(separatedBy: "\n").first,
                  !line.isEmpty,
                  let data = line.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let cwd = json["cwd"] as? String,
                  !cwd.isEmpty else { continue }
            return cwd
        }
        return nil
    }

    private func log(_ message: String) {
        Log.shared.info(message, source: "SessionStore")
    }

    // MARK: - Broader Claude Code Backup

    func backupClaudeStores() {
        queue.async { [self] in
            let home = fm.homeDirectoryForCurrentUser.path
            let claudeRoot = "\(home)/.claude"
            let backupRoot = Self.purmemoHome.appendingPathComponent("anthropic/claude-code")

            let filesToBackup: [(source: String, dest: String)] = [
                ("history.jsonl", "history/history.jsonl"),
            ]

            let dirsToBackup: [(source: String, dest: String)] = [
                ("plans", "plans"),
                ("todos", "todos"),
                ("tasks", "tasks"),
            ]

            for item in filesToBackup {
                let sourcePath = "\(claudeRoot)/\(item.source)"
                let destURL = backupRoot.appendingPathComponent(item.dest)
                guard fm.fileExists(atPath: sourcePath) else { continue }

                let sourceMod = (try? fm.attributesOfItem(atPath: sourcePath))?[.modificationDate] as? Date ?? .distantPast
                let destMod = (try? fm.attributesOfItem(atPath: destURL.path))?[.modificationDate] as? Date ?? .distantPast
                if destMod >= sourceMod { continue }

                do {
                    try fm.createDirectory(at: destURL.deletingLastPathComponent(), withIntermediateDirectories: true)
                    if fm.fileExists(atPath: destURL.path) { try fm.removeItem(at: destURL) }
                    try fm.copyItem(atPath: sourcePath, toPath: destURL.path)
                    let size = (try? fm.attributesOfItem(atPath: sourcePath))?[.size] as? UInt64 ?? 0
                    log("Backed up \(item.source) (\(ByteCountFormatter.string(fromByteCount: Int64(size), countStyle: .file)))")
                } catch {
                    log("Failed to backup \(item.source): \(error)")
                }
            }

            for item in dirsToBackup {
                let sourceDir = "\(claudeRoot)/\(item.source)"
                let destDir = backupRoot.appendingPathComponent(item.dest)
                guard fm.fileExists(atPath: sourceDir) else { continue }
                guard let files = try? fm.contentsOfDirectory(atPath: sourceDir) else { continue }

                try? fm.createDirectory(at: destDir, withIntermediateDirectories: true)

                var copied = 0
                for file in files {
                    let src = "\(sourceDir)/\(file)"
                    let dst = destDir.appendingPathComponent(file)
                    let srcSize = (try? fm.attributesOfItem(atPath: src))?[.size] as? UInt64 ?? 0
                    let dstSize = (try? fm.attributesOfItem(atPath: dst.path))?[.size] as? UInt64 ?? 0
                    if dstSize == srcSize && dstSize > 0 { continue }

                    do {
                        if fm.fileExists(atPath: dst.path) { try fm.removeItem(at: dst) }
                        try fm.copyItem(atPath: src, toPath: dst.path)
                        copied += 1
                    } catch { continue }
                }

                if copied > 0 { log("Backed up \(copied) files from \(item.source)/") }
            }
        }
    }

    // MARK: - Multi-Source Backup

    func backupAllSources() {
        queue.async { [self] in
            let home = fm.homeDirectoryForCurrentUser.path

            // --- Codex CLI --- (Phase N: backup + sync_items from threads table)
            let codexRoot = "\(home)/.codex"
            if fm.fileExists(atPath: codexRoot) {
                let codexDest = Self.purmemoHome.appendingPathComponent("openai/codex")
                try? fm.createDirectory(at: codexDest, withIntermediateDirectories: true)

                copyIfNewer(source: "\(codexRoot)/state_5.sqlite", dest: codexDest.appendingPathComponent("state.sqlite"))
                copyIfNewer(source: "\(codexRoot)/logs_1.sqlite", dest: codexDest.appendingPathComponent("logs.sqlite"))
                copyIfNewer(source: "\(codexRoot)/history.jsonl", dest: codexDest.appendingPathComponent("history.jsonl"))

                let codexSessions = "\(codexRoot)/sessions"
                if fm.fileExists(atPath: codexSessions) {
                    mirrorDirectory(source: codexSessions, dest: codexDest.appendingPathComponent("sessions"))
                }

                // Phase N: Read threads table for sync_items + project resolution
                let codexDbPath = "\(codexRoot)/state_5.sqlite"
                Self.syncCodexThreads(dbPath: codexDbPath, database: database)

                log("Codex backup complete")
            }

            // --- Cursor ---
            let cursorDb = "\(home)/Library/Application Support/Cursor/User/globalStorage/state.vscdb"
            if fm.fileExists(atPath: cursorDb) {
                let cursorDest = Self.purmemoHome.appendingPathComponent("cursor")
                try? fm.createDirectory(at: cursorDest, withIntermediateDirectories: true)

                copyIfNewer(source: cursorDb, dest: cursorDest.appendingPathComponent("state.vscdb"))
                let walPath = cursorDb + "-wal"
                if fm.fileExists(atPath: walPath) {
                    copyIfNewer(source: walPath, dest: cursorDest.appendingPathComponent("state.vscdb-wal"))
                }
                log("Cursor backup complete")
            }

            // --- Claude Desktop (agent mode sessions) ---
            let claudeDesktopSessions = "\(home)/Library/Application Support/Claude/local-agent-mode-sessions"
            if fm.fileExists(atPath: claudeDesktopSessions) {
                let destRoot = Self.purmemoHome.appendingPathComponent("anthropic/claude-desktop/sessions")
                try? fm.createDirectory(at: destRoot, withIntermediateDirectories: true)

                if let enumerator = fm.enumerator(atPath: claudeDesktopSessions) {
                    var copied = 0
                    while let file = enumerator.nextObject() as? String {
                        guard file.hasSuffix(".jsonl"),
                              !file.contains("/subagents/"),
                              !file.contains("agent-") else { continue }

                        let sourcePath = "\(claudeDesktopSessions)/\(file)"
                        let sessionId = URL(fileURLWithPath: file).deletingPathExtension().lastPathComponent
                        let destURL = destRoot.appendingPathComponent("\(sessionId).jsonl")

                        if copyIfNewer(source: sourcePath, dest: destURL) { copied += 1 }
                    }
                    if copied > 0 { log("Claude Desktop: backed up \(copied) agent sessions") }
                }
            }

            // --- Gemini CLI --- (Phase N: backup + sync_items + project resolution)
            let geminiTmp = "\(home)/.gemini/tmp"
            if fm.fileExists(atPath: geminiTmp) {
                let geminiDest = Self.purmemoHome.appendingPathComponent("google/gemini/sessions")
                try? fm.createDirectory(at: geminiDest, withIntermediateDirectories: true)

                var copied = 0
                if let projectDirs = try? fm.contentsOfDirectory(atPath: geminiTmp) {
                    for projectDir in projectDirs {
                        let chatsPath = "\(geminiTmp)/\(projectDir)/chats"
                        guard let chatFiles = try? fm.contentsOfDirectory(atPath: chatsPath) else { continue }

                        // Phase N: Resolve project — use hash for 64-char hex dirs, name otherwise
                        let isHash = projectDir.count == 64 && projectDir.allSatisfy({ $0.isHexDigit })
                        let displayName = isHash ? nil : projectDir
                        let projectId = ProjectResolver.shared.resolve(
                            projectHash: isHash ? projectDir : nil,
                            displayName: displayName,
                            platform: "gemini_cli"
                        )

                        let projectDest = geminiDest.appendingPathComponent(projectDir)
                        try? fm.createDirectory(at: projectDest, withIntermediateDirectories: true)

                        for file in chatFiles {
                            guard file.hasPrefix("session-") && file.hasSuffix(".json") else { continue }
                            let sourcePath = "\(chatsPath)/\(file)"
                            let destURL = projectDest.appendingPathComponent(file)
                            let didCopy = copyIfNewer(source: sourcePath, dest: destURL)
                            if didCopy { copied += 1 }

                            // Phase N: Upsert sync_item for Gemini session
                            let sessionId = file.replacingOccurrences(of: ".json", with: "")
                            let relativePath = "google/gemini/sessions/\(projectDir)/\(file)"
                            let attrs = try? fm.attributesOfItem(atPath: sourcePath)
                            let fileSize = attrs?[.size] as? UInt64 ?? 0
                            let mdate = attrs?[.modificationDate] as? Date ?? Date()

                            database.upsert(SyncItem(
                                id: 0, origin: "local", sourceType: "gemini_cli",
                                sessionId: sessionId,
                                title: nil, project: displayName ?? "unknown project",
                                localPath: relativePath, sourcePath: sourcePath,
                                localHash: "", fileSize: fileSize, messageCount: nil,
                                cloudId: nil, syncState: .localOnly, sourceDeleted: false,
                                cloudUpdatedAt: nil, localUpdatedAt: mdate, createdAt: mdate,
                                customTitle: nil, aiTitle: nil, tags: nil, prLink: nil,
                                lastPrompt: nil, worktreeBranch: nil, sessionMode: nil,
                                projectId: projectId
                            ))
                        }
                    }
                }
                if copied > 0 { log("Gemini CLI: backed up \(copied) sessions") }
            }

            // --- Claude Code Subagent Transcripts (Phase H) ---
            backupSubagentTranscripts()
        }
    }

    /// Phase H: Backup subagent transcripts from ~/.claude/projects/{sessionId}/subagents/
    private func backupSubagentTranscripts() {
        guard let projectDirs = try? fm.contentsOfDirectory(atPath: claudeProjectsPath) else { return }

        let destRoot = Self.purmemoHome.appendingPathComponent("anthropic/claude-code/subagents")
        try? fm.createDirectory(at: destRoot, withIntermediateDirectories: true)

        var totalCopied = 0
        var totalMeta = 0

        for dir in projectDirs {
            let dirPath = "\(claudeProjectsPath)/\(dir)"

            // Look for session directories (UUID-named) that contain subagents/
            guard let contents = try? fm.contentsOfDirectory(atPath: dirPath) else { continue }
            for item in contents {
                let sessionDir = "\(dirPath)/\(item)"
                let subagentsDir = "\(sessionDir)/subagents"
                guard fm.fileExists(atPath: subagentsDir) else { continue }

                let parentSessionId = item // This is the parent session UUID
                let sessionDest = destRoot.appendingPathComponent("\(parentSessionId)/subagents")
                try? fm.createDirectory(at: sessionDest, withIntermediateDirectories: true)

                guard let subFiles = try? fm.contentsOfDirectory(atPath: subagentsDir) else { continue }
                for subFile in subFiles {
                    let sourcePath = "\(subagentsDir)/\(subFile)"
                    let destURL = sessionDest.appendingPathComponent(subFile)

                    if subFile.hasSuffix(".jsonl") {
                        if copyIfNewer(source: sourcePath, dest: destURL) {
                            totalCopied += 1

                            // Track in database as a linked subagent
                            let agentId = subFile.replacingOccurrences(of: ".jsonl", with: "")
                            let relativePath = "anthropic/claude-code/subagents/\(parentSessionId)/subagents/\(subFile)"

                            // Read meta.json if it exists
                            let metaPath = sourcePath.replacingOccurrences(of: ".jsonl", with: ".meta.json")
                            var agentType: String?
                            var description: String?
                            if let metaData = fm.contents(atPath: metaPath),
                               let meta = try? JSONSerialization.jsonObject(with: metaData) as? [String: Any] {
                                agentType = meta["agentType"] as? String
                                description = meta["description"] as? String
                            }

                            let title = description ?? agentType ?? agentId
                            let attrs = try? fm.attributesOfItem(atPath: sourcePath)
                            let fileSize = (attrs?[.size] as? UInt64) ?? 0
                            let mtime = (attrs?[.modificationDate] as? Date) ?? Date()

                            database.upsert(SyncItem(
                                id: 0,
                                origin: "local",
                                sourceType: "claude_code_subagent",
                                sessionId: "subagent-\(agentId)",
                                title: title,
                                project: Self.projectNameFromDir(dir),
                                localPath: relativePath,
                                sourcePath: sourcePath,
                                localHash: "",
                                fileSize: fileSize,
                                messageCount: nil,
                                cloudId: nil,
                                syncState: .localOnly,
                                sourceDeleted: false,
                                cloudUpdatedAt: nil,
                                localUpdatedAt: mtime,
                                createdAt: mtime,
                                customTitle: nil,
                                aiTitle: nil,
                                tags: agentType,  // Store agent type as a tag
                                prLink: nil,
                                lastPrompt: nil,
                                worktreeBranch: nil,
                                sessionMode: parentSessionId,  // Store parent link in sessionMode field
                                projectId: nil
                            ))
                        }
                    } else if subFile.hasSuffix(".meta.json") {
                        if copyIfNewer(source: sourcePath, dest: destURL) {
                            totalMeta += 1
                        }
                    }
                }
            }
        }

        if totalCopied > 0 {
            log("Subagents: backed up \(totalCopied) transcripts + \(totalMeta) meta files")
        }

        // Phase J: Backup tool result files in the same pass
        backupToolResults(projectDirs: projectDirs)
    }

    /// Phase J: Backup tool result files from ~/.claude/projects/{sessionId}/tool-results/
    private func backupToolResults(projectDirs: [String]) {
        let destRoot = Self.purmemoHome.appendingPathComponent("anthropic/claude-code/tool-results")
        try? fm.createDirectory(at: destRoot, withIntermediateDirectories: true)

        var totalCopied = 0
        let maxFileSize: UInt64 = 10_485_760 // 10MB cap per file

        for dir in projectDirs {
            let dirPath = "\(claudeProjectsPath)/\(dir)"
            guard let contents = try? fm.contentsOfDirectory(atPath: dirPath) else { continue }

            for item in contents {
                let sessionDir = "\(dirPath)/\(item)"
                let toolResultsDir = "\(sessionDir)/tool-results"
                guard fm.fileExists(atPath: toolResultsDir) else { continue }

                let parentSessionId = item
                let sessionDest = destRoot.appendingPathComponent(parentSessionId)
                try? fm.createDirectory(at: sessionDest, withIntermediateDirectories: true)

                guard let resultFiles = try? fm.contentsOfDirectory(atPath: toolResultsDir) else { continue }
                for resultFile in resultFiles {
                    let sourcePath = "\(toolResultsDir)/\(resultFile)"

                    // Skip files over 10MB
                    let attrs = try? fm.attributesOfItem(atPath: sourcePath)
                    let fileSize = (attrs?[.size] as? UInt64) ?? 0
                    if fileSize > maxFileSize { continue }

                    let destURL = sessionDest.appendingPathComponent(resultFile)
                    if copyIfNewer(source: sourcePath, dest: destURL) {
                        totalCopied += 1
                    }
                }
            }
        }

        if totalCopied > 0 {
            log("Tool results: backed up \(totalCopied) files")
        }
    }

    @discardableResult
    private func copyIfNewer(source: String, dest: URL) -> Bool {
        guard fm.fileExists(atPath: source) else { return false }
        let sourceMod = (try? fm.attributesOfItem(atPath: source))?[.modificationDate] as? Date ?? .distantPast
        let destMod = (try? fm.attributesOfItem(atPath: dest.path))?[.modificationDate] as? Date ?? .distantPast
        guard sourceMod > destMod else { return false }

        do {
            try fm.createDirectory(at: dest.deletingLastPathComponent(), withIntermediateDirectories: true)
            if fm.fileExists(atPath: dest.path) { try fm.removeItem(at: dest) }
            try fm.copyItem(atPath: source, toPath: dest.path)
            return true
        } catch {
            log("Copy failed \(source) → \(dest.lastPathComponent): \(error)")
            return false
        }
    }

    private func mirrorDirectory(source: String, dest: URL) {
        guard let enumerator = fm.enumerator(atPath: source) else { return }
        try? fm.createDirectory(at: dest, withIntermediateDirectories: true)

        while let file = enumerator.nextObject() as? String {
            let srcPath = "\(source)/\(file)"
            let dstURL = dest.appendingPathComponent(file)
            var isDir: ObjCBool = false
            fm.fileExists(atPath: srcPath, isDirectory: &isDir)
            if isDir.boolValue {
                try? fm.createDirectory(at: dstURL, withIntermediateDirectories: true)
            } else {
                copyIfNewer(source: srcPath, dest: dstURL)
            }
        }
    }

    // MARK: - Stats

    var totalStoredSize: String {
        ByteCountFormatter.string(fromByteCount: Int64(database.totalSize()), countStyle: .file)
    }

    var deletedSourceCount: Int {
        database.deletedSourceCount()
    }

    var pendingCloudSync: Int {
        database.pendingCloudSyncCount()
    }


    // MARK: - Cloud Sync Helpers (called by CloudSync)

    func readSessionContent(sessionId: String) -> String? {
        guard let item = database.fetch(sessionId: sessionId) else { return nil }
        let localURL = item.origin == "cloud"
            ? Self.purmemoHome.appendingPathComponent(item.localPath)
            : storeRoot.appendingPathComponent(item.localPath)
        return try? String(contentsOf: localURL, encoding: .utf8)
    }

    /// Get sync item for a session (replaces manifestEntry)
    func syncItem(for sessionId: String) -> SyncItem? {
        database.fetch(sessionId: sessionId)
    }

    func isCloudSynced(sessionId: String) -> Bool {
        database.isCloudSynced(sessionId: sessionId)
    }

    func markCloudSynced(sessionId: String, cloudId: String? = nil) {
        queue.async { [self] in
            database.markCloudSynced(sessionId: sessionId, cloudId: cloudId)
        }
    }
}
