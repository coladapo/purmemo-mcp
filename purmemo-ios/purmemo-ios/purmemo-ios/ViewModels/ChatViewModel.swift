import Foundation
import Observation

// Simple intent detection — determines save vs recall
private func detectIntent(_ text: String) -> ChatIntent {
    let lower = text.lowercased()
    let saveSignals = ["save", "remember", "note", "store", "log", "keep this", "add this"]
    let recallSignals = ["what do i know", "recall", "find", "search", "tell me about",
                        "what is", "show me", "look up", "prep me", "what have i"]

    if saveSignals.contains(where: { lower.hasPrefix($0) || lower.contains($0) }) {
        return .save
    }
    if recallSignals.contains(where: { lower.hasPrefix($0) || lower.contains($0) }) {
        return .recall
    }
    // Default: recall (search is more common than save from chat)
    return .recall
}

enum ChatIntent {
    case save
    case recall
}

@Observable
class ChatViewModel {
    var messages: [Message] = []
    var isLoading = false
    var errorMessage: String?

    private let api: PurmemoAPI

    init(authService: AuthService) {
        self.api = PurmemoAPI(authService: authService)
        addWelcomeMessage()
    }

    private func addWelcomeMessage() {
        messages.append(Message(
            role: .assistant,
            content: "Your memory is ready. Save a thought, recall context, or ask what you know."
        ))
    }

    func send(_ text: String) async {
        guard !text.trimmingCharacters(in: .whitespaces).isEmpty else { return }

        await MainActor.run {
            self.messages.append(Message(role: .user, content: text))
            self.isLoading = true
            self.errorMessage = nil
        }

        let intent = detectIntent(text)

        do {
            switch intent {
            case .save:
                let response = try await api.saveMemory(content: text)
                _ = response
                await MainActor.run {
                    self.messages.append(Message(role: .assistant, content: "Saved to your memory."))
                }

            case .recall:
                let response = try await api.recall(query: text)
                let reply = self.formatRecallResponse(response)
                await MainActor.run {
                    self.messages.append(Message(role: .assistant, content: reply))
                }
            }
        } catch {
            let errMsg = error.localizedDescription
            await MainActor.run {
                self.errorMessage = errMsg
                self.messages.append(Message(role: .assistant, content: "Something went wrong. \(errMsg)"))
            }
        }

        await MainActor.run { self.isLoading = false }
    }

    private func formatRecallResponse(_ response: RecallResponse) -> String {
        guard !response.memories.isEmpty else {
            return "Nothing saved about that yet. Want to add something?"
        }

        let count = response.memories.count
        let top = response.memories.prefix(5)
        let formatted = top.enumerated().map { index, memory in
            let title = memory.title ?? "Untitled"
            let snippet = Self.cleanSnippet(memory.content)
            // Title-only if snippet is empty or same as title
            if snippet.isEmpty || snippet.lowercased() == title.lowercased() {
                return "  \(index + 1). \(title)"
            }
            return "  \(index + 1). \(title)\n     \(snippet)"
        }.joined(separator: "\n\n")

        let header = "Found \(count) memor\(count == 1 ? "y" : "ies"):\n\n"
        let more = count > 5 ? "\n\n  +\(count - 5) more saved" : ""
        return header + formatted + more
    }

    private static func cleanSnippet(_ content: String) -> String {
        let noisePrefix = [
            "===", "---", "```", "USER", "ASSISTANT", "New project",
            "[Purmemo", "CONVERSATION START", "CONVERSATION END",
            "Part ", "This block", "Block ", "chunk_",
            "Human:", "System:", "Context:", "Summary:",
            "Co-Authored-By:", "import ", "function ", "const ",
            "##", "**", "<!-", "<!--", "{\"", "[{",
            "SESSION CONTEXT", "SESSION_CONTEXT", "Continuation from",
            "[Screenshot", "[Image", "[screenshot", "- Total Parts",
            "- Index", "Total Parts:", "Source:", "Tags:",
            "Status:", "Date:", "Platform:", "Updated:",
            "Created:", "Modified:", "Metadata:", "Properties:",
        ]
        let noiseContains = [
            "CONVERSATION START", "CONVERSATION END", "session.",
            "embed-on-type", "chunk_", "Total Parts",
        ]
        let lines = content
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { line in
                guard line.count > 12 else { return false }
                guard !line.hasPrefix("[20") else { return false }
                guard !line.hasPrefix("User:") else { return false }
                guard !line.hasPrefix("Assistant:") else { return false }
                guard !line.hasPrefix("user:") else { return false }
                guard !line.hasPrefix("assistant:") else { return false }
                guard !line.hasPrefix("- ") else { return false }  // metadata list items
                guard !noisePrefix.contains(where: { line.hasPrefix($0) }) else { return false }
                guard !noiseContains.contains(where: { line.contains($0) }) else { return false }
                return true
            }
        guard let best = lines.first, !best.isEmpty else { return "" }
        let truncated = String(best.prefix(80))
        return truncated + (best.count > 80 ? "…" : "")
    }
}
