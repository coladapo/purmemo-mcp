import Foundation

// MARK: - Claude Desktop Agent Session

struct ClaudeDesktopSession: Identifiable {
    let id: String
    let filePath: String
    let fileSize: UInt64
    let modifiedDate: Date
    let firstPrompt: String?
    let messageCount: Int

    var displayTitle: String {
        if let prompt = firstPrompt, !prompt.isEmpty {
            return prompt.count <= 80 ? prompt : String(prompt.prefix(77)) + "..."
        }
        return "Agent session"
    }
}

// MARK: - Claude Desktop Scanner

@Observable
class ClaudeDesktopScanner {
    var sessions: [ClaudeDesktopSession] = []
    var isLoading = false
    var totalSize: UInt64 = 0
    var error: String?

    private static let agentSessionsPath: String = {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        return "\(home)/Library/Application Support/Claude/local-agent-mode-sessions"
    }()

    var isAvailable: Bool {
        FileManager.default.fileExists(atPath: Self.agentSessionsPath)
    }

    func scan() {
        guard isAvailable else {
            error = "Claude Desktop not installed"
            return
        }

        isLoading = true
        error = nil

        Task.detached {
            let fm = FileManager.default

            // Find all .jsonl files recursively — skip subagent files
            var jsonlFiles: [String] = []
            if let enumerator = fm.enumerator(atPath: Self.agentSessionsPath) {
                while let file = enumerator.nextObject() as? String {
                    if file.hasSuffix(".jsonl") && !file.contains("/subagents/") && !file.contains("agent-") {
                        jsonlFiles.append("\(Self.agentSessionsPath)/\(file)")
                    }
                }
            }

            var sessions: [ClaudeDesktopSession] = []
            var totalBytes: UInt64 = 0

            for path in jsonlFiles {
                guard let attrs = try? fm.attributesOfItem(atPath: path),
                      let size = attrs[.size] as? UInt64,
                      let mdate = attrs[.modificationDate] as? Date else { continue }

                totalBytes += size

                // Parse first few lines for metadata
                guard let handle = FileHandle(forReadingAtPath: path) else { continue }
                let chunk = handle.readData(ofLength: 32768)
                handle.closeFile()

                guard let text = String(data: chunk, encoding: .utf8) else { continue }
                let lines = text.components(separatedBy: "\n").filter { !$0.isEmpty }

                var firstPrompt: String?
                var userCount = 0
                var assistantCount = 0

                for line in lines {
                    guard let lineData = line.data(using: .utf8),
                          let json = try? JSONSerialization.jsonObject(with: lineData) as? [String: Any] else { continue }

                    let type = json["type"] as? String
                    if type == "user" || type == "human" {
                        userCount += 1
                        if firstPrompt == nil,
                           let message = json["message"] as? [String: Any] {
                            if let content = message["content"] as? String {
                                firstPrompt = content
                            } else if let blocks = message["content"] as? [[String: Any]] {
                                firstPrompt = blocks.compactMap { $0["text"] as? String }.joined(separator: " ")
                            }
                        }
                    } else if type == "assistant" {
                        assistantCount += 1
                    }
                }

                let sessionId = URL(fileURLWithPath: path).deletingPathExtension().lastPathComponent
                sessions.append(ClaudeDesktopSession(
                    id: sessionId,
                    filePath: path,
                    fileSize: size,
                    modifiedDate: mdate,
                    firstPrompt: firstPrompt,
                    messageCount: userCount + assistantCount
                ))
            }

            sessions.sort { $0.modifiedDate > $1.modifiedDate }

            await MainActor.run {
                self.sessions = sessions
                self.totalSize = totalBytes
                self.isLoading = false
            }
        }
    }
}
