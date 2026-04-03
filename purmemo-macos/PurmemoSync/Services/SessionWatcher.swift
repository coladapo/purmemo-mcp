import Foundation
import PurmemoShared

/// Watches all AI tool data sources for new/modified files using FSEvents.
/// Sources: Claude Code, Codex CLI, Cursor, Claude Desktop
/// Triggers SessionStore sync on changes.
class SessionWatcher {

    static let shared = SessionWatcher()

    private var stream: FSEventStreamRef?
    private let debounceInterval: TimeInterval = 2.0
    private var pendingPaths: Set<String> = []
    private var pendingDeletions: Set<String> = []
    private var debounceTimer: DispatchSourceTimer?
    private let queue = DispatchQueue(label: "ai.purmemo.fs-watcher", qos: .utility)

    private let claudeRoot: String
    private let claudeProjectsPath: String
    private let codexRoot: String
    private let cursorDbPath: String
    private let claudeDesktopPath: String
    private let geminiTmpPath: String
    private let memoPath: String
    private var periodicTimer: DispatchSourceTimer?

    private init() {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        claudeRoot = "\(home)/.claude"
        claudeProjectsPath = "\(home)/.claude/projects"
        codexRoot = "\(home)/.codex"
        cursorDbPath = "\(home)/Library/Application Support/Cursor/User/globalStorage"
        claudeDesktopPath = "\(home)/Library/Application Support/Claude/local-agent-mode-sessions"
        geminiTmpPath = "\(home)/.gemini/tmp"
        // Default folder name: "{firstName} memo" — derived from keychain email
        // Falls back to "memo" if not logged in
        let firstName: String = {
            guard let email = KeychainService.load(.userEmail) else { return "memo" }
            let name = email.components(separatedBy: "@").first ?? "memo"
            // "chris@purmemo.ai" → "chris memo"
            return "\(name) memo"
        }()
        memoPath = SessionStore.purmemoHome.appendingPathComponent(firstName).path
    }

    /// Create user-facing directories. Called from start() before FSEvents setup.
    private func ensureDirectories() {
        try? FileManager.default.createDirectory(
            atPath: memoPath,
            withIntermediateDirectories: true,
            attributes: nil
        )
    }

    /// Start watching ALL data sources for file changes
    func start() {
        guard stream == nil else { return }

        // Create personal/ and other user-facing directories first
        ensureDirectories()

        // Build list of paths to watch — only include ones that exist
        let fm = FileManager.default
        var watchPaths: [String] = [
            claudeProjectsPath,
            "\(claudeRoot)/plans",
            "\(claudeRoot)/todos",
            "\(claudeRoot)/tasks",
        ]

        if fm.fileExists(atPath: codexRoot) {
            watchPaths.append(codexRoot)
        }
        if fm.fileExists(atPath: cursorDbPath) {
            watchPaths.append(cursorDbPath)
        }
        if fm.fileExists(atPath: claudeDesktopPath) {
            watchPaths.append(claudeDesktopPath)
        }
        if fm.fileExists(atPath: geminiTmpPath) {
            watchPaths.append(geminiTmpPath)
        }
        // Watch the entire purmemo sync/ folder — catches memo folder,
        // personal files, and any new folders the user creates
        watchPaths.append(SessionStore.purmemoHome.path)

        let paths = watchPaths as CFArray
        var context = FSEventStreamContext()
        context.info = Unmanaged.passUnretained(self).toOpaque()

        guard let eventStream = FSEventStreamCreate(
            nil,
            fsEventsCallback,
            &context,
            paths,
            FSEventStreamEventId(kFSEventStreamEventIdSinceNow),
            2.0, // latency — batch events within 2s
            UInt32(kFSEventStreamCreateFlagUseCFTypes | kFSEventStreamCreateFlagFileEvents)
        ) else {
            Log.shared.error("Failed to create FSEventStream", source: "Watcher")
            return
        }

        stream = eventStream
        FSEventStreamSetDispatchQueue(eventStream, queue)
        FSEventStreamStart(eventStream)
        Log.shared.info("Watching \(watchPaths.count) paths: Claude Code, Codex, Cursor, Claude Desktop, Gemini CLI", source: "Watcher")

        // Periodic full sync every 5 minutes — catches everything FSEvents misses
        startPeriodicSync()
    }

    private func startPeriodicSync() {
        periodicTimer?.cancel()
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now() + 300, repeating: 300) // every 5 min
        timer.setEventHandler {
            Log.shared.info("Periodic sync — all sources + cloud download", source: "Watcher")
            SessionStore.shared.fullSync()
            SessionStore.shared.backupClaudeStores()
            SessionStore.shared.backupAllSources()
            CloudDownloadSync.shared.sync()
        }
        timer.resume()
        periodicTimer = timer
    }

    /// Stop watching
    func stop() {
        guard let stream else { return }
        FSEventStreamStop(stream)
        FSEventStreamInvalidate(stream)
        FSEventStreamRelease(stream)
        self.stream = nil
        debounceTimer?.cancel()
        debounceTimer = nil
        periodicTimer?.cancel()
        periodicTimer = nil
        Log.shared.info("Stopped", source: "Watcher")
    }

    // MARK: - FSEvents Callback

    /// Called by FSEvents when files change — static C function
    private let fsEventsCallback: FSEventStreamCallback = { _, info, numEvents, eventPaths, eventFlags, _ in
        guard let info else { return }
        let watcher = Unmanaged<SessionWatcher>.fromOpaque(info).takeUnretainedValue()
        guard let paths = unsafeBitCast(eventPaths, to: NSArray.self) as? [String] else { return }

        for i in 0..<numEvents {
            let path = paths[i]
            let flags = eventFlags[i]

            // Relevant file types across all sources + memo folder
            let isMemo = path.contains(" memo/")
            let isRelevant = isMemo ||
                             path.hasSuffix(".jsonl") || path.hasSuffix(".json") ||
                             path.hasSuffix(".md") || path.hasSuffix(".sqlite") ||
                             path.hasSuffix(".vscdb") || path.hasSuffix(".vscdb-wal")

            if isMemo {
                Log.shared.info("FSEvent memo hit: \(path)", source: "Watcher")
            }

            guard isRelevant else { continue }

            // Handle removals — sync delete to cloud
            let isRemoved = (flags & UInt32(kFSEventStreamEventFlagItemRemoved)) != 0
            if isRemoved && isMemo {
                watcher.pendingDeletions.insert(path)
                continue
            }
            if isRemoved { continue }

            watcher.pendingPaths.insert(path)
        }

        if !watcher.pendingPaths.isEmpty {
            watcher.scheduleDebouncedSync()
        }
    }

    // MARK: - Debounced Sync

    /// Debounce rapid writes (Claude Code writes incrementally during a session)
    private func scheduleDebouncedSync() {
        debounceTimer?.cancel()

        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now() + debounceInterval)
        timer.setEventHandler { [weak self] in
            self?.processPendingPaths()
        }
        timer.resume()
        debounceTimer = timer
    }

    private func processPendingPaths() {
        let paths = pendingPaths
        let deletions = pendingDeletions
        pendingPaths.removeAll()
        pendingDeletions.removeAll()

        // Handle deletes — remove from cloud + DB
        for path in deletions {
            let fileName = URL(fileURLWithPath: path).lastPathComponent
            let sessionId = "memo-\(fileName)"
            if let item = SessionStore.shared.database.fetch(sessionId: sessionId) {
                // Delete from cloud if it was synced
                if let cloudId = item.cloudId {
                    deleteFromCloud(memoryId: cloudId)
                }
                // Remove from local DB
                SessionStore.shared.database.delete(sessionId: sessionId)
                Log.shared.info("Deleted: \(fileName) (local + cloud)", source: "Watcher")
            }
        }

        guard !paths.isEmpty else { return }

        let store = SessionStore.shared
        var needsClaudeBackup = false
        var needsMultiSourceBackup = false

        for path in paths {
            if path.hasSuffix(".jsonl") && path.contains("/.claude/projects/") {
                // Claude Code session JSONL — sync individually for speed
                let url = URL(fileURLWithPath: path)
                let sessionId = url.deletingPathExtension().lastPathComponent
                let dirName = url.deletingLastPathComponent().lastPathComponent

                let project = SessionStore.projectNameFromDir(dirName)
                let result = store.syncFile(sourcePath: path, sessionId: sessionId, project: project)

                switch result {
                case .copied:
                    Log.shared.info("Session copied: \(sessionId) (\(project))", source: "Watcher")
                case .updated:
                    Log.shared.info("Session updated: \(sessionId)", source: "Watcher")
                case .skipped, .failed:
                    break
                }
            } else if path.contains("/.claude/") {
                // Claude Code plans/todos/tasks/history
                needsClaudeBackup = true
            } else if path.contains("/.codex/") || path.contains("/Cursor/") ||
                      path.contains("/Claude/local-agent-mode-sessions") {
                // Codex, Cursor, or Claude Desktop changed
                needsMultiSourceBackup = true
                let source = path.contains("/.codex/") ? "Codex" :
                             path.contains("/Cursor/") ? "Cursor" : "Claude Desktop"
                Log.shared.info("\(source) change detected: \(URL(fileURLWithPath: path).lastPathComponent)", source: "Watcher")
            } else if path.hasPrefix(memoPath) || path.contains(" memo/") {
                // User added a file to memo folder — index it
                Log.shared.info("Memo file changed: \(URL(fileURLWithPath: path).lastPathComponent) (memoPath=\(memoPath))", source: "Watcher")
                indexPersonalFile(path)
            }
        }

        if needsClaudeBackup {
            store.backupClaudeStores()
        }

        if needsMultiSourceBackup {
            store.backupAllSources()
        }
    }

    /// Delete a memory from the purmemo cloud API (soft delete — sets deleted_at).
    /// Retries once with exponential backoff on 429 rate limit.
    private func deleteFromCloud(memoryId: String, attempt: Int = 1) {
        guard let token = KeychainService.load(.accessToken) else { return }
        guard let url = URL(string: "https://api.purmemo.ai/api/v1/memories/\(memoryId)") else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 15

        let semaphore = DispatchSemaphore(value: 0)
        var statusCode = 0
        URLSession.shared.dataTask(with: request) { _, response, _ in
            defer { semaphore.signal() }
            if let http = response as? HTTPURLResponse {
                statusCode = http.statusCode
                if http.statusCode == 200 {
                    Log.shared.info("Cloud deleted: \(memoryId.prefix(8))", source: "Watcher")
                } else if http.statusCode == 429 {
                    Log.shared.warn("Cloud delete rate limited (429) for \(memoryId.prefix(8)), attempt \(attempt)", source: "Watcher")
                } else {
                    Log.shared.error("Cloud delete failed: HTTP \(http.statusCode) for \(memoryId.prefix(8))", source: "Watcher")
                }
            }
        }.resume()
        semaphore.wait()

        // Retry once on 429 with exponential backoff
        if statusCode == 429 && attempt < 3 {
            let delay = Double(attempt) * 2.0 // 2s, 4s
            Thread.sleep(forTimeInterval: delay)
            deleteFromCloud(memoryId: memoryId, attempt: attempt + 1)
        }
    }

    /// Index a file dropped into ~/purmemo sync/memo/ into the sync database.
    /// If it's an image AND user is authenticated, also upload to cloud.
    private func indexPersonalFile(_ path: String) {
        let fm = FileManager.default
        guard fm.fileExists(atPath: path) else { return }
        guard let attrs = try? fm.attributesOfItem(atPath: path) else { return }

        let fileName = URL(fileURLWithPath: path).lastPathComponent
        let fileSize = attrs[.size] as? UInt64 ?? 0
        let mtime = attrs[.modificationDate] as? Date ?? Date()

        let syncRoot = SessionStore.purmemoHome.path
        let relativePath = path.hasPrefix(syncRoot)
            ? String(path.dropFirst(syncRoot.count + 1))
            : "\(URL(fileURLWithPath: memoPath).lastPathComponent)/\(fileName)"

        let sessionId = "memo-\(fileName)"

        // Index locally
        SessionStore.shared.database.upsert(SyncItem(
            id: 0,
            origin: "local",
            sourceType: "memo",
            sessionId: sessionId,
            title: fileName,
            project: "memo",
            localPath: relativePath,
            sourcePath: path,
            localHash: "",
            fileSize: fileSize,
            messageCount: nil,
            cloudId: nil,
            syncState: .localOnly,
            sourceDeleted: false,
            cloudUpdatedAt: nil,
            localUpdatedAt: mtime,
            createdAt: mtime,
            customTitle: nil, aiTitle: nil, tags: nil, prLink: nil,
            lastPrompt: nil, worktreeBranch: nil, sessionMode: nil,
            projectId: nil
        ))

        // If it's an image, queue for user review before uploading
        let imageExtensions = ["png", "jpg", "jpeg", "heic", "webp", "gif"]
        let ext = URL(fileURLWithPath: path).pathExtension.lowercased()
        if imageExtensions.contains(ext) {
            Task { @MainActor in
                DropQueue.shared.addImage(path: path)
            }
        }
    }

    /// Upload an image from personal/ to purmemo cloud as a memory with attached image
    private func uploadPersonalImage(path: String, fileName: String, sessionId: String) {
        guard let token = KeychainService.load(.accessToken) else { return }
        guard let imageData = FileManager.default.contents(atPath: path) else { return }

        queue.async {
            // Step 1: Create a memory for this image
            let title = "Desktop: \(fileName)"
            let bodyJSON: [String: Any] = [
                "title": title,
                "content": "Image saved from desktop: \(fileName)",
                "content_type": "image",
                "source_type": "desktop_image",
                "source_metadata": ["filename": fileName]
            ]

            guard let bodyData = try? JSONSerialization.data(withJSONObject: bodyJSON) else { return }

            var createReq = URLRequest(url: URL(string: "https://api.purmemo.ai/api/v1/memories/")!)
            createReq.httpMethod = "POST"
            createReq.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            createReq.setValue("application/json", forHTTPHeaderField: "Content-Type")
            createReq.httpBody = bodyData
            createReq.timeoutInterval = 30

            let sem1 = DispatchSemaphore(value: 0)
            var memoryId: String?

            URLSession.shared.dataTask(with: createReq) { data, response, error in
                defer { sem1.signal() }
                guard let data, error == nil,
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let id = json["id"] as? String else { return }
                memoryId = id
            }.resume()
            sem1.wait()

            guard let memoryId else {
                Log.shared.error("Failed to create memory for personal image: \(fileName)", source: "Watcher")
                return
            }

            // Step 2: Upload image to the memory
            let boundary = UUID().uuidString
            var uploadReq = URLRequest(url: URL(string: "https://api.purmemo.ai/api/v1/memories/\(memoryId)/images")!)
            uploadReq.httpMethod = "POST"
            uploadReq.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            uploadReq.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
            uploadReq.timeoutInterval = 60

            // Build multipart body
            let ext = URL(fileURLWithPath: path).pathExtension.lowercased()
            let mimeType = ext == "png" ? "image/png" :
                           ext == "gif" ? "image/gif" :
                           ext == "webp" ? "image/webp" :
                           ext == "heic" ? "image/heic" : "image/jpeg"

            var body = Data()
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"image\"; filename=\"\(fileName)\"\r\n".data(using: .utf8)!)
            body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
            body.append(imageData)
            body.append("\r\n--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"position\"\r\n\r\n0\r\n".data(using: .utf8)!)
            body.append("--\(boundary)--\r\n".data(using: .utf8)!)
            uploadReq.httpBody = body

            let sem2 = DispatchSemaphore(value: 0)
            var uploadSuccess = false

            URLSession.shared.dataTask(with: uploadReq) { data, response, error in
                defer { sem2.signal() }
                guard error == nil,
                      let httpResponse = response as? HTTPURLResponse,
                      httpResponse.statusCode == 201 else { return }
                uploadSuccess = true
            }.resume()
            sem2.wait()

            if uploadSuccess {
                // Mark as synced in database
                SessionStore.shared.database.markCloudSynced(sessionId: sessionId, cloudId: memoryId)
                Log.shared.info("Personal image uploaded: \(fileName) → memory \(memoryId.prefix(8))", source: "Watcher")
            } else {
                Log.shared.error("Failed to upload image for memory \(memoryId.prefix(8))", source: "Watcher")
            }
        }
    }

    deinit {
        stop()
    }
}
