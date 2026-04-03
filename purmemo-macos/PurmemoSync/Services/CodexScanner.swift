import Foundation
import SQLite3

// MARK: - Codex Thread

struct CodexThread: Identifiable {
    let id: String
    let title: String
    let cwd: String
    let gitBranch: String?
    let model: String?
    let tokensUsed: Int
    let createdAt: Date
    let updatedAt: Date
    let firstUserMessage: String?
    let archived: Bool

    var projectName: String {
        let components = cwd.split(separator: "/")
        for component in components.reversed() {
            let name = String(component)
            if !["active", "____active", "puo-jects", "Users", "wivak", "Library", "home"].contains(name) {
                return name
            }
        }
        return components.last.map(String.init) ?? "Unknown"
    }

    var displayTitle: String {
        if !title.isEmpty { return title }
        if let msg = firstUserMessage, !msg.isEmpty {
            return msg.count <= 80 ? msg : String(msg.prefix(77)) + "..."
        }
        return "Untitled thread"
    }
}

// MARK: - Codex Scanner

@Observable
class CodexScanner {
    var threads: [CodexThread] = []
    var isLoading = false
    var totalLogs = 0
    var error: String?

    private static let statePath: String = {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        return "\(home)/.codex/state_5.sqlite"
    }()

    private static let logsPath: String = {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        return "\(home)/.codex/logs_1.sqlite"
    }()

    var isAvailable: Bool {
        FileManager.default.fileExists(atPath: Self.statePath)
    }

    func scan() {
        guard isAvailable else {
            error = "Codex not installed"
            return
        }

        isLoading = true
        error = nil

        Task.detached {
            var db: OpaquePointer?
            // Open in read-only mode with WAL support
            let flags = SQLITE_OPEN_READONLY | SQLITE_OPEN_NOMUTEX
            guard sqlite3_open_v2(Self.statePath, &db, flags, nil) == SQLITE_OK, let db else {
                await MainActor.run {
                    self.error = "Cannot open Codex database"
                    self.isLoading = false
                }
                return
            }
            defer { sqlite3_close(db) }

            var threads: [CodexThread] = []
            let query = """
                SELECT id, title, cwd, git_branch, model, tokens_used,
                       created_at, updated_at, first_user_message, archived
                FROM threads
                ORDER BY updated_at DESC
            """

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
                let id = String(cString: sqlite3_column_text(stmt, 0))
                let title = String(cString: sqlite3_column_text(stmt, 1))
                let cwd = String(cString: sqlite3_column_text(stmt, 2))
                let gitBranch = sqlite3_column_type(stmt, 3) != SQLITE_NULL
                    ? String(cString: sqlite3_column_text(stmt, 3)) : nil
                let model = sqlite3_column_type(stmt, 4) != SQLITE_NULL
                    ? String(cString: sqlite3_column_text(stmt, 4)) : nil
                let tokensUsed = Int(sqlite3_column_int64(stmt, 5))
                // Codex stores timestamps in seconds (not milliseconds)
                let createdAt = Date(timeIntervalSince1970: Double(sqlite3_column_int64(stmt, 6)))
                let updatedAt = Date(timeIntervalSince1970: Double(sqlite3_column_int64(stmt, 7)))
                let firstMsg = sqlite3_column_type(stmt, 8) != SQLITE_NULL
                    ? String(cString: sqlite3_column_text(stmt, 8)) : nil
                let archived = sqlite3_column_int(stmt, 9) != 0

                threads.append(CodexThread(
                    id: id, title: title, cwd: cwd, gitBranch: gitBranch,
                    model: model, tokensUsed: tokensUsed,
                    createdAt: createdAt, updatedAt: updatedAt,
                    firstUserMessage: firstMsg, archived: archived
                ))
            }

            // Also get total log count
            var logCount = 0
            var logStmt: OpaquePointer?
            if sqlite3_open_v2(Self.logsPath, &logStmt, flags, nil) == SQLITE_OK, let logDb = logStmt {
                var countStmt: OpaquePointer?
                if sqlite3_prepare_v2(logDb, "SELECT COUNT(*) FROM logs", -1, &countStmt, nil) == SQLITE_OK,
                   let countStmt {
                    if sqlite3_step(countStmt) == SQLITE_ROW {
                        logCount = Int(sqlite3_column_int64(countStmt, 0))
                    }
                    sqlite3_finalize(countStmt)
                }
                sqlite3_close(logDb)
            }

            await MainActor.run {
                self.threads = threads
                self.totalLogs = logCount
                self.isLoading = false
            }
        }
    }
}
