import Foundation
import SQLite3

// MARK: - Cursor Composer Session

struct CursorComposerSession: Identifiable {
    let id: String
    let title: String?
    let createdAt: Date?
    let messageCount: Int
    let rawSize: Int

    var displayTitle: String {
        if let t = title, !t.isEmpty { return t }
        return "Composer session"
    }
}

// MARK: - Cursor Scanner

@Observable
class CursorScanner {
    var sessions: [CursorComposerSession] = []
    var isLoading = false
    var totalComposerKeys = 0
    var error: String?

    private static let dbPath: String = {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        return "\(home)/Library/Application Support/Cursor/User/globalStorage/state.vscdb"
    }()

    var isAvailable: Bool {
        FileManager.default.fileExists(atPath: Self.dbPath)
    }

    func scan() {
        guard isAvailable else {
            error = "Cursor not installed"
            return
        }

        isLoading = true
        error = nil

        Task.detached {
            var db: OpaquePointer?
            let flags = SQLITE_OPEN_READONLY | SQLITE_OPEN_NOMUTEX
            guard sqlite3_open_v2(Self.dbPath, &db, flags, nil) == SQLITE_OK, let db else {
                await MainActor.run {
                    self.error = "Cannot open Cursor database"
                    self.isLoading = false
                }
                return
            }
            defer { sqlite3_close(db) }

            var sessions: [CursorComposerSession] = []
            var totalKeys = 0

            // Count composer keys
            var countStmt: OpaquePointer?
            if sqlite3_prepare_v2(db, "SELECT COUNT(*) FROM cursorDiskKV WHERE key LIKE 'composerData:%'", -1, &countStmt, nil) == SQLITE_OK,
               let countStmt {
                if sqlite3_step(countStmt) == SQLITE_ROW {
                    totalKeys = Int(sqlite3_column_int64(countStmt, 0))
                }
                sqlite3_finalize(countStmt)
            }

            // Read composer sessions — key is "composerData:{uuid}", value is JSON blob
            let query = "SELECT key, value FROM cursorDiskKV WHERE key LIKE 'composerData:%' ORDER BY key"
            var stmt: OpaquePointer?
            guard sqlite3_prepare_v2(db, query, -1, &stmt, nil) == SQLITE_OK, let stmt else {
                await MainActor.run {
                    self.error = "Query failed"
                    self.isLoading = false
                }
                return
            }
            defer { sqlite3_finalize(stmt) }

            while sqlite3_step(stmt) == SQLITE_ROW {
                let key = String(cString: sqlite3_column_text(stmt, 0))
                let uuid = String(key.dropFirst("composerData:".count))

                // Value is a blob
                let blobSize = Int(sqlite3_column_bytes(stmt, 1))
                guard blobSize > 0,
                      let blobPtr = sqlite3_column_blob(stmt, 1) else { continue }

                let data = Data(bytes: blobPtr, count: blobSize)

                // Try to parse the JSON to extract title and message count
                var title: String?
                var messageCount = 0
                var createdAt: Date?

                if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    title = json["name"] as? String
                        ?? json["title"] as? String

                    // Count conversation turns
                    if let conversation = json["conversation"] as? [[String: Any]] {
                        messageCount = conversation.count
                    } else if let messages = json["messages"] as? [[String: Any]] {
                        messageCount = messages.count
                    } else if let richText = json["richText"] as? [[String: Any]] {
                        messageCount = richText.count
                    }

                    // Try to find a timestamp
                    if let ts = json["createdAt"] as? Double {
                        createdAt = Date(timeIntervalSince1970: ts / 1000)
                    } else if let ts = json["timestamp"] as? Double {
                        createdAt = Date(timeIntervalSince1970: ts / 1000)
                    }

                    // If no title, try to extract from first user message
                    if title == nil || title?.isEmpty == true {
                        if let conversation = json["conversation"] as? [[String: Any]],
                           let first = conversation.first(where: { ($0["role"] as? String) == "user" }),
                           let content = first["content"] as? String {
                            title = content.count <= 80 ? content : String(content.prefix(77)) + "..."
                        }
                    }
                }

                sessions.append(CursorComposerSession(
                    id: uuid,
                    title: title,
                    createdAt: createdAt,
                    messageCount: messageCount,
                    rawSize: blobSize
                ))
            }

            await MainActor.run {
                self.sessions = sessions
                self.totalComposerKeys = totalKeys
                self.isLoading = false
            }
        }
    }
}
