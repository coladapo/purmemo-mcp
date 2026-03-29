import Foundation

struct SaveMemoryRequest: Encodable {
    let content: String
    let source_type: String = "mobile_ios"
}

struct SaveMemoryResponse: Codable {
    let id: String
    let content: String
    let created_at: String
}

struct RecallMemory: Codable, Identifiable, Hashable {
    let id: String
    let title: String?
    let content: String
    let score: Double?
    let created_at: String?

    func hash(into hasher: inout Hasher) { hasher.combine(id) }
    static func == (lhs: RecallMemory, rhs: RecallMemory) -> Bool { lhs.id == rhs.id }
}

struct RecallResponse: Codable {
    let memories: [RecallMemory]
    let query: String?
}

// MARK: - Projects Intelligence

struct ProjectsSummary {
    let projects: [ProjectItem]
    let workItems: [WorkItem]
    let completions: [CompletionItem]
    let blockers: [BlockerItem]
}

struct ProjectItem: Identifiable {
    let name: String
    let memoryCount: Int
    let openItems: Int
    let blockerCount: Int
    let lastActivity: String?

    var id: String { name }
}

struct WorkItem: Identifiable {
    let memoryId: String
    let memoryTitle: String?
    let projectName: String?
    let text: String
    let type: String      // task, bug, feature, decision, question
    let priority: String  // urgent, high, medium, low
    let deadline: String?

    var id: String { "\(memoryId)-\(text.prefix(20))" }

    var typeIcon: String {
        switch type {
        case "bug": return "ladybug"
        case "feature": return "sparkles"
        case "decision": return "arrow.triangle.branch"
        case "question": return "questionmark.circle"
        default: return "checklist"
        }
    }

    var priorityColor: String {
        switch priority {
        case "urgent": return "#FF3B30"
        case "high": return "#FF9500"
        case "medium": return "#E7FC44"
        default: return "#8E8E93"
        }
    }
}

struct CompletionItem: Identifiable {
    let memoryId: String
    let memoryTitle: String?
    let projectName: String?
    let text: String
    let createdAt: String?

    var id: String { "\(memoryId)-\(text.prefix(20))" }
}

struct BlockerItem: Identifiable {
    let memoryId: String
    let memoryTitle: String?
    let projectName: String?
    let text: String
    let severity: String  // critical, major, minor
    let blockingCause: String?

    var id: String { "\(memoryId)-\(text.prefix(20))" }

    var severityColor: String {
        switch severity {
        case "critical": return "#FF3B30"
        case "major": return "#FF9500"
        default: return "#8E8E93"
        }
    }
}

struct FullMemory: Codable {
    let id: String
    let title: String?
    let content: String?
    let created_at: String?
    let updated_at: String?
    let source_type: String?
    let platform: String?
    let tags: [String]?
}
