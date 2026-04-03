import Foundation
import PurmemoShared

/// Downloads cloud memories from purmemo API to ~/purmemo sync/cloud/.
/// Tracks each downloaded memory in SyncDatabase with origin='cloud' and sync_state='synced'.
/// Runs on a timer and can be triggered manually.
@Observable
class CloudDownloadSync {

    static let shared = CloudDownloadSync()

    var isDownloading = false
    var downloadedCount = 0
    var lastDownloadTime: Date?
    var lastError: String?

    private let store = SessionStore.shared
    private let cloudRoot: URL
    private let queue = DispatchQueue(label: "ai.purmemo.cloud-download", qos: .utility)

    private init() {
        cloudRoot = SessionStore.purmemoHome
        // Subdirectories created per-platform during download
    }

    // MARK: - Full Download Sync

    /// Download all cloud memories not yet stored locally.
    /// Uses a watermark (last_cloud_sync_at) to only fetch memories updated since the last sync.
    /// Falls back to full pagination on first run or when watermark is missing.
    func sync() {
        guard !isDownloading else { return }

        // Need auth token
        guard let token = KeychainService.load(.accessToken) else {
            lastError = "Not authenticated"
            return
        }

        DispatchQueue.main.async { self.isDownloading = true }

        queue.async { [self] in
            var page = 1
            let pageSize = 50
            var totalDownloaded = 0
            var hasMore = true

            // Phase L: Read watermark — only fetch memories updated after this timestamp
            let watermark = store.database.getMeta(key: "last_cloud_sync_at")
            var newestUpdatedAt: String?

            while hasMore {
                let result = fetchPage(page: page, pageSize: pageSize, token: token, updatedAfter: watermark)

                switch result {
                case .success(let response):
                    for memory in response.memories {
                        // Track newest updated_at for watermark
                        if let updatedAt = memory.updated_at {
                            let isoStr = Self.isoFormatter.string(from: updatedAt)
                            if newestUpdatedAt == nil || isoStr > newestUpdatedAt! {
                                newestUpdatedAt = isoStr
                            }
                        }

                        // If already in database, just check for missing images
                        if let existing = store.database.fetch(sessionId: memory.id) {
                            if memory.imageCount > 0 {
                                let existingDir = cloudRoot.appendingPathComponent(
                                    URL(fileURLWithPath: existing.localPath).deletingLastPathComponent().relativePath
                                )
                                let mediaDir = existingDir.appendingPathComponent("media")
                                let expectedFile = mediaDir.appendingPathComponent("\(memory.id)_0.png")
                                if !FileManager.default.fileExists(atPath: expectedFile.path) {
                                    downloadImages(memoryId: memory.id, destDir: existingDir, token: token)
                                }
                            }
                            continue
                        }

                        // Save content to file, organized by platform
                        let fileName = "\(memory.id).json"
                        let sourceType = memory.source_type ?? "unknown"
                        let platformFolder = Self.platformFolder(
                            platform: memory.platform,
                            sourceType: sourceType
                        )
                        let projectDir = cloudRoot.appendingPathComponent(platformFolder)
                        try? FileManager.default.createDirectory(at: projectDir, withIntermediateDirectories: true)

                        let filePath = projectDir.appendingPathComponent(fileName)
                        let relativePath = "\(platformFolder)/\(fileName)"

                        // Write memory as JSON (full content preserved)
                        if let jsonData = try? JSONSerialization.data(
                            withJSONObject: memory.rawJSON,
                            options: [.prettyPrinted, .sortedKeys]
                        ) {
                            try? jsonData.write(to: filePath)
                            let fileSize = UInt64(jsonData.count)

                            // Track in database
                            // Phase N: Resolve project from cloud metadata
                            let resolvedProjectId = ProjectResolver.shared.resolveFromCloud(
                                projectName: memory.project,
                                platform: memory.platform,
                                memoryId: memory.id
                            )

                            store.database.upsert(SyncItem(
                                id: 0,
                                origin: "cloud",
                                sourceType: sourceType,
                                sessionId: memory.id,
                                title: memory.title,
                                project: memory.project ?? "unknown",
                                localPath: relativePath,
                                sourcePath: "api.purmemo.ai",
                                localHash: "",
                                fileSize: fileSize,
                                messageCount: nil,
                                cloudId: memory.id,
                                syncState: .synced,
                                sourceDeleted: false,
                                cloudUpdatedAt: memory.updated_at,
                                localUpdatedAt: Date(),
                                createdAt: memory.created_at ?? Date(),
                                customTitle: nil, aiTitle: nil, tags: nil, prLink: nil,
                                lastPrompt: nil, worktreeBranch: nil, sessionMode: nil,
                                projectId: resolvedProjectId
                            ))
                            totalDownloaded += 1

                            // Phase N: Index cloud intelligence from rawJSON
                            Self.indexCloudIntelligence(
                                memoryId: memory.id,
                                projectId: resolvedProjectId,
                                platform: memory.platform ?? "unknown",
                                rawJSON: memory.rawJSON,
                                database: store.database
                            )

                            // Download images if this memory has any
                            if memory.imageCount > 0 {
                                self.downloadImages(
                                    memoryId: memory.id,
                                    destDir: projectDir,
                                    token: token
                                )
                            }
                        }
                    }

                    hasMore = response.has_more
                    page += 1

                case .failure(let error):
                    Log.shared.error("Cloud download failed on page \(page): \(error)", source: "CloudDownload")
                    hasMore = false
                    DispatchQueue.main.async {
                        self.lastError = error.localizedDescription
                    }
                }
            }

            // Phase L: Save watermark for next sync
            if let newest = newestUpdatedAt {
                store.database.setMeta(key: "last_cloud_sync_at", value: newest)
            }

            let total = store.database.count()
            DispatchQueue.main.async {
                self.downloadedCount = totalDownloaded
                self.lastDownloadTime = Date()
                self.isDownloading = false
                self.store.syncedCount = total
            }

            if totalDownloaded > 0 {
                Log.shared.info("Downloaded \(totalDownloaded) cloud memories", source: "CloudDownload")
            }
        }
    }

    // MARK: - Image Download

    /// Download all images for a memory and save alongside its JSON file
    private func downloadImages(memoryId: String, destDir: URL, token: String) {
        // Fetch image list
        let urlString = "https://api.purmemo.ai/api/v1/memories/\(memoryId)/images"
        guard let url = URL(string: urlString) else { return }

        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 30

        let semaphore = DispatchSemaphore(value: 0)
        var imageURLs: [(position: Int, url: String)] = []

        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            defer { semaphore.signal() }
            guard let data, error == nil,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let images = json["images"] as? [[String: Any]] else { return }

            for img in images {
                if let pos = img["position"] as? Int,
                   let urlStr = img["url"] as? String {
                    imageURLs.append((pos, urlStr))
                }
            }
        }
        task.resume()
        semaphore.wait()

        guard !imageURLs.isEmpty else { return }

        // Create media subdirectory for this memory's images
        let mediaDir = destDir.appendingPathComponent("media")
        try? FileManager.default.createDirectory(at: mediaDir, withIntermediateDirectories: true)

        // Download each image
        var downloaded = 0
        for (position, signedURL) in imageURLs {
            guard let url = URL(string: signedURL) else { continue }

            let ext = url.pathExtension.isEmpty ? "png" : url.pathExtension.components(separatedBy: "?").first ?? "png"
            let imageName = "\(memoryId)_\(position).\(ext)"
            let imagePath = mediaDir.appendingPathComponent(imageName)

            // Skip if already downloaded
            if FileManager.default.fileExists(atPath: imagePath.path) { continue }

            let imgSemaphore = DispatchSemaphore(value: 0)
            let imgTask = URLSession.shared.dataTask(with: url) { data, _, error in
                defer { imgSemaphore.signal() }
                guard let data, error == nil else { return }
                try? data.write(to: imagePath)
                downloaded += 1
            }
            imgTask.resume()
            imgSemaphore.wait()
        }

        if downloaded > 0 {
            Log.shared.info("Downloaded \(downloaded) images for memory \(memoryId.prefix(8))", source: "CloudDownload")
        }
    }

    // MARK: - API Call

    private static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private func fetchPage(page: Int, pageSize: Int, token: String, updatedAfter: String? = nil) -> Result<MemoriesResponse, Error> {
        var urlString = "https://api.purmemo.ai/api/v1/memories/?page=\(page)&page_size=\(pageSize)&sort=updated_at&order=desc"
        // Phase L: Only fetch memories updated after the watermark
        if let after = updatedAfter {
            let encoded = after.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? after
            urlString += "&updated_after=\(encoded)"
        }
        guard let url = URL(string: urlString) else {
            return .failure(SyncError.invalidURL)
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 30

        let semaphore = DispatchSemaphore(value: 0)
        var result: Result<MemoriesResponse, Error> = .failure(SyncError.timeout)

        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            defer { semaphore.signal() }

            if let error {
                result = .failure(error)
                return
            }

            guard let httpResponse = response as? HTTPURLResponse else {
                result = .failure(SyncError.invalidResponse)
                return
            }

            if httpResponse.statusCode == 401 {
                result = .failure(SyncError.unauthorized)
                return
            }

            guard httpResponse.statusCode == 200, let data else {
                result = .failure(SyncError.httpError(httpResponse.statusCode))
                return
            }

            do {
                let parsed = try Self.parseMemoriesResponse(data)
                result = .success(parsed)
            } catch {
                result = .failure(error)
            }
        }
        task.resume()
        semaphore.wait()
        return result
    }

    // MARK: - Response Parsing

    private static func parseMemoriesResponse(_ data: Data) throws -> MemoriesResponse {
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let memoriesArray = json["memories"] as? [[String: Any]] else {
            throw SyncError.parseError
        }

        let total = json["total"] as? Int ?? 0
        let hasMore = json["has_more"] as? Bool ?? false

        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        let memories = memoriesArray.map { dict -> CloudMemory in
            let id = dict["id"] as? String ?? UUID().uuidString
            let title = dict["title"] as? String
            let sourceType = dict["source_type"] as? String
            let platform = dict["platform"] as? String
            let project = dict["project_name"] as? String ?? dict["project"] as? String
            let createdAtStr = dict["created_at"] as? String
            let updatedAtStr = dict["updated_at"] as? String

            let imageCount = dict["image_count"] as? Int ?? 0

            return CloudMemory(
                id: id,
                title: title,
                source_type: sourceType,
                platform: platform,
                project: project,
                imageCount: imageCount,
                created_at: createdAtStr.flatMap { isoFormatter.date(from: $0) },
                updated_at: updatedAtStr.flatMap { isoFormatter.date(from: $0) },
                rawJSON: dict
            )
        }

        return MemoriesResponse(
            memories: memories,
            total: total,
            has_more: hasMore
        )
    }

    // MARK: - Types

    struct MemoriesResponse {
        let memories: [CloudMemory]
        let total: Int
        let has_more: Bool
    }

    struct CloudMemory {
        let id: String
        let title: String?
        let source_type: String?
        let platform: String?
        let project: String?
        let imageCount: Int
        let created_at: Date?
        let updated_at: Date?
        let rawJSON: [String: Any]
    }

    /// Map platform + source_type to folder path under ~/purmemo sync/
    /// Priority: source_type first (most specific), then platform
    static func platformFolder(platform: String?, sourceType: String) -> String {
        let st = sourceType.lowercased()
        let p = (platform ?? "").lowercased().trimmingCharacters(in: .whitespaces)

        // Source-specific routing (most accurate — ignores platform field)
        if st.hasPrefix("ios_")       { return "purmemo/ios" }
        if st == "desktop_image"      { return "purmemo/desktop" }
        if st == "desktop_clipboard"  { return "purmemo/desktop" }

        // Platform-specific routing
        if p == "purmemo-desktop"     { return "purmemo/desktop" }
        if p == "purmemo-ios"         { return "purmemo/ios" }
        if p.contains("claude")       { return "anthropic/claude-web" }
        if p == "chatgpt"             { return "openai/chatgpt" }
        if p == "gemini"              { return "google/gemini" }
        if p == "cursor"              { return "cursor" }
        if p.contains("figma")        { return "figma" }
        if p.contains("purmemo")      { return "purmemo/web" }
        if p.contains("supabase")     { return "purmemo/web" }
        return "purmemo/web"
    }

    // MARK: - Phase N: Cloud Intelligence Indexing

    /// Parse Gemini-extracted intelligence fields from downloaded memory rawJSON
    /// and store in session_intelligence table for local search.
    static func indexCloudIntelligence(memoryId: String, projectId: String?,
                                       platform: String, rawJSON: [String: Any],
                                       database: SyncDatabase) {
        var fields: [String: Any] = [:]

        // Map the 22 cloud intelligence fields
        if let v = rawJSON["summary"] as? String { fields["summary_cloud"] = v }
        if let v = rawJSON["category"] as? String { fields["category"] = v }
        if let v = rawJSON["intent"] as? String { fields["intent"] = v }
        if let v = rawJSON["primary_intent"] as? String { fields["primary_intent"] = v }
        if let v = rawJSON["task_type"] as? String { fields["task_type"] = v }
        if let v = rawJSON["next_phase_hint"] as? String { fields["next_phase_hint"] = v }
        if let v = rawJSON["key_result"] as? String { fields["key_result"] = v }
        fields["cloud_memory_id"] = memoryId

        // JSON array fields → serialize to string
        if let v = rawJSON["tags"] as? [String] {
            fields["cloud_tags"] = (try? JSONSerialization.data(withJSONObject: v))
                .flatMap { String(data: $0, encoding: .utf8) }
        }
        if let v = rawJSON["technologies_validated"] as? [String] {
            fields["technologies"] = (try? JSONSerialization.data(withJSONObject: v))
                .flatMap { String(data: $0, encoding: .utf8) }
        }
        if let v = rawJSON["tools_validated"] as? [String] {
            fields["tools_validated"] = (try? JSONSerialization.data(withJSONObject: v))
                .flatMap { String(data: $0, encoding: .utf8) }
        }

        // Complex JSONB fields → serialize to string
        for key in ["impact", "context_structured", "work_items", "brief_blockers",
                     "brief_completions", "decisions", "lesson", "causal", "workflow"] {
            if let v = rawJSON[key] {
                let dbKey: String
                switch key {
                case "context_structured": dbKey = "context_json"
                case "work_items": dbKey = "work_items_json"
                case "brief_blockers": dbKey = "blockers_json"
                case "brief_completions": dbKey = "completions_json"
                case "lesson": dbKey = "lesson_json"
                case "causal": dbKey = "causal_json"
                case "workflow": dbKey = "workflow_json"
                case "decisions": dbKey = "decisions_json"
                default: dbKey = "\(key)_json"
                }
                if let data = try? JSONSerialization.data(withJSONObject: v),
                   let str = String(data: data, encoding: .utf8) {
                    fields[dbKey] = str
                }
            }
        }

        fields["cloud_synced_at"] = isoFormatter.string(from: Date())

        guard !fields.isEmpty else { return }

        database.upsertSessionIntelligence(
            sessionId: memoryId,
            projectId: projectId,
            platform: platform,
            fields: fields
        )

        // Index entities from rawJSON
        if let entities = rawJSON["entities"] as? [[String: Any]] {
            for entity in entities {
                guard let name = entity["name"] as? String,
                      let type = entity["type"] as? String else { continue }
                let mentions = entity["mentions"] as? Int ?? 1
                database.insertSessionEntity(
                    sessionId: memoryId, name: name, entityType: type,
                    mentions: mentions, source: "cloud"
                )
            }
        }
    }

    enum SyncError: Error, LocalizedError {
        case invalidURL
        case timeout
        case invalidResponse
        case unauthorized
        case httpError(Int)
        case parseError

        var errorDescription: String? {
            switch self {
            case .invalidURL: return "Invalid API URL"
            case .timeout: return "Request timed out"
            case .invalidResponse: return "Invalid response"
            case .unauthorized: return "Authentication expired"
            case .httpError(let code): return "HTTP \(code)"
            case .parseError: return "Failed to parse response"
            }
        }
    }
}
