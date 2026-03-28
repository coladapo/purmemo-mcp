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
