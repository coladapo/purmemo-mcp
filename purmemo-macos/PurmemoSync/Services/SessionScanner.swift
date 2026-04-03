import Foundation
import Combine

// MARK: - Data Models

struct SessionIndex: Codable {
    let version: Int
    let entries: [SessionEntry]
}

/// Tail metadata extracted from the end of a JSONL session file.
/// Claude Code writes titles, tags, PR links, and mode at EOF on session exit.
struct SessionTailMetadata {
    var customTitle: String?       // User-set via /rename
    var aiTitle: String?           // Claude-generated session title
    var tags: [String] = []        // User-applied searchable tags
    var prLink: String?            // Associated GitHub PR URL
    var lastPrompt: String?        // Last user prompt (resume preview)
    var worktreeBranch: String?    // Worktree branch name
    var sessionMode: String?       // "coordinator" or "normal"
    var compactionSummaries: [String] = []  // Distilled summaries from context collapse
    var trackedFiles: [(path: String, version: Int)] = []  // Phase K: files edited in session
}

struct SessionEntry: Codable, Identifiable {
    let sessionId: String
    let fullPath: String?
    let firstPrompt: String?
    let messageCount: Int?
    let created: String?
    let modified: String?
    let gitBranch: String?
    let projectPath: String?
    let isSidechain: Bool?

    // Phase G: Tail metadata fields (populated by deep scan)
    var customTitle: String?
    var aiTitle: String?
    var tags: [String]?
    var prLink: String?
    var lastPrompt: String?
    var worktreeBranch: String?
    var sessionMode: String?

    var id: String { sessionId }

    /// Best available title: customTitle > aiTitle > firstPrompt > sessionId
    var bestTitle: String {
        if let t = customTitle, !t.isEmpty { return t }
        if let t = aiTitle, !t.isEmpty { return t }
        if let p = firstPrompt, !p.isEmpty { return p }
        return sessionId
    }

    /// Human-friendly project name derived from projectPath or directory name
    var projectName: String {
        guard let path = projectPath else { return "Unknown" }
        let components = path.split(separator: "/")
        for component in components.reversed() {
            let name = String(component)
            if !["active", "____active", "puo-jects", "Users", "wivak", "Library", "CloudStorage", "Dropbox", "home"].contains(name) {
                return name
            }
        }
        return components.last.map(String.init) ?? "Unknown"
    }

    var modifiedDate: Date? {
        guard let modified else { return nil }
        return Self.isoFormatter.date(from: modified)
    }

    var createdDate: Date? {
        guard let created else { return nil }
        return Self.isoFormatter.date(from: created)
    }

    var displayPrompt: String {
        let title = bestTitle
        if title == sessionId { return "No prompt" }
        if title.count <= 80 { return title }
        return String(title.prefix(77)) + "..."
    }

    private static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    /// CodingKeys — tail metadata fields are NOT in sessions-index.json,
    /// so they decode as nil from the index and get populated by deep scan.
    enum CodingKeys: String, CodingKey {
        case sessionId, fullPath, firstPrompt, messageCount, created, modified
        case gitBranch, projectPath, isSidechain
        case customTitle, aiTitle, tags, prLink, lastPrompt, worktreeBranch, sessionMode
    }
}

/// A project grouping with its sessions
struct ProjectGroup: Identifiable {
    let name: String
    let projectPath: String?
    var sessions: [SessionEntry]

    var id: String { name }

    var totalMessages: Int {
        sessions.compactMap(\.messageCount).reduce(0, +)
    }

    var latestActivity: Date? {
        sessions.compactMap(\.modifiedDate).max()
    }
}

// MARK: - First-line JSONL metadata (for directories without sessions-index.json)

private struct JSONLFirstLine: Codable {
    let sessionId: String?
    let timestamp: String?
    let cwd: String?
    let gitBranch: String?
    let isSidechain: Bool?
}

private struct JSONLUserMessage: Codable {
    let type: String?
    let message: UserMessageContent?

    struct UserMessageContent: Codable {
        let role: String?
        let content: StringOrArray?
    }
}

/// Handle content that can be a string or an array of content blocks
private enum StringOrArray: Codable {
    case string(String)
    case array([[String: String]])

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let str = try? container.decode(String.self) {
            self = .string(str)
        } else if let arr = try? container.decode([[String: String]].self) {
            self = .array(arr)
        } else {
            self = .string("")
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let s): try container.encode(s)
        case .array(let a): try container.encode(a)
        }
    }

    var text: String {
        switch self {
        case .string(let s): return s
        case .array(let blocks):
            return blocks.compactMap { $0["text"] }.joined(separator: " ")
        }
    }
}

// MARK: - Scanner

@Observable
class SessionScanner {
    var projectGroups: [ProjectGroup] = []
    var isScanning = false
    var totalSessions = 0
    var error: String?

    private let claudeProjectsPath: String

    init() {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        claudeProjectsPath = "\(home)/.claude/projects"
    }

    func scan() {
        isScanning = true
        error = nil

        Task.detached { [claudeProjectsPath] in
            let fm = FileManager.default
            var allEntries: [SessionEntry] = []

            guard let projectDirs = try? fm.contentsOfDirectory(atPath: claudeProjectsPath) else {
                await MainActor.run {
                    self.error = "Cannot read ~/.claude/projects/"
                    self.isScanning = false
                }
                return
            }

            for dir in projectDirs {
                let dirPath = "\(claudeProjectsPath)/\(dir)"
                let indexPath = "\(dirPath)/sessions-index.json"

                // Collect indexed session IDs so we don't double-count
                var indexedSessionIds: Set<String> = []

                if fm.fileExists(atPath: indexPath),
                   let data = fm.contents(atPath: indexPath),
                   let index = try? JSONDecoder().decode(SessionIndex.self, from: data) {
                    let mainSessions = index.entries.filter { $0.isSidechain != true }
                    allEntries.append(contentsOf: mainSessions)
                    indexedSessionIds = Set(index.entries.map(\.sessionId))
                }

                // Also scan JSONL files not covered by the index
                let extraEntries = Self.scanJSONLFiles(in: dirPath, dirName: dir, excluding: indexedSessionIds)
                allEntries.append(contentsOf: extraEntries)
            }

            // Group by project name
            let grouped = Dictionary(grouping: allEntries) { $0.projectName }
            let groups = grouped.map { name, sessions in
                ProjectGroup(
                    name: name,
                    projectPath: sessions.first?.projectPath,
                    sessions: sessions.sorted { ($0.modifiedDate ?? .distantPast) > ($1.modifiedDate ?? .distantPast) }
                )
            }
            .sorted { ($0.latestActivity ?? .distantPast) > ($1.latestActivity ?? .distantPast) }

            let totalCount = allEntries.count
            await MainActor.run {
                self.projectGroups = groups
                self.totalSessions = totalCount
                self.isScanning = false
                // Pass 2: Deep scan for tail metadata (background, non-blocking)
                self.deepScan()
            }
        }
    }

    /// Scan individual JSONL files in a project directory, skipping any already in the index
    private static func scanJSONLFiles(in dirPath: String, dirName: String, excluding indexedIds: Set<String> = []) -> [SessionEntry] {
        let fm = FileManager.default
        guard let files = try? fm.contentsOfDirectory(atPath: dirPath) else { return [] }

        let jsonlFiles = files.filter { $0.hasSuffix(".jsonl") }
        var entries: [SessionEntry] = []
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        for file in jsonlFiles {
            // Skip if already covered by sessions-index.json
            let fileSessionId = file.replacingOccurrences(of: ".jsonl", with: "")
            if indexedIds.contains(fileSessionId) { continue }

            let filePath = "\(dirPath)/\(file)"

            // Read line-by-line using StreamReader to avoid loading huge files (up to 85MB) into memory.
            // Some first lines are 100KB+ so the old 64KB chunk approach truncated mid-JSON.
            guard let inputStream = InputStream(fileAtPath: filePath) else { continue }
            let lines = Self.readLines(from: inputStream, maxLines: 30, maxBytes: 262_144) // 256KB cap
            guard !lines.isEmpty else { continue }

            // Parse first line for metadata
            guard let firstLineData = lines[0].data(using: .utf8),
                  let meta = try? JSONDecoder().decode(JSONLFirstLine.self, from: firstLineData) else { continue }

            // Skip sidechains
            if meta.isSidechain == true { continue }

            // Find first user message for the prompt
            var firstPrompt: String?
            var userCount = 0
            var assistantCount = 0
            for line in lines {
                guard let lineData = line.data(using: .utf8),
                      let msg = try? JSONDecoder().decode(JSONLUserMessage.self, from: lineData) else { continue }
                if msg.type == "user" || msg.type == "human" {
                    userCount += 1
                    if firstPrompt == nil {
                        firstPrompt = msg.message?.content?.text
                    }
                }
                if msg.type == "assistant" { assistantCount += 1 }
            }

            // Use file mtime for "modified" — more reliable than in-file timestamps
            let sessionId = meta.sessionId ?? fileSessionId
            let attrs = try? fm.attributesOfItem(atPath: filePath)
            let fileMod = attrs?[.modificationDate] as? Date
            let projectPath = meta.cwd ?? Self.projectPathFromDirName(dirName)
            let messageCount = userCount + assistantCount

            let entry = SessionEntry(
                sessionId: sessionId,
                fullPath: filePath,
                firstPrompt: firstPrompt,
                messageCount: messageCount > 0 ? messageCount : nil,
                created: meta.timestamp,
                modified: fileMod.map { isoFormatter.string(from: $0) } ?? meta.timestamp,
                gitBranch: meta.gitBranch,
                projectPath: projectPath,
                isSidechain: false
            )
            entries.append(entry)
        }

        return entries
    }

    /// Reverse the Claude Code directory name encoding to get a project path
    /// e.g. "-Users-wivak-puo-jects-----active-krawlr" → "/Users/wivak/puo-jects/____active/krawlr"
    private static func projectPathFromDirName(_ dirName: String) -> String {
        // Claude Code encodes paths by replacing / with - and prepending -
        // Multiple consecutive dashes represent underscores in the original path
        var path = dirName
        // The encoding: leading - is the root /, then each - is a /
        // But consecutive dashes (----) represent underscores
        // Heuristic: replace the known pattern
        if path.hasPrefix("-") {
            path = String(path.dropFirst())
        }
        path = path.replacingOccurrences(of: "-----", with: "/____")
        path = path.replacingOccurrences(of: "----", with: "/___")
        path = path.replacingOccurrences(of: "---", with: "/__")
        path = path.replacingOccurrences(of: "--", with: "/_")
        path = path.replacingOccurrences(of: "-", with: "/")
        return "/" + path
    }

    /// Read up to `maxLines` complete lines from an InputStream, stopping after `maxBytes` total.
    /// Handles arbitrarily long lines without loading the whole file.
    private static func readLines(from stream: InputStream, maxLines: Int, maxBytes: Int) -> [String] {
        stream.open()
        defer { stream.close() }

        var result: [String] = []
        var buffer = Data()
        let chunkSize = 8192
        var totalRead = 0
        let temp = UnsafeMutablePointer<UInt8>.allocate(capacity: chunkSize)
        defer { temp.deallocate() }

        while stream.hasBytesAvailable && totalRead < maxBytes && result.count < maxLines {
            let bytesToRead = min(chunkSize, maxBytes - totalRead)
            let read = stream.read(temp, maxLength: bytesToRead)
            guard read > 0 else { break }
            totalRead += read
            buffer.append(temp, count: read)

            // Extract complete lines (delimited by \n)
            while let range = buffer.range(of: Data([0x0A])) { // newline byte
                let lineData = buffer.subdata(in: buffer.startIndex..<range.lowerBound)
                buffer.removeSubrange(buffer.startIndex...range.lowerBound)
                if let line = String(data: lineData, encoding: .utf8), !line.isEmpty {
                    result.append(line)
                    if result.count >= maxLines { return result }
                }
            }
        }

        // Handle last line without trailing newline
        if !buffer.isEmpty, result.count < maxLines,
           let line = String(data: buffer, encoding: .utf8), !line.isEmpty {
            result.append(line)
        }

        return result
    }

    func sessionFileSize(_ entry: SessionEntry) -> String? {
        guard let path = entry.fullPath else { return nil }
        guard let attrs = try? FileManager.default.attributesOfItem(atPath: path),
              let size = attrs[.size] as? UInt64 else { return nil }
        return ByteCountFormatter.string(fromByteCount: Int64(size), countStyle: .file)
    }

    // MARK: - Phase M: Deep Scan (Pass 2)

    /// Run deep scan on all sessions to extract tail metadata (titles, tags, PR links, summaries).
    /// This runs on a background queue AFTER the fast scan populates the list.
    func deepScan() {
        Task.detached { [weak self] in
            guard let self else { return }
            var updatedGroups = await MainActor.run { self.projectGroups }

            for gi in updatedGroups.indices {
                for si in updatedGroups[gi].sessions.indices {
                    guard let path = updatedGroups[gi].sessions[si].fullPath else { continue }
                    let tail = Self.readTailMetadata(filePath: path)
                    updatedGroups[gi].sessions[si].customTitle = tail.customTitle
                    updatedGroups[gi].sessions[si].aiTitle = tail.aiTitle
                    updatedGroups[gi].sessions[si].tags = tail.tags.isEmpty ? nil : tail.tags
                    updatedGroups[gi].sessions[si].prLink = tail.prLink
                    updatedGroups[gi].sessions[si].lastPrompt = tail.lastPrompt
                    updatedGroups[gi].sessions[si].worktreeBranch = tail.worktreeBranch
                    updatedGroups[gi].sessions[si].sessionMode = tail.sessionMode
                }
            }

            await MainActor.run {
                self.projectGroups = updatedGroups
            }
        }
    }

    // MARK: - Phase G: Tail Metadata Reader

    /// Extract metadata from a JSONL session file using two-pass architecture.
    /// Pass 1: head+tail (first 1MB + last 1MB) for type-based entries (custom-title, last-prompt, etc.)
    /// Pass 2: full-file grep for isCompactSummary flag (compact summaries appear mid-file during long sessions).
    static func readTailMetadata(filePath: String) -> SessionTailMetadata {
        var meta = SessionTailMetadata()

        guard let handle = FileHandle(forReadingAtPath: filePath) else { return meta }
        defer { handle.closeFile() }

        // Metadata entries (custom-title, last-prompt, etc.) can appear anywhere
        // in the file — Claude Code writes them during the session, not just at EOF.
        // For files under 5MB: scan the full file (fast enough on modern SSDs).
        // For files over 5MB: scan from the start (up to 1MB for head metadata)
        // PLUS the last 1MB (for late-session metadata). This catches 95%+ of entries.
        let fileSize = handle.seekToEndOfFile()
        let fullScanLimit: UInt64 = 5_242_880  // 5MB
        handle.seek(toFileOffset: 0)

        var lines: [String] = []

        if fileSize <= fullScanLimit {
            // Small/medium file: read everything
            guard let data = try? handle.availableData,
                  let text = String(data: data, encoding: .utf8) else { return meta }
            lines = text.components(separatedBy: "\n")
        } else {
            // Large file: read first 1MB + last 1MB
            let regionSize: UInt64 = 1_048_576
            handle.seek(toFileOffset: 0)
            if let headData = try? handle.readData(ofLength: Int(regionSize)),
               let headText = String(data: headData, encoding: .utf8) {
                lines.append(contentsOf: headText.components(separatedBy: "\n"))
            }
            handle.seek(toFileOffset: fileSize - regionSize)
            if let tailData = try? handle.availableData,
               let tailText = String(data: tailData, encoding: .utf8) {
                lines.append(contentsOf: tailText.components(separatedBy: "\n"))
            }
        }
        for line in lines where !line.isEmpty {
            guard let lineData = line.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: lineData) as? [String: Any] else { continue }

            // Check for compact summaries — stored as isCompactSummary flag on user messages,
            // NOT as a separate entry type. These are LLM-generated session summaries.
            if json["isCompactSummary"] as? Bool == true {
                if let msg = json["message"] as? [String: Any],
                   let content = msg["content"] {
                    let text: String
                    if let s = content as? String {
                        text = s
                    } else if let blocks = content as? [[String: Any]] {
                        text = blocks.compactMap { $0["text"] as? String }.joined(separator: " ")
                    } else {
                        continue
                    }
                    if !text.isEmpty {
                        meta.compactionSummaries.append(text)
                    }
                }
                continue
            }

            // Detect entry type — Claude Code uses a "type" field for metadata entries
            guard let type = json["type"] as? String else { continue }

            switch type {
            // Kebab-case type names match actual Claude Code JSONL format
            case "custom-title":
                if let title = json["customTitle"] as? String, !title.isEmpty {
                    meta.customTitle = title
                }

            case "ai-title":
                if let title = json["aiTitle"] as? String, !title.isEmpty {
                    meta.aiTitle = title
                }

            case "tag":
                if let tag = json["tag"] as? String, !tag.isEmpty {
                    meta.tags.append(tag)
                }

            case "pr-link":
                if let link = json["link"] as? String ?? json["prLink"] as? String, !link.isEmpty {
                    meta.prLink = link
                }

            case "last-prompt":
                if let prompt = json["lastPrompt"] as? String, !prompt.isEmpty {
                    meta.lastPrompt = prompt
                }

            case "worktree-state":
                if let state = json["state"] as? [String: Any],
                   let branch = state["worktreeBranch"] as? String {
                    meta.worktreeBranch = branch
                } else if let branch = json["worktreeBranch"] as? String {
                    meta.worktreeBranch = branch
                }

            case "mode":
                if let mode = json["mode"] as? String {
                    meta.sessionMode = mode
                }

            case "agent-name":
                if meta.customTitle == nil,
                   let name = json["agentName"] as? String, !name.isEmpty {
                    meta.customTitle = name
                }

            case "file-history-snapshot":
                if let snapshot = json["snapshot"] as? [String: Any],
                   let backups = snapshot["trackedFileBackups"] as? [String: Any] {
                    for (path, info) in backups {
                        let version = (info as? [String: Any])?["version"] as? Int ?? 1
                        if let existing = meta.trackedFiles.firstIndex(where: { $0.path == path }) {
                            if version > meta.trackedFiles[existing].version {
                                meta.trackedFiles[existing] = (path, version)
                            }
                        } else {
                            meta.trackedFiles.append((path, version))
                        }
                    }
                }

            default:
                break
            }
        }

        // For large files, compact summaries appear mid-file (not just head/tail).
        // Do a targeted grep through the FULL file for isCompactSummary lines we missed.
        if fileSize > fullScanLimit {
            Self.extractCompactSummaries(filePath: filePath, existingCount: meta.compactionSummaries.count, into: &meta)
        }

        return meta
    }

    /// Scan the full file for isCompactSummary entries that the head+tail reader missed.
    /// Uses byte-level string search to avoid parsing every JSON line in large files.
    private static func extractCompactSummaries(filePath: String, existingCount: Int, into meta: inout SessionTailMetadata) {
        guard let handle = FileHandle(forReadingAtPath: filePath) else { return }
        defer { handle.closeFile() }

        let fileSize = handle.seekToEndOfFile()
        handle.seek(toFileOffset: 0)

        // The head+tail reader already covers first 1MB and last 1MB.
        // Scan the middle region for compact summaries only.
        let regionSize: UInt64 = 1_048_576
        let skipStart = regionSize
        let skipEnd = fileSize > regionSize ? fileSize - regionSize : fileSize

        guard skipEnd > skipStart else { return } // no middle region

        handle.seek(toFileOffset: skipStart)
        let needle = "\"isCompactSummary\":true".data(using: .utf8)!
        let chunkSize = 1_048_576 // read 1MB at a time
        var carryOver = Data() // leftover bytes from previous chunk (incomplete line)

        while handle.offsetInFile < skipEnd {
            let readSize = min(chunkSize, Int(skipEnd - handle.offsetInFile))
            let chunk = handle.readData(ofLength: readSize)
            guard !chunk.isEmpty else { break }

            var searchData = carryOver + chunk

            // Find all lines containing the needle in this chunk
            while let needleRange = searchData.range(of: needle) {
                // Find the line containing this match — search backward for newline
                let lineStart: Data.Index
                if let nlRange = searchData[searchData.startIndex..<needleRange.lowerBound]
                    .range(of: Data([0x0A]), options: .backwards) {
                    lineStart = searchData.index(after: nlRange.lowerBound)
                } else {
                    lineStart = searchData.startIndex
                }

                // Find line end
                let afterNeedle = needleRange.upperBound
                let lineEnd: Data.Index
                if let nlRange = searchData[afterNeedle...].range(of: Data([0x0A])) {
                    lineEnd = nlRange.lowerBound
                } else {
                    // Needle found but line not complete — will be in next chunk
                    break
                }

                // Parse the complete line
                let lineData = searchData[lineStart..<lineEnd]
                if let json = try? JSONSerialization.jsonObject(with: lineData) as? [String: Any],
                   json["isCompactSummary"] as? Bool == true,
                   let msg = json["message"] as? [String: Any],
                   let content = msg["content"] {
                    let text: String
                    if let s = content as? String {
                        text = s
                    } else if let blocks = content as? [[String: Any]] {
                        text = blocks.compactMap { $0["text"] as? String }.joined(separator: " ")
                    } else {
                        text = ""
                    }
                    if !text.isEmpty {
                        meta.compactionSummaries.append(text)
                    }
                }

                // Advance past this match
                searchData = Data(searchData[searchData.index(after: lineEnd)...])
            }

            // Keep the last incomplete line for next iteration
            if let lastNl = searchData.range(of: Data([0x0A]), options: .backwards) {
                carryOver = Data(searchData[searchData.index(after: lastNl.lowerBound)...])
            } else {
                carryOver = searchData
            }
        }
    }
}
