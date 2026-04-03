import Foundation

// MARK: - Gemini CLI Session

struct GeminiSession: Identifiable {
    let id: String          // sessionId from JSON
    let filePath: String    // full path to session JSON file
    let fileSize: UInt64
    let modifiedDate: Date
    let startTime: Date?
    let project: String     // derived from parent directory name
    let firstPrompt: String?
    let messageCount: Int
    let userCount: Int
    let geminiCount: Int
    let model: String?
    let totalTokens: Int

    var displayTitle: String {
        if let prompt = firstPrompt, !prompt.isEmpty {
            let text = prompt.count <= 80 ? prompt : String(prompt.prefix(77)) + "..."
            return text.components(separatedBy: "\n").first ?? text
        }
        return "Gemini session"
    }
}

// MARK: - Gemini CLI Scanner

/// Scans ~/.gemini/tmp/*/chats/session-*.json for Gemini CLI conversations.
/// Format: JSON with { sessionId, projectHash, startTime, lastUpdated, messages[], kind? }
/// Messages: { id, timestamp, type: "user"|"gemini", content, thoughts?, tokens?, model?, toolCalls? }
@Observable
class GeminiScanner {
    var sessions: [GeminiSession] = []
    var isLoading = false
    var totalSize: UInt64 = 0
    var error: String?

    private static let geminiTmpPath: String = {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        return "\(home)/.gemini/tmp"
    }()

    var isAvailable: Bool {
        FileManager.default.fileExists(atPath: Self.geminiTmpPath)
    }

    var sessionCount: Int { sessions.count }

    func scan() {
        guard isAvailable else {
            error = "Gemini CLI not installed"
            return
        }

        isLoading = true
        error = nil

        Task.detached {
            let fm = FileManager.default

            // Find all session-*.json files under ~/.gemini/tmp/*/chats/
            var jsonFiles: [(path: String, project: String)] = []
            guard let projectDirs = try? fm.contentsOfDirectory(atPath: Self.geminiTmpPath) else {
                await MainActor.run {
                    self.isLoading = false
                    self.error = "Cannot read ~/.gemini/tmp/"
                }
                return
            }

            for projectDir in projectDirs {
                let chatsPath = "\(Self.geminiTmpPath)/\(projectDir)/chats"
                guard let chatFiles = try? fm.contentsOfDirectory(atPath: chatsPath) else { continue }

                for file in chatFiles {
                    guard file.hasPrefix("session-") && file.hasSuffix(".json") else { continue }
                    jsonFiles.append((
                        path: "\(chatsPath)/\(file)",
                        project: projectDir
                    ))
                }
            }

            var scanned: [GeminiSession] = []
            var totalBytes: UInt64 = 0

            for entry in jsonFiles {
                guard let attrs = try? fm.attributesOfItem(atPath: entry.path),
                      let size = attrs[.size] as? UInt64,
                      let mdate = attrs[.modificationDate] as? Date else { continue }

                totalBytes += size

                // Parse JSON — read up to 512KB for metadata extraction
                let readLimit = min(size, 524_288)
                guard let handle = FileHandle(forReadingAtPath: entry.path) else { continue }
                let data = handle.readData(ofLength: Int(readLimit))
                handle.closeFile()

                // For files within limit, parse as full JSON
                // For larger files, we'll get truncated JSON — extract what we can
                var sessionId: String?
                var startTime: Date?
                var firstPrompt: String?
                var userCount = 0
                var geminiCount = 0
                var model: String?
                var totalTokens = 0

                if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    sessionId = json["sessionId"] as? String

                    if let st = json["startTime"] as? String {
                        startTime = Self.parseISO8601(st)
                    }

                    if let messages = json["messages"] as? [[String: Any]] {
                        for msg in messages {
                            let type = msg["type"] as? String
                            if type == "user" {
                                userCount += 1
                                if firstPrompt == nil {
                                    firstPrompt = Self.extractText(from: msg["content"])
                                }
                            } else if type == "gemini" {
                                geminiCount += 1
                                if model == nil, let m = msg["model"] as? String {
                                    model = m
                                }
                                if let tokens = msg["tokens"] as? Int {
                                    totalTokens += tokens
                                }
                            }
                        }
                    }
                }

                // Derive a clean project name from directory
                let projectName = Self.cleanProjectName(entry.project)

                scanned.append(GeminiSession(
                    id: sessionId ?? UUID().uuidString,
                    filePath: entry.path,
                    fileSize: size,
                    modifiedDate: mdate,
                    startTime: startTime,
                    project: projectName,
                    firstPrompt: firstPrompt,
                    messageCount: userCount + geminiCount,
                    userCount: userCount,
                    geminiCount: geminiCount,
                    model: model,
                    totalTokens: totalTokens
                ))
            }

            scanned.sort { $0.modifiedDate > $1.modifiedDate }

            await MainActor.run {
                self.sessions = scanned
                self.totalSize = totalBytes
                self.isLoading = false
                if scanned.isEmpty && jsonFiles.isEmpty {
                    self.error = "No sessions found"
                }
            }
        }
    }

    // MARK: - Helpers

    /// Extract text content from Gemini message content (string or array of blocks)
    private static func extractText(from content: Any?) -> String? {
        if let text = content as? String {
            return text
        }
        if let blocks = content as? [[String: Any]] {
            let texts = blocks.compactMap { block -> String? in
                if let text = block["text"] as? String { return text }
                return nil
            }
            let joined = texts.joined(separator: " ")
            return joined.isEmpty ? nil : joined
        }
        return nil
    }

    /// Clean up project directory name — hash-named dirs stay as-is,
    /// human-readable names get returned directly
    private static func cleanProjectName(_ dirName: String) -> String {
        // If it's a 64-char hex hash (SHA-256), show "unknown project"
        if dirName.count == 64, dirName.allSatisfy({ $0.isHexDigit }) {
            return "unknown project"
        }
        return dirName
    }

    private static let iso8601Formatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let iso8601FallbackFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    private static func parseISO8601(_ string: String) -> Date? {
        iso8601Formatter.date(from: string) ?? iso8601FallbackFormatter.date(from: string)
    }
}
