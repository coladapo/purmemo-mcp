import Foundation
import CommonCrypto
import PurmemoShared

// MARK: - Sync Preferences

enum ProjectSyncPolicy: String, Codable {
    case manual    // Default — user must explicitly sync each session
    case autoSync  // Auto-sync new sessions as they appear
    case never     // Never sync this project to cloud
}

struct SyncPreferences: Codable {
    var version: Int = 1
    /// Per-project sync policy. Key = project name.
    var projectPolicies: [String: ProjectSyncPolicy] = [:]
    /// Sessions the user has explicitly opted in to sync
    var syncedSessionIds: Set<String> = []
    /// Sessions the user has explicitly opted OUT of syncing
    var excludedSessionIds: Set<String> = []

    func policy(for project: String) -> ProjectSyncPolicy {
        projectPolicies[project] ?? .manual
    }

    func shouldAutoSync(sessionId: String, project: String) -> Bool {
        if excludedSessionIds.contains(sessionId) { return false }
        if syncedSessionIds.contains(sessionId) { return true }
        return policy(for: project) == .autoSync
    }
}

// MARK: - Cloud Sync Engine

@Observable
class CloudSync {

    static let shared = CloudSync()

    var isSyncing = false
    var syncQueue: [String] = []       // sessionIds waiting to sync
    var lastError: String?
    var syncedThisSession = 0

    private let prefsURL: URL
    private(set) var preferences: SyncPreferences
    private let store = SessionStore.shared
    private let queue = DispatchQueue(label: "ai.purmemo.cloud-sync", qos: .utility)

    private init() {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        prefsURL = appSupport.appendingPathComponent("ai.purmemo/sync-preferences.json")

        let decoder = JSONDecoder()
        if let data = try? Data(contentsOf: prefsURL),
           let loaded = try? decoder.decode(SyncPreferences.self, from: data) {
            preferences = loaded
        } else {
            preferences = SyncPreferences()
        }
    }

    // MARK: - User Actions

    /// User opts in a single session for cloud sync
    func enableSync(sessionId: String) {
        preferences.syncedSessionIds.insert(sessionId)
        preferences.excludedSessionIds.remove(sessionId)
        savePreferences()
        syncSession(sessionId)
    }

    /// User opts out a single session from cloud sync
    func disableSync(sessionId: String) {
        preferences.excludedSessionIds.insert(sessionId)
        preferences.syncedSessionIds.remove(sessionId)
        savePreferences()
        // Note: we don't delete from cloud — user can do that from the web dashboard
    }

    /// User opts in all sessions in a project
    func enableProjectSync(project: String, sessionIds: [String]) {
        preferences.projectPolicies[project] = .autoSync
        for id in sessionIds {
            preferences.syncedSessionIds.insert(id)
            preferences.excludedSessionIds.remove(id)
        }
        savePreferences()
        for id in sessionIds {
            syncSession(id)
        }
    }

    /// User sets project to manual (default)
    func setProjectManual(project: String) {
        preferences.projectPolicies[project] = .manual
        savePreferences()
    }

    /// User sets project to never sync
    func setProjectNever(project: String, sessionIds: [String]) {
        preferences.projectPolicies[project] = .never
        for id in sessionIds {
            preferences.excludedSessionIds.insert(id)
            preferences.syncedSessionIds.remove(id)
        }
        savePreferences()
    }

    /// Check if a session is opted in for cloud sync
    func isSyncEnabled(sessionId: String) -> Bool {
        preferences.syncedSessionIds.contains(sessionId)
    }

    /// Check if a session has been synced to cloud
    func isCloudSynced(sessionId: String) -> Bool {
        store.isCloudSynced(sessionId: sessionId)
    }

    // MARK: - Sync Execution

    /// Sync a single session to the cloud
    func syncSession(_ sessionId: String) {
        queue.async { [self] in
            DispatchQueue.main.async {
                self.syncQueue.append(sessionId)
                self.isSyncing = true
                self.lastError = nil
            }

            let result = performSync(sessionId: sessionId)

            DispatchQueue.main.async {
                self.syncQueue.removeAll { $0 == sessionId }
                if self.syncQueue.isEmpty { self.isSyncing = false }

                switch result {
                case .success:
                    self.syncedThisSession += 1
                case .failure(let error):
                    self.lastError = error.localizedDescription
                    print("[CloudSync] Failed to sync \(sessionId): \(error)")
                }
            }
        }
    }

    /// Sync all opted-in sessions that haven't been synced yet
    func syncAllPending() {
        let pending = preferences.syncedSessionIds.filter { !isCloudSynced(sessionId: $0) }
        for sessionId in pending {
            syncSession(sessionId)
        }
    }

    // MARK: - Private

    private func performSync(sessionId: String) -> Result<Void, Error> {
        // Read the JSONL from our local store
        guard let content = store.readSessionContent(sessionId: sessionId) else {
            return .failure(SyncError.fileNotFound)
        }

        // Extract conversation text from JSONL
        let conversation = extractConversation(from: content)
        guard !conversation.isEmpty else {
            return .failure(SyncError.emptyConversation)
        }

        // Get the sync item for metadata
        let item = store.syncItem(for: sessionId)
        let title = item?.title ?? "Claude Code Session"
        let project = item?.project ?? "unknown"
        let sourceType = item?.sourceType ?? "claude_code"

        // Phase N: Resolve platform for proper routing + get project canonical path
        let platform: String
        switch sourceType {
        case "claude_code": platform = "claude-code"
        case "gemini_cli": platform = "gemini"
        case "codex": platform = "cursor"  // Codex → cursor platform in cloud
        case "cursor": platform = "cursor"
        case "claude_desktop": platform = "claude"
        default: platform = "claude-code"
        }

        // Build deterministic UUID from session for living-document upsert (API requires UUID format)
        let conversationId = Self.deterministicUUID(from: "\(sourceType)-\(sessionId)")

        // Get canonical path from project resolver if available
        var projectCanonicalPath: String?
        if let projectId = item?.projectId {
            projectCanonicalPath = store.database.fetchProject(id: projectId)?.canonicalPath
        }

        // POST to purmemo API
        guard let token = KeychainService.load(.accessToken) else {
            return .failure(SyncError.notAuthenticated)
        }

        let url = URL(string: "https://api.purmemo.ai/api/v1/memories/")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 30

        // Phase N: Enriched upload payload with platform, conversation_id, and project context
        var metadata: [String: Any] = [
            "session_id": sessionId,
            "project": project,
            "synced_from": "purmemo-sync"
        ]
        if let canonicalPath = projectCanonicalPath {
            metadata["project_canonical_path"] = canonicalPath
        }
        if let projectId = item?.projectId {
            metadata["local_project_id"] = projectId
        }

        let body: [String: Any] = [
            "title": String(title.prefix(120)),
            "content": conversation,
            "source_type": "desktop_macos_sync",
            "platform": platform,
            "conversation_id": conversationId,
            "metadata": metadata
        ]

        guard let bodyData = try? JSONSerialization.data(withJSONObject: body) else {
            return .failure(SyncError.encodingFailed)
        }
        request.httpBody = bodyData

        // Synchronous request on background queue
        let semaphore = DispatchSemaphore(value: 0)
        var result: Result<Void, Error> = .failure(SyncError.unknown)

        URLSession.shared.dataTask(with: request) { [self] data, response, error in
            defer { semaphore.signal() }

            if let error {
                result = .failure(error)
                return
            }

            guard let http = response as? HTTPURLResponse else {
                result = .failure(SyncError.unknown)
                return
            }

            if (200...299).contains(http.statusCode) {
                // Mark as synced in manifest
                store.markCloudSynced(sessionId: sessionId)
                result = .success(())
            } else if http.statusCode == 401 {
                result = .failure(SyncError.notAuthenticated)
            } else {
                let body = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
                result = .failure(SyncError.serverError(http.statusCode, body))
            }
        }.resume()

        semaphore.wait()
        return result
    }

    /// Extract human-readable conversation from JSONL content
    private func extractConversation(from jsonlContent: String) -> String {
        var parts: [String] = []
        let lines = jsonlContent.components(separatedBy: "\n")

        for line in lines {
            guard !line.isEmpty,
                  let data = line.data(using: .utf8),
                  let entry = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let type = entry["type"] as? String else { continue }

            if type == "user" || type == "human" {
                if let message = entry["message"] as? [String: Any],
                   let content = message["content"] {
                    let text = extractText(from: content)
                    if !text.isEmpty {
                        parts.append("Human: \(text)")
                    }
                }
            } else if type == "assistant" {
                if let message = entry["message"] as? [String: Any],
                   let content = message["content"] {
                    let text = extractText(from: content)
                    if !text.isEmpty {
                        parts.append("Assistant: \(text)")
                    }
                }
            }
        }

        return parts.joined(separator: "\n\n")
    }

    private func extractText(from content: Any) -> String {
        if let str = content as? String { return str }
        if let blocks = content as? [[String: Any]] {
            return blocks.compactMap { block -> String? in
                if block["type"] as? String == "text" {
                    return block["text"] as? String
                }
                if block["type"] as? String == "tool_use" {
                    let name = block["name"] as? String ?? "tool"
                    return "[Tool: \(name)]"
                }
                return nil
            }.joined(separator: "\n")
        }
        return ""
    }

    // MARK: - UUID Generation

    /// Generate a deterministic UUID v5 (SHA-1 based) from a string.
    /// Same input always produces the same UUID — enables living-document upsert.
    private static func deterministicUUID(from input: String) -> String {
        // UUID v5 namespace: use a fixed purmemo-sync namespace UUID
        let namespace = UUID(uuidString: "6ba7b810-9dad-11d1-80b4-00c04fd430c8")! // URL namespace
        let namespaceBytes = withUnsafeBytes(of: namespace.uuid) { Array($0) }

        var data = Data(namespaceBytes)
        data.append(input.data(using: .utf8)!)

        // SHA-1 hash
        var hash = [UInt8](repeating: 0, count: Int(CC_SHA1_DIGEST_LENGTH))
        data.withUnsafeBytes { buffer in
            _ = CC_SHA1(buffer.baseAddress, CC_LONG(buffer.count), &hash)
        }

        // Set version (5) and variant (RFC 4122)
        hash[6] = (hash[6] & 0x0F) | 0x50  // version 5
        hash[8] = (hash[8] & 0x3F) | 0x80  // variant RFC 4122

        // Format as UUID string
        let parts = [
            hash[0..<4], hash[4..<6], hash[6..<8], hash[8..<10], hash[10..<16]
        ].map { $0.map { String(format: "%02x", $0) }.joined() }

        return "\(parts[0])-\(parts[1])-\(parts[2])-\(parts[3])-\(parts[4])"
    }

    // MARK: - Preferences Persistence

    private func savePreferences() {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        guard let data = try? encoder.encode(preferences) else { return }
        try? data.write(to: prefsURL, options: .atomic)
    }
}

// MARK: - Errors

enum SyncError: LocalizedError {
    case fileNotFound
    case emptyConversation
    case notAuthenticated
    case encodingFailed
    case serverError(Int, String)
    case unknown

    var errorDescription: String? {
        switch self {
        case .fileNotFound: return "Session file not found in local store"
        case .emptyConversation: return "No conversation content to sync"
        case .notAuthenticated: return "Not signed in — please log in"
        case .encodingFailed: return "Failed to encode request"
        case .serverError(let code, _): return "Server error (\(code))"
        case .unknown: return "Unknown sync error"
        }
    }
}
