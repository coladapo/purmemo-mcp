import Foundation

enum MessageRole {
    case user
    case assistant
}

struct Message: Identifiable {
    let id = UUID()
    let role: MessageRole
    let content: String
    let timestamp: Date

    init(role: MessageRole, content: String) {
        self.role = role
        self.content = content
        self.timestamp = Date()
    }
}
