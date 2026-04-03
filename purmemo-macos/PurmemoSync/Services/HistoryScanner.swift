import Foundation

// MARK: - History Entry

struct HistoryEntry: Identifiable, Codable {
    let display: String
    let timestamp: Double
    let project: String
    let sessionId: String?
    let pastedContents: [PastedContent]?

    enum CodingKeys: String, CodingKey {
        case display, timestamp, project, sessionId, pastedContents
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        display = try container.decode(String.self, forKey: .display)
        timestamp = try container.decode(Double.self, forKey: .timestamp)
        project = (try? container.decode(String.self, forKey: .project)) ?? ""
        sessionId = try? container.decode(String.self, forKey: .sessionId)

        // pastedContents is a dict {"1": {id, type, content}, "2": ...} — convert to sorted array
        if let dict = try? container.decode([String: PastedContent].self, forKey: .pastedContents) {
            pastedContents = dict.sorted { ($0.key.intValue) < ($1.key.intValue) }.map(\.value)
        } else {
            pastedContents = nil
        }
    }

    var id: String { "\(timestamp)-\(display.prefix(20))" }

    var date: Date {
        Date(timeIntervalSince1970: timestamp / 1000)
    }

    var projectName: String {
        let components = project.split(separator: "/")
        for component in components.reversed() {
            let name = String(component)
            if !["active", "____active", "puo-jects", "Users", "wivak", "Library", "CloudStorage", "Dropbox", "home"].contains(name) {
                return name
            }
        }
        return components.last.map(String.init) ?? "Unknown"
    }

    var displayText: String {
        if display.count <= 120 { return display }
        return String(display.prefix(117)) + "..."
    }

    var isImageOrPaste: Bool {
        display.hasPrefix("[Image") || display.hasPrefix("[Pasted text")
    }

    /// True if this entry has pasted content that can be expanded
    var hasPastedContent: Bool {
        guard let pasted = pastedContents, !pasted.isEmpty else { return false }
        return pasted.contains { !$0.content.isEmpty }
    }

    /// Preview of pasted content (first 200 chars of first paste)
    var pastedPreview: String? {
        guard let first = pastedContents?.first(where: { !$0.content.isEmpty }) else { return nil }
        let content = first.content
        if content.count <= 200 { return content }
        return String(content.prefix(197)) + "..."
    }

    /// Total lines across all pasted content
    var pastedLineCount: Int {
        pastedContents?.reduce(0) { $0 + $1.content.components(separatedBy: "\n").count } ?? 0
    }
}

/// Represents pasted content in a history entry
/// Format in history.jsonl: {"id": 1, "type": "text", "content": "..."}
struct PastedContent: Codable, Identifiable {
    let pasteId: Int?
    let content: String
    let type: String?

    var id: String { "\(pasteId ?? 0)-\(content.prefix(30))" }

    enum CodingKeys: String, CodingKey {
        case pasteId = "id"
        case content, type
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.pasteId = try? container.decode(Int.self, forKey: .pasteId)
        self.content = (try? container.decode(String.self, forKey: .content)) ?? ""
        self.type = try? container.decode(String.self, forKey: .type)
    }
}

private extension String {
    var intValue: Int { Int(self) ?? 0 }
}

// MARK: - Month Group

struct MonthGroup: Identifiable {
    let month: String // "2025-10"
    let displayMonth: String // "October 2025"
    let entries: [HistoryEntry]

    var id: String { month }
}

// MARK: - History Scanner

@Observable
class HistoryScanner {
    var entries: [HistoryEntry] = []
    var monthGroups: [MonthGroup] = []
    var isLoading = true
    var totalCount = 0
    var oldestDate: Date?
    var projectNames: [String] = []
    var error: String?

    private static let historyPath: String = {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        return "\(home)/.claude/history.jsonl"
    }()

    func load() {
        isLoading = true
        error = nil

        Task.detached {
            let fm = FileManager.default
            guard fm.fileExists(atPath: Self.historyPath) else {
                await MainActor.run {
                    self.error = "history.jsonl not found"
                    self.isLoading = false
                }
                return
            }

            guard let data = fm.contents(atPath: Self.historyPath),
                  let text = String(data: data, encoding: .utf8) else {
                await MainActor.run {
                    self.error = "Cannot read history.jsonl"
                    self.isLoading = false
                }
                return
            }

            let decoder = JSONDecoder()
            var parsed: [HistoryEntry] = []

            for line in text.components(separatedBy: "\n") where !line.isEmpty {
                guard let lineData = line.data(using: .utf8),
                      let entry = try? decoder.decode(HistoryEntry.self, from: lineData) else { continue }
                parsed.append(entry)
            }

            // Sort newest first
            parsed.sort { $0.timestamp > $1.timestamp }

            // Group by month
            let dateFormatter = DateFormatter()
            dateFormatter.dateFormat = "yyyy-MM"
            let displayFormatter = DateFormatter()
            displayFormatter.dateFormat = "MMMM yyyy"

            let grouped = Dictionary(grouping: parsed) { entry -> String in
                dateFormatter.string(from: entry.date)
            }

            let groups = grouped.map { month, entries in
                let displayMonth = displayFormatter.string(from: entries[0].date)
                return MonthGroup(
                    month: month,
                    displayMonth: displayMonth,
                    entries: entries.sorted { $0.timestamp > $1.timestamp }
                )
            }
            .sorted { $0.month > $1.month }

            // Unique project names sorted by frequency
            let projectCounts = Dictionary(grouping: parsed) { $0.projectName }
                .mapValues { $0.count }
            let sortedProjects = projectCounts.sorted { $0.value > $1.value }.map(\.key)

            let oldest = parsed.last?.date
            let total = parsed.count

            await MainActor.run {
                self.entries = parsed
                self.monthGroups = groups
                self.totalCount = total
                self.oldestDate = oldest
                self.projectNames = sortedProjects
                self.isLoading = false
            }
        }
    }
}
