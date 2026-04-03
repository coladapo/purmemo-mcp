import Foundation
import CommonCrypto

// MARK: - Project Resolver
//
// Three-tier resolution engine for linking sessions to projects:
//   Tier 1: Deterministic — exact path match or SHA256 hash reverse-lookup
//   Tier 2: Fuzzy — case-insensitive name match against known aliases
//   Tier 3: Manual — creates new project, user can merge later
//
// Every platform feeds raw identifiers into resolve(), which returns a project_id.
// Projects are created lazily on first encounter and accumulate aliases over time.

class ProjectResolver {

    static let shared = ProjectResolver()

    private var database: SyncDatabase { SessionStore.shared.database }

    // MARK: - Public API

    /// Resolve a session to a project_id using the three-tier waterfall.
    /// Returns the project_id (creating the project if necessary).
    ///
    /// - Parameters:
    ///   - cwd: Full filesystem path (Claude Code, Codex, History). Primary deterministic key.
    ///   - projectHash: SHA256 hash of project path (Gemini CLI). Reverse-looked-up via alias.
    ///   - displayName: Human-readable name (from scanner's projectNameFromDir or similar).
    ///   - platform: Source platform for audit trail.
    ///   - sessionId: The session being resolved (for linking sync_items.project_id).
    @discardableResult
    func resolve(cwd: String? = nil,
                 projectHash: String? = nil,
                 displayName: String? = nil,
                 platform: String,
                 sessionId: String? = nil) -> String {

        let now = Date()

        // --- Tier 1a: Exact path match ---
        if let cwd = cwd, !cwd.isEmpty {
            let normalizedPath = Self.normalizePath(cwd)

            if let projectId = database.resolveAlias(type: "path", value: normalizedPath) {
                if let sid = sessionId { database.updateSyncItemProjectId(sessionId: sid, projectId: projectId) }
                return projectId
            }

            // Path not seen before — create project from it
            let slug = Self.slugFromPath(normalizedPath)
            let projectId = createProject(
                id: slug,
                canonicalPath: normalizedPath,
                displayName: displayName ?? slug,
                now: now
            )

            // Register aliases: path, path_hash (for Gemini reverse-lookup), name
            registerAlias(type: "path", value: normalizedPath, projectId: projectId,
                          createdBy: "scanner", reasoning: "Deterministic cwd from \(platform)", now: now)

            let hash = Self.sha256(normalizedPath)
            registerAlias(type: "path_hash", value: hash, projectId: projectId,
                          createdBy: "scanner", reasoning: "SHA256 of cwd for Gemini reverse-lookup", now: now)

            let name = displayName ?? slug
            registerAlias(type: "name", value: name.lowercased(), projectId: projectId,
                          createdBy: "scanner", reasoning: "Display name from path", now: now)

            if let sid = sessionId { database.updateSyncItemProjectId(sessionId: sid, projectId: projectId) }
            return projectId
        }

        // --- Tier 1b: Hash reverse-lookup (Gemini CLI) ---
        if let hash = projectHash, !hash.isEmpty, hash != "unknown project" {
            if let projectId = database.resolveAlias(type: "path_hash", value: hash) {
                if let sid = sessionId { database.updateSyncItemProjectId(sessionId: sid, projectId: projectId) }
                return projectId
            }

            // Hash not mapped to any known path — create as hash-only project
            // This will get merged when a cwd-based scanner creates the real project
            let slug = "gemini-\(String(hash.prefix(12)))"
            let name = displayName ?? "unknown project"
            let projectId = createProject(
                id: slug,
                canonicalPath: nil,  // unknown — will be filled when cwd match appears
                displayName: name,
                now: now
            )
            registerAlias(type: "path_hash", value: hash, projectId: projectId,
                          createdBy: "scanner", reasoning: "Gemini projectHash, cwd unknown", now: now)

            if name != "unknown project" {
                registerAlias(type: "name", value: name.lowercased(), projectId: projectId,
                              createdBy: "scanner", reasoning: "Gemini directory name", now: now)
            }

            if let sid = sessionId { database.updateSyncItemProjectId(sessionId: sid, projectId: projectId) }
            return projectId
        }

        // --- Tier 2: Fuzzy name match (includes diacritics-stripped lookup) ---
        if let name = displayName, !name.isEmpty, name != "unknown", name != "Unknown",
           name != "unknown project" {
            // Try exact name match
            if let match = database.resolveAliasFuzzy(name: name) {
                if let sid = sessionId { database.updateSyncItemProjectId(sessionId: sid, projectId: match.projectId) }
                return match.projectId
            }
            // Try diacritics-stripped match (pūrmemo → purmemo)
            let stripped = Self.stripDiacritics(name)
            if stripped != name.lowercased(), let match = database.resolveAliasFuzzy(name: stripped) {
                // Auto-register the unicode variant as an alias
                registerAlias(type: "name", value: name.lowercased(), projectId: match.projectId,
                              createdBy: "auto_link", reasoning: "Unicode variant of \(stripped)", now: now)
                if let sid = sessionId { database.updateSyncItemProjectId(sessionId: sid, projectId: match.projectId) }
                return match.projectId
            }

            // Name not matched — create new project
            let slug = Self.slugify(name)
            let projectId = createProject(
                id: slug,
                canonicalPath: nil,
                displayName: name,
                now: now
            )
            registerAlias(type: "name", value: name.lowercased(), projectId: projectId,
                          createdBy: "scanner", reasoning: "Display name from \(platform)", now: now)
            // Also register diacritics-stripped variant
            if stripped != name.lowercased() {
                registerAlias(type: "name", value: stripped, projectId: projectId,
                              createdBy: "scanner", reasoning: "Diacritics-stripped variant of \(name)", now: now)
            }

            if let sid = sessionId { database.updateSyncItemProjectId(sessionId: sid, projectId: projectId) }
            return projectId
        }

        // --- Tier 3: Unlinked ---
        let unlinkedId = "unlinked"
        if database.fetchProject(id: unlinkedId) == nil {
            let _ = createProject(
                id: unlinkedId,
                canonicalPath: nil,
                displayName: "Unlinked Sessions",
                now: now
            )
        }
        if let sid = sessionId { database.updateSyncItemProjectId(sessionId: sid, projectId: unlinkedId) }
        return unlinkedId
    }

    /// Resolve a cloud-downloaded memory to a project via its Gemini-extracted projectName.
    /// Uses alias_type='cloud_name' for fuzzy matching.
    func resolveFromCloud(projectName: String?, platform: String?, memoryId: String) -> String? {
        guard let name = projectName, !name.isEmpty else { return nil }

        // Try exact cloud_name alias first
        if let projectId = database.resolveAlias(type: "cloud_name", value: name.lowercased()) {
            database.updateSyncItemProjectId(sessionId: memoryId, projectId: projectId)
            return projectId
        }

        // Try fuzzy name match
        if let match = database.resolveAliasFuzzy(name: name) {
            // Auto-register as cloud_name alias for future lookups
            registerAlias(type: "cloud_name", value: name.lowercased(), projectId: match.projectId,
                          createdBy: "cloud_extraction", reasoning: "Gemini-extracted projectName from cloud memory",
                          now: Date())
            database.updateSyncItemProjectId(sessionId: memoryId, projectId: match.projectId)
            return match.projectId
        }

        return nil
    }

    // MARK: - Backfill

    /// Backfill project_id for all existing sync_items that don't have one.
    /// Called once after Phase N migration.
    func backfillExistingSyncItems() {
        let migrationKey = "phase_n_backfill_done"
        guard database.getMeta(key: migrationKey) == nil else { return }

        let items = database.fetchItemsWithoutProject()
        var resolved = 0

        for item in items {
            let cwd: String?
            let hash: String?

            switch item.sourceType {
            case "claude_code", "claude_code_subagent":
                // Read cwd from the JSONL file directly (ground truth)
                cwd = Self.cwdFromClaudeCodeSourcePath(item.sourcePath)
                hash = nil
            case "codex":
                cwd = Self.cwdFromProjectName(item.project) // Best effort
                hash = nil
            case "gemini_cli":
                cwd = nil
                hash = Self.hashFromGeminiProject(item.project, sourcePath: item.sourcePath)
            default:
                cwd = nil
                hash = nil
            }

            let projectId = resolve(
                cwd: cwd,
                projectHash: hash,
                displayName: item.project.isEmpty ? nil : item.project,
                platform: item.sourceType,
                sessionId: item.sessionId
            )

            if projectId != "unlinked" { resolved += 1 }
        }

        // Refresh stats for all projects
        for project in database.fetchAllProjects() {
            database.refreshProjectStats(projectId: project.id)
        }

        database.setMeta(key: migrationKey, value: "done")
        Log.shared.info("Phase N backfill: \(resolved) sessions resolved to projects (\(database.fetchAllProjects().count) projects created)", source: "ProjectResolver")
    }

    // MARK: - Helpers

    private func createProject(id: String, canonicalPath: String?, displayName: String, now: Date) -> String {
        // Ensure unique ID — if already exists, this is a no-op via upsert
        let existing = database.fetchProject(id: id)
        if let existing = existing {
            return existing.id
        }

        database.upsertProject(Project(
            id: id,
            canonicalPath: canonicalPath,
            displayName: displayName,
            cloudClusterId: nil,
            sessionCount: 0,
            platformCount: 0,
            lastActivityAt: now,
            createdAt: now,
            updatedAt: now
        ))
        return id
    }

    private func registerAlias(type: String, value: String, projectId: String,
                                confidence: Double = 1.0, createdBy: String,
                                reasoning: String, now: Date) {
        database.insertAlias(ProjectAlias(
            aliasType: type,
            aliasValue: value,
            projectId: projectId,
            confidence: confidence,
            createdBy: createdBy,
            reasoning: reasoning,
            createdAt: now
        ))
    }

    // MARK: - Path Utilities

    /// Normalize path: remove trailing slash, resolve ~ to home
    static func normalizePath(_ path: String) -> String {
        var p = path
        if p.hasSuffix("/") && p.count > 1 { p = String(p.dropLast()) }
        if p.hasPrefix("~") {
            let home = FileManager.default.homeDirectoryForCurrentUser.path
            p = home + String(p.dropFirst())
        }
        return p
    }

    /// Extract project slug from filesystem path.
    /// "/Users/wivak/puo-jects/____active/purmemo" → "purmemo"
    static func slugFromPath(_ path: String) -> String {
        let components = path.split(separator: "/").map(String.init)
        let skip: Set<String> = ["Users", "wivak", "puo-jects", "____active", "active",
                                  "Library", "CloudStorage", "Dropbox", "home", ""]
        for component in components.reversed() {
            if !skip.contains(component) && !component.isEmpty {
                return slugify(component)
            }
        }
        return slugify(components.last ?? "unknown")
    }

    /// Create a URL-safe slug: lowercase, alphanumeric + hyphens
    static func slugify(_ name: String) -> String {
        let cleaned = name
            .lowercased()
            .replacingOccurrences(of: " ", with: "-")
            .replacingOccurrences(of: "_", with: "-")
            .filter { $0.isLetter || $0.isNumber || $0 == "-" || $0 == "." }
        return cleaned.isEmpty ? "unknown" : String(cleaned.prefix(64))
    }

    /// Strip diacritics/accents from a string: pūrmemo → purmemo
    static func stripDiacritics(_ string: String) -> String {
        string.lowercased()
            .folding(options: .diacriticInsensitive, locale: .current)
    }

    /// SHA256 hash of a string, returned as lowercase hex
    static func sha256(_ string: String) -> String {
        guard let data = string.data(using: .utf8) else { return "" }
        var hash = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
        data.withUnsafeBytes { buffer in
            _ = CC_SHA256(buffer.baseAddress, CC_LONG(buffer.count), &hash)
        }
        return hash.map { String(format: "%02x", $0) }.joined()
    }

    // MARK: - Backfill Helpers

    /// Read the real cwd from a Claude Code JSONL source path.
    /// Reads the first line of the file and extracts the `cwd` field — ground truth.
    private static func cwdFromClaudeCodeSourcePath(_ sourcePath: String) -> String? {
        // Try reading cwd from the JSONL file directly
        guard FileManager.default.fileExists(atPath: sourcePath),
              let handle = FileHandle(forReadingAtPath: sourcePath) else { return nil }
        defer { handle.closeFile() }

        let chunk = handle.readData(ofLength: 4096)
        guard let line = String(data: chunk, encoding: .utf8)?
                .components(separatedBy: "\n").first,
              !line.isEmpty,
              let data = line.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let cwd = json["cwd"] as? String,
              !cwd.isEmpty else {
            // Fallback: try reading from the local copy
            return cwdFromLocalCopy(sourcePath: sourcePath)
        }
        return cwd
    }

    /// Fallback: try reading cwd from the local backup copy in ~/purmemo sync/
    private static func cwdFromLocalCopy(sourcePath: String) -> String? {
        // sourcePath might be the original ~/.claude/projects/... path
        // Check if we have a local copy
        guard sourcePath.contains("/.claude/projects/") else { return nil }
        let parts = sourcePath.split(separator: "/")
        guard let projectsIdx = parts.firstIndex(where: { $0 == "projects" }),
              projectsIdx + 1 < parts.count else { return nil }
        let dirName = String(parts[projectsIdx + 1])

        // Scan the project dir for any JSONL to read cwd from
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let dirPath = "\(home)/.claude/projects/\(dirName)"
        guard let files = try? FileManager.default.contentsOfDirectory(atPath: dirPath) else { return nil }
        let jsonlFiles = files.filter { $0.hasSuffix(".jsonl") }
        return SessionStore.readCwdFromFirstJsonl(dirPath: dirPath, files: jsonlFiles)
    }

    /// Best-effort cwd reconstruction from a project name (for Codex backfill)
    private static func cwdFromProjectName(_ projectName: String) -> String? {
        // Codex stores cwd directly in threads.cwd — but during backfill we only have
        // the derived project name. We can't reliably reconstruct the full path.
        return nil
    }

    /// Extract the raw projectHash from a Gemini session's source path or project name.
    private static func hashFromGeminiProject(_ projectName: String, sourcePath: String) -> String? {
        // Try to extract from source path: ~/.gemini/tmp/{hash}/chats/session-*.json
        let parts = sourcePath.split(separator: "/")
        if let tmpIdx = parts.firstIndex(where: { $0 == "tmp" }),
           tmpIdx + 1 < parts.count {
            let candidate = String(parts[tmpIdx + 1])
            // Check if it's a 64-char hex hash
            if candidate.count == 64, candidate.allSatisfy({ $0.isHexDigit }) {
                return candidate
            }
        }
        return nil
    }
}
