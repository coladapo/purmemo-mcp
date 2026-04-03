import Foundation

/// One-time migration from manifest.json to SQLite database.
/// Reads the old JSON manifest, inserts all entries into SyncDatabase,
/// then renames the old file to .migrated as a safety net.
enum ManifestMigrator {

    // MARK: - Legacy Types (for decoding only)

    private struct LegacyManifest: Codable {
        var version: Int
        var entries: [String: LegacyEntry]
        var lastFullScan: Date?
    }

    private struct LegacyEntry: Codable {
        let sessionId: String
        let project: String
        let sourceHash: String
        let sourceSize: UInt64
        let sourcePath: String
        let localPath: String
        let firstCopied: Date
        var lastUpdated: Date
        var sourceDeleted: Bool
        var cloudSynced: Bool
        var cloudSyncedAt: Date?
        var messageCount: Int?
        var firstPrompt: String?
    }

    // MARK: - Migration

    /// Migrate if manifest.json exists and database is empty.
    /// Idempotent — safe to call on every launch.
    static func migrateIfNeeded(manifestURL: URL, database: SyncDatabase) {
        let fm = FileManager.default

        // Only migrate if the old manifest exists
        guard fm.fileExists(atPath: manifestURL.path) else { return }

        // Only migrate if database is empty (prevents double migration)
        guard database.count() == 0 else {
            Log.shared.info("Database already has entries, skipping manifest migration", source: "Migrator")
            return
        }

        Log.shared.info("Starting manifest.json → SQLite migration", source: "Migrator")

        // Read legacy manifest
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        guard let data = try? Data(contentsOf: manifestURL),
              let legacy = try? decoder.decode(LegacyManifest.self, from: data) else {
            Log.shared.error("Failed to read manifest.json for migration", source: "Migrator")
            return
        }

        var migrated = 0
        for (_, entry) in legacy.entries {
            let item = SyncItem(
                id: 0, // auto-increment
                origin: "local",
                sourceType: "claude_code",
                sessionId: entry.sessionId,
                title: entry.firstPrompt,
                project: entry.project,
                localPath: entry.localPath,
                sourcePath: entry.sourcePath,
                localHash: entry.sourceHash,
                fileSize: entry.sourceSize,
                messageCount: entry.messageCount,
                cloudId: nil,
                syncState: entry.cloudSynced ? .synced : .localOnly,
                sourceDeleted: entry.sourceDeleted,
                cloudUpdatedAt: entry.cloudSyncedAt,
                localUpdatedAt: entry.lastUpdated,
                createdAt: entry.firstCopied,
                customTitle: nil, aiTitle: nil, tags: nil, prLink: nil,
                lastPrompt: nil, worktreeBranch: nil, sessionMode: nil,
                projectId: nil
            )
            database.upsert(item)
            migrated += 1
        }

        // Preserve last full scan timestamp
        if let lastScan = legacy.lastFullScan {
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            database.setMeta(key: "last_full_scan", value: formatter.string(from: lastScan))
        }

        // Rename old manifest (don't delete — safety net)
        let migratedURL = manifestURL.deletingPathExtension().appendingPathExtension("json.migrated")
        try? fm.moveItem(at: manifestURL, to: migratedURL)

        Log.shared.info("Migration complete: \(migrated) entries moved to SQLite", source: "Migrator")
    }
}
