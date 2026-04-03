import SwiftUI

// MARK: - Conversation Models

/// A single message bubble in a conversation
struct ConversationMessage: Identifiable {
    let id: String
    let role: MessageRole
    let text: String
    let timestamp: Date?
    let model: String?
    let toolCalls: [ToolCall]
    let toolResults: [ToolResult]

    enum MessageRole: String {
        case user, assistant, system, queued
    }

    struct ToolCall {
        let name: String
        let id: String
    }

    struct ToolResult: Identifiable {
        let toolUseId: String
        let content: String
        var id: String { toolUseId }
    }
}

// MARK: - JSONL Parser

/// Parses a Claude Code JSONL session file into displayable conversation messages
struct SessionParser {
    static func parse(filePath: String) -> [ConversationMessage] {
        guard let handle = FileHandle(forReadingAtPath: filePath) else { return [] }
        defer { handle.closeFile() }

        let data = handle.availableData
        guard let text = String(data: data, encoding: .utf8) else { return [] }

        var messages: [ConversationMessage] = []
        var toolResultMap: [String: String] = [:]  // toolUseId → result content
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        // Two-pass: first collect tool results, then build messages
        for line in text.components(separatedBy: "\n") where !line.isEmpty {
            guard let lineData = line.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: lineData) as? [String: Any],
                  json["type"] as? String == "user",
                  let message = json["message"] as? [String: Any],
                  let blocks = message["content"] as? [[String: Any]] else { continue }

            for block in blocks {
                guard block["type"] as? String == "tool_result",
                      let toolUseId = block["tool_use_id"] as? String else { continue }

                // Extract result content (can be string or array of blocks)
                let content = block["content"]
                if let str = content as? String {
                    toolResultMap[toolUseId] = str
                } else if let arr = content as? [[String: Any]] {
                    let text = arr.compactMap { $0["text"] as? String }.joined(separator: "\n")
                    if !text.isEmpty { toolResultMap[toolUseId] = text }
                }
            }
        }

        // Second pass: build conversation messages
        for line in text.components(separatedBy: "\n") where !line.isEmpty {
            guard let lineData = line.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: lineData) as? [String: Any] else { continue }

            guard let type = json["type"] as? String else { continue }

            let timestamp: Date? = (json["timestamp"] as? String).flatMap { isoFormatter.date(from: $0) }
            let uuid = json["uuid"] as? String ?? UUID().uuidString

            if type == "user" {
                guard let message = json["message"] as? [String: Any] else { continue }
                let content = extractContent(from: message)
                guard !content.isEmpty else { continue }
                messages.append(ConversationMessage(
                    id: uuid,
                    role: .user,
                    text: content,
                    timestamp: timestamp,
                    model: nil,
                    toolCalls: [],
                    toolResults: []
                ))
            } else if type == "queue-operation" {
                if let content = json["content"] as? String, !content.isEmpty {
                    let op = json["operation"] as? String ?? "enqueue"
                    if op == "enqueue" {
                        messages.append(ConversationMessage(
                            id: uuid,
                            role: .queued,
                            text: content,
                            timestamp: timestamp,
                            model: nil,
                            toolCalls: [],
                            toolResults: []
                        ))
                    }
                }
            } else if type == "assistant" {
                guard let message = json["message"] as? [String: Any] else { continue }
                let content = message["content"]
                var text = ""
                var toolCalls: [ConversationMessage.ToolCall] = []
                var toolResults: [ConversationMessage.ToolResult] = []

                if let blocks = content as? [[String: Any]] {
                    for block in blocks {
                        let blockType = block["type"] as? String
                        if blockType == "text", let t = block["text"] as? String {
                            if !text.isEmpty { text += "\n\n" }
                            text += t
                        } else if blockType == "tool_use" {
                            let name = block["name"] as? String ?? "tool"
                            let toolId = block["id"] as? String ?? ""
                            toolCalls.append(.init(name: name, id: toolId))
                            // Attach the result if we have it
                            if let result = toolResultMap[toolId] {
                                let preview = result.count > 500 ? String(result.prefix(497)) + "..." : result
                                toolResults.append(.init(toolUseId: toolId, content: preview))
                            }
                        }
                    }
                } else if let str = content as? String {
                    text = str
                }

                guard !text.isEmpty || !toolCalls.isEmpty else { continue }
                let model = message["model"] as? String
                messages.append(ConversationMessage(
                    id: uuid,
                    role: .assistant,
                    text: text,
                    timestamp: timestamp,
                    model: model,
                    toolCalls: toolCalls,
                    toolResults: toolResults
                ))
            }
        }

        return messages
    }

    private static func extractContent(from message: [String: Any]) -> String {
        let content = message["content"]
        if let str = content as? String {
            return str
        } else if let blocks = content as? [[String: Any]] {
            return blocks.compactMap { block -> String? in
                if block["type"] as? String == "text" {
                    return block["text"] as? String
                }
                return nil
            }.joined(separator: "\n\n")
        }
        return ""
    }
}

// MARK: - Session Detail View

struct SessionDetailView: View {
    let session: SessionEntry
    let onBack: () -> Void

    @State private var messages: [ConversationMessage] = []
    @State private var isLoading = true
    @State private var searchText = ""
    @State private var trackedFiles: [(path: String, version: Int)] = []
    @State private var summaries: [String] = []
    @State private var showingFiles = false
    @State private var showingSummary = false
    @State private var expandedTools: Set<String> = []  // Track which tool results are expanded

    private let accent = Color(red: 0.906, green: 0.988, blue: 0.267) // #E7FC44
    private let cardBg = Color(red: 0.102, green: 0.102, blue: 0.102)

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider().opacity(0.2)

            // Phase K: Files Changed section (collapsible)
            if !trackedFiles.isEmpty {
                filesSection
            }

            // Session Intelligence (from compact summaries)
            if !summaries.isEmpty {
                intelligenceSection
            }

            if isLoading {
                Spacer()
                ProgressView("Loading conversation...")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                Spacer()
            } else if messages.isEmpty {
                emptyState
            } else {
                conversationList
            }
        }
        .onAppear { loadConversation() }
    }

    // MARK: - Header

    private var header: some View {
        VStack(spacing: 6) {
            HStack(spacing: 8) {
                Button(action: onBack) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(accent)
                }
                .buttonStyle(.plain)

                VStack(alignment: .leading, spacing: 2) {
                    Text(session.displayPrompt)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(.white)
                        .lineLimit(2)

                    HStack(spacing: 6) {
                        Text(session.projectName)
                            .font(.system(size: 10, weight: .medium))
                            .foregroundStyle(accent)

                        if let branch = session.gitBranch, branch != "main" {
                            Label(branch, systemImage: "arrow.triangle.branch")
                                .font(.system(size: 10))
                                .foregroundStyle(.tertiary)
                        }

                        Text("\(messages.count) messages")
                            .font(.system(size: 10))
                            .foregroundStyle(.tertiary)

                        if session.sessionMode == "coordinator" {
                            Text("coordinator")
                                .font(.system(size: 9, weight: .medium, design: .monospaced))
                                .foregroundStyle(.orange)
                        }
                    }

                    // Phase G: Tags row
                    if let tags = session.tags, !tags.isEmpty {
                        HStack(spacing: 4) {
                            ForEach(tags, id: \.self) { tag in
                                Text(tag)
                                    .font(.system(size: 9, weight: .medium))
                                    .foregroundStyle(accent)
                                    .padding(.horizontal, 5)
                                    .padding(.vertical, 2)
                                    .background(accent.opacity(0.1))
                                    .cornerRadius(4)
                            }
                        }
                    }

                    // Phase G: PR link
                    if let pr = session.prLink, !pr.isEmpty {
                        HStack(spacing: 4) {
                            Image(systemName: "arrow.triangle.pull")
                                .font(.system(size: 9))
                            Text(pr.components(separatedBy: "/").suffix(2).joined(separator: "/"))
                                .font(.system(size: 10, design: .monospaced))
                                .lineLimit(1)
                        }
                        .foregroundStyle(accent.opacity(0.8))
                    }
                }

                Spacer()
            }

            // Search bar
            if !messages.isEmpty {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 11))
                        .foregroundStyle(.tertiary)
                    TextField("Search conversation...", text: $searchText)
                        .textFieldStyle(.plain)
                        .font(.system(size: 12))
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(cardBg)
                .cornerRadius(6)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    // MARK: - Conversation

    private var conversationList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 8) {
                    ForEach(filteredMessages) { message in
                        messageBubble(message)
                            .id(message.id)
                    }
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
            }
        }
    }

    @ViewBuilder
    private func messageBubble(_ message: ConversationMessage) -> some View {
        let isUserSide = message.role == .user || message.role == .queued

        VStack(alignment: isUserSide ? .trailing : .leading, spacing: 4) {
            // Role label
            HStack(spacing: 4) {
                if isUserSide {
                    Spacer()
                }

                Text(message.role == .queued ? "You (queued)" : message.role == .user ? "You" : "Claude")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(message.role == .queued ? .orange : message.role == .user ? accent : .secondary)

                if let model = message.model {
                    Text(formatModel(model))
                        .font(.system(size: 9))
                        .foregroundStyle(.quaternary)
                }

                if let ts = message.timestamp {
                    Text(formatTime(ts))
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundStyle(.quaternary)
                }

                if !isUserSide {
                    Spacer()
                }
            }

            // Message content
            if !message.text.isEmpty {
                Text(highlightedText(message.text))
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(message.role == .queued ? 0.7 : 0.9))
                    .textSelection(.enabled)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .frame(maxWidth: .infinity, alignment: isUserSide ? .trailing : .leading)
                    .background(
                        message.role == .queued
                            ? Color.orange.opacity(0.1)
                            : isUserSide
                                ? accent.opacity(0.12)
                                : cardBg
                    )
                    .cornerRadius(10)
            }

            // Tool calls — tappable with expandable results
            if !message.toolCalls.isEmpty {
                VStack(alignment: .leading, spacing: 3) {
                    ForEach(message.toolCalls, id: \.id) { tool in
                        let hasResult = message.toolResults.contains { $0.toolUseId == tool.id }
                        let isExpanded = expandedTools.contains(tool.id)

                        VStack(alignment: .leading, spacing: 0) {
                            Button {
                                if hasResult {
                                    withAnimation(.easeInOut(duration: 0.15)) {
                                        if isExpanded {
                                            expandedTools.remove(tool.id)
                                        } else {
                                            expandedTools.insert(tool.id)
                                        }
                                    }
                                }
                            } label: {
                                HStack(spacing: 4) {
                                    Image(systemName: "wrench.and.screwdriver")
                                        .font(.system(size: 9))
                                        .foregroundStyle(.tertiary)
                                    Text(tool.name)
                                        .font(.system(size: 10, design: .monospaced))
                                        .foregroundStyle(.tertiary)
                                    if hasResult {
                                        Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                                            .font(.system(size: 8))
                                            .foregroundStyle(accent.opacity(0.5))
                                    }
                                }
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(cardBg.opacity(0.6))
                                .cornerRadius(6)
                            }
                            .buttonStyle(.plain)

                            if isExpanded, let result = message.toolResults.first(where: { $0.toolUseId == tool.id }) {
                                Text(result.content)
                                    .font(.system(size: 10, design: .monospaced))
                                    .foregroundStyle(.white.opacity(0.6))
                                    .textSelection(.enabled)
                                    .padding(8)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .background(Color.black.opacity(0.3))
                                    .cornerRadius(4)
                                    .lineLimit(30)
                                    .padding(.top, 2)
                            }
                        }
                    }
                }
            }
        }
        .padding(.horizontal, isUserSide ? 0 : 4)
    }

    // MARK: - Phase K: Files Changed

    private var filesSection: some View {
        VStack(spacing: 0) {
            Button {
                withAnimation(.easeInOut(duration: 0.15)) {
                    showingFiles.toggle()
                }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: showingFiles ? "chevron.down" : "chevron.right")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(.tertiary)
                        .frame(width: 10)
                    Image(systemName: "doc.text")
                        .font(.system(size: 10))
                        .foregroundStyle(accent)
                    Text("\(trackedFiles.count) files changed")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.white.opacity(0.9))
                    Spacer()
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 6)
            }
            .buttonStyle(.plain)

            if showingFiles {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(trackedFiles.prefix(20), id: \.path) { file in
                        HStack(spacing: 6) {
                            // File icon based on extension
                            Image(systemName: fileIcon(for: file.path))
                                .font(.system(size: 9))
                                .foregroundStyle(.tertiary)
                                .frame(width: 12)

                            Text(shortPath(file.path))
                                .font(.system(size: 10, design: .monospaced))
                                .foregroundStyle(.white.opacity(0.8))
                                .lineLimit(1)
                                .truncationMode(.head)

                            Spacer()

                            if file.version > 1 {
                                Text("v\(file.version)")
                                    .font(.system(size: 9, weight: .medium, design: .monospaced))
                                    .foregroundStyle(accent.opacity(0.7))
                            }
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 2)
                    }
                    if trackedFiles.count > 20 {
                        Text("+\(trackedFiles.count - 20) more files")
                            .font(.system(size: 10))
                            .foregroundStyle(.tertiary)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 2)
                    }
                }
                .padding(.bottom, 6)
            }

            Divider().opacity(0.2)
        }
        .background(cardBg.opacity(0.5))
    }

    private func fileIcon(for path: String) -> String {
        let ext = URL(fileURLWithPath: path).pathExtension.lowercased()
        switch ext {
        case "ts", "tsx", "js", "jsx": return "chevron.left.forwardslash.chevron.right"
        case "swift": return "swift"
        case "py": return "text.page"
        case "md": return "doc.richtext"
        case "json": return "curlybraces"
        case "sql": return "cylinder"
        case "css", "scss": return "paintbrush"
        case "html": return "globe"
        default: return "doc"
        }
    }

    private func shortPath(_ path: String) -> String {
        // Remove common prefixes for readability
        let cleaned = path
            .replacingOccurrences(of: "/Users/wivak/puo-jects/____active/purmemo/", with: "")
            .replacingOccurrences(of: "/Users/wivak/.claude/", with: ".claude/")
            .replacingOccurrences(of: "/Users/wivak/", with: "~/")
        return cleaned
    }

    // MARK: - Session Intelligence

    private var intelligenceSection: some View {
        VStack(spacing: 0) {
            Button {
                withAnimation(.easeInOut(duration: 0.15)) {
                    showingSummary.toggle()
                }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: showingSummary ? "chevron.down" : "chevron.right")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(.tertiary)
                        .frame(width: 10)
                    Image(systemName: "brain.head.profile")
                        .font(.system(size: 10))
                        .foregroundStyle(accent)
                    Text("Session Intelligence")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.white.opacity(0.9))
                    Text("\(summaries.count)")
                        .font(.system(size: 9, weight: .bold, design: .monospaced))
                        .foregroundStyle(accent)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 1)
                        .background(accent.opacity(0.15))
                        .cornerRadius(4)
                    Spacer()
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 6)
            }
            .buttonStyle(.plain)

            if showingSummary {
                ScrollView {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(Array(summaries.enumerated()), id: \.offset) { index, summary in
                            VStack(alignment: .leading, spacing: 4) {
                                if summaries.count > 1 {
                                    Text("Summary \(index + 1)")
                                        .font(.system(size: 9, weight: .semibold))
                                        .foregroundStyle(accent.opacity(0.7))
                                }
                                Text(summary)
                                    .font(.system(size: 11))
                                    .foregroundStyle(.white.opacity(0.85))
                                    .textSelection(.enabled)
                                    .lineSpacing(3)
                            }
                            .padding(10)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(cardBg)
                            .cornerRadius(8)
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.bottom, 8)
                }
                .frame(maxHeight: 300)
            }

            Divider().opacity(0.2)
        }
        .background(cardBg.opacity(0.5))
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "text.bubble")
                .font(.system(size: 28))
                .foregroundStyle(.tertiary)
            Text("No messages found")
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
            Text("This session may only contain system events")
                .font(.system(size: 11))
                .foregroundStyle(.tertiary)
            Spacer()
        }
    }

    // MARK: - Data Loading

    private func loadConversation() {
        isLoading = true
        let path = session.fullPath ?? ""
        let sessionId = session.sessionId

        Task.detached {
            let parsed = SessionParser.parse(filePath: path)

            // Phase K: Load file attribution from database
            let files = SessionStore.shared.database.fetchFilesForSession(sessionId: sessionId)

            // Load compact summaries (LLM-generated session intelligence)
            let sums = SessionStore.shared.database.fetchSummaries(sessionId: sessionId)

            await MainActor.run {
                messages = parsed
                trackedFiles = files
                summaries = sums
                isLoading = false
            }
        }
    }

    // MARK: - Filtering & Formatting

    private var filteredMessages: [ConversationMessage] {
        guard !searchText.isEmpty else { return messages }
        let query = searchText.lowercased()
        return messages.filter { $0.text.lowercased().contains(query) }
    }

    private func highlightedText(_ text: String) -> AttributedString {
        var result = AttributedString(text)
        guard !searchText.isEmpty else { return result }

        let query = searchText.lowercased()
        var searchRange = result.startIndex
        while searchRange < result.endIndex {
            guard let range = result[searchRange...].range(of: query, options: .caseInsensitive) else { break }
            result[range].backgroundColor = accent.opacity(0.3)
            searchRange = range.upperBound
        }
        return result
    }

    private func formatModel(_ model: String) -> String {
        if model.contains("opus") { return "opus" }
        if model.contains("sonnet") { return "sonnet" }
        if model.contains("haiku") { return "haiku" }
        return model.components(separatedBy: "-").last ?? model
    }

    private func formatTime(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "h:mm a"
        return f.string(from: date)
    }
}
