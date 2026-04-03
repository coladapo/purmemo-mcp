import SwiftUI

/// Shows all detected AI tool data sources with session counts
struct SourcesView: View {
    let onBack: () -> Void

    @State private var codex = CodexScanner()
    @State private var cursor = CursorScanner()
    @State private var claudeDesktop = ClaudeDesktopScanner()
    @State private var gemini = GeminiScanner()
    @State private var expandedSources: Set<String> = []
    @State private var showAllCodex = false
    @State private var showAllCursor = false
    @State private var showAllClaudeDesktop = false
    @State private var showAllGemini = false

    private let accent = Color(red: 0.906, green: 0.988, blue: 0.267)
    private let cardBg = Color(red: 0.102, green: 0.102, blue: 0.102)

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider().opacity(0.2)

            ScrollView {
                VStack(spacing: 4) {
                    // Codex CLI
                    collapsibleSource(
                        key: "codex",
                        icon: "terminal",
                        name: "OpenAI Codex CLI",
                        path: "~/.codex/",
                        isAvailable: codex.isAvailable,
                        isLoading: codex.isLoading,
                        sessionCount: codex.threads.count,
                        detail: codex.threads.isEmpty ? nil : "\(codex.totalLogs.formatted()) log entries",
                        error: codex.error
                    ) {
                        let limit = showAllCodex ? codex.threads.count : 10
                        ForEach(codex.threads.prefix(limit)) { thread in
                            threadRow(thread)
                        }
                        if codex.threads.count > 10 && !showAllCodex {
                            viewMoreButton(remaining: codex.threads.count - 10) {
                                showAllCodex = true
                            }
                        }
                    }

                    // Cursor
                    collapsibleSource(
                        key: "cursor",
                        icon: "cursorarrow.rays",
                        name: "Cursor",
                        path: "~/Library/Application Support/Cursor/",
                        isAvailable: cursor.isAvailable,
                        isLoading: cursor.isLoading,
                        sessionCount: cursor.totalComposerKeys,
                        detail: cursor.sessions.isEmpty ? nil : sizeString(cursor.sessions.reduce(0) { $0 + $1.rawSize }),
                        error: cursor.error
                    ) {
                        let limit = showAllCursor ? cursor.sessions.count : 10
                        ForEach(cursor.sessions.prefix(limit)) { session in
                            composerRow(session)
                        }
                        if cursor.sessions.count > 10 && !showAllCursor {
                            viewMoreButton(remaining: cursor.sessions.count - 10) {
                                showAllCursor = true
                            }
                        }
                    }

                    // Claude Desktop
                    collapsibleSource(
                        key: "claude-desktop",
                        icon: "sparkle",
                        name: "Claude Desktop (Agent)",
                        path: "~/Library/Application Support/Claude/",
                        isAvailable: claudeDesktop.isAvailable,
                        isLoading: claudeDesktop.isLoading,
                        sessionCount: claudeDesktop.sessions.count,
                        detail: claudeDesktop.totalSize > 0 ? sizeString(Int(claudeDesktop.totalSize)) : nil,
                        error: claudeDesktop.error
                    ) {
                        let limit = showAllClaudeDesktop ? claudeDesktop.sessions.count : 10
                        ForEach(claudeDesktop.sessions.prefix(limit)) { session in
                            agentRow(session)
                        }
                        if claudeDesktop.sessions.count > 10 && !showAllClaudeDesktop {
                            viewMoreButton(remaining: claudeDesktop.sessions.count - 10) {
                                showAllClaudeDesktop = true
                            }
                        }
                    }

                    // Gemini CLI
                    collapsibleSource(
                        key: "gemini",
                        icon: "sparkles",
                        name: "Gemini CLI",
                        path: "~/.gemini/tmp/",
                        isAvailable: gemini.isAvailable,
                        isLoading: gemini.isLoading,
                        sessionCount: gemini.sessionCount,
                        detail: gemini.totalSize > 0 ? sizeString(Int(gemini.totalSize)) : nil,
                        error: gemini.error
                    ) {
                        let limit = showAllGemini ? gemini.sessions.count : 10
                        ForEach(gemini.sessions.prefix(limit)) { session in
                            geminiRow(session)
                        }
                        if gemini.sessions.count > 10 && !showAllGemini {
                            viewMoreButton(remaining: gemini.sessions.count - 10) {
                                showAllGemini = true
                            }
                        }
                    }

                    Divider().opacity(0.1).padding(.vertical, 4)

                    // ChatGPT — server-side only
                    sourceCard(
                        icon: "bubble.left.and.text.bubble.right",
                        name: "ChatGPT Desktop",
                        path: "Server-side only",
                        isAvailable: FileManager.default.fileExists(atPath: NSHomeDirectory() + "/Library/Application Support/com.openai.chat"),
                        isLoading: false,
                        sessionCount: 0,
                        detail: "Conversations stored on OpenAI servers",
                        error: nil
                    )

                    // Windsurf
                    let windsurfAvailable = FileManager.default.fileExists(
                        atPath: NSHomeDirectory() + "/Library/Application Support/Windsurf/User/globalStorage/state.vscdb"
                    )
                    sourceCard(
                        icon: "wind",
                        name: "Windsurf (Cascade)",
                        path: "Server-side only",
                        isAvailable: windsurfAvailable,
                        isLoading: false,
                        sessionCount: 0,
                        detail: "Conversations stored on Codeium servers",
                        error: nil
                    )
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
            }
        }
        .onAppear {
            codex.scan()
            cursor.scan()
            claudeDesktop.scan()
            gemini.scan()
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 8) {
            Button(action: onBack) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(accent)
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 2) {
                Text("Data Sources")
                    .font(.system(size: 16, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)

                Text("AI tools detected on this Mac")
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
            }

            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    // MARK: - Collapsible Source

    private func collapsibleSource<Content: View>(
        key: String,
        icon: String, name: String, path: String,
        isAvailable: Bool, isLoading: Bool,
        sessionCount: Int, detail: String?, error: String?,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(spacing: 2) {
            // Header — tappable to expand/collapse
            sourceCard(
                icon: icon, name: name, path: path,
                isAvailable: isAvailable, isLoading: isLoading,
                sessionCount: sessionCount, detail: detail, error: error
            )
            .contentShape(Rectangle())
            .onTapGesture {
                guard isAvailable && sessionCount > 0 else { return }
                withAnimation(.easeInOut(duration: 0.2)) {
                    if expandedSources.contains(key) {
                        expandedSources.remove(key)
                    } else {
                        expandedSources.insert(key)
                    }
                }
            }

            // Expanded content
            if expandedSources.contains(key) {
                content()
            }
        }
    }

    private func viewMoreButton(remaining: Int, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text("View \(remaining) more")
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(accent)
                .padding(.vertical, 6)
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
        .padding(.leading, 28)
    }

    // MARK: - Source Card

    private func sourceCard(
        icon: String, name: String, path: String,
        isAvailable: Bool, isLoading: Bool,
        sessionCount: Int, detail: String?, error: String?
    ) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 16))
                .foregroundStyle(isAvailable ? accent : Color.secondary.opacity(0.3))
                .frame(width: 24)

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(name)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(isAvailable ? .white : .secondary)

                    if isLoading {
                        ProgressView().controlSize(.mini)
                    }
                }

                Text(path)
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(.tertiary)

                if let detail {
                    Text(detail)
                        .font(.system(size: 10))
                        .foregroundStyle(.tertiary)
                }

                if let error {
                    Text(error)
                        .font(.system(size: 10))
                        .foregroundStyle(.red.opacity(0.7))
                }
            }

            Spacer()

            if isAvailable && sessionCount > 0 {
                Text("\(sessionCount)")
                    .font(.system(size: 12, weight: .bold, design: .monospaced))
                    .foregroundStyle(accent)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(accent.opacity(0.15))
                    .cornerRadius(6)
            } else if !isAvailable {
                Text("N/A")
                    .font(.system(size: 10))
                    .foregroundStyle(.quaternary)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(cardBg)
        .cornerRadius(8)
    }

    // MARK: - Row Views

    private func threadRow(_ thread: CodexThread) -> some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 3) {
                Text(thread.displayTitle)
                    .font(.system(size: 11))
                    .foregroundStyle(.white.opacity(0.85))
                    .lineLimit(1)

                HStack(spacing: 6) {
                    Text(thread.projectName)
                        .font(.system(size: 9, weight: .medium))
                        .foregroundStyle(accent.opacity(0.7))

                    if let model = thread.model {
                        Text(model)
                            .font(.system(size: 9))
                            .foregroundStyle(.quaternary)
                    }

                    Spacer()

                    Text(relativeDate(thread.updatedAt))
                        .font(.system(size: 9))
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(cardBg.opacity(0.6))
        .cornerRadius(5)
        .padding(.leading, 28)
    }

    private func composerRow(_ session: CursorComposerSession) -> some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 3) {
                Text(session.displayTitle)
                    .font(.system(size: 11))
                    .foregroundStyle(.white.opacity(0.85))
                    .lineLimit(1)

                HStack(spacing: 6) {
                    if session.messageCount > 0 {
                        Text("\(session.messageCount) msgs")
                            .font(.system(size: 9))
                            .foregroundStyle(.tertiary)
                    }

                    Text(sizeString(session.rawSize))
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundStyle(.quaternary)

                    Spacer()

                    if let date = session.createdAt {
                        Text(relativeDate(date))
                            .font(.system(size: 9))
                            .foregroundStyle(.tertiary)
                    }
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(cardBg.opacity(0.6))
        .cornerRadius(5)
        .padding(.leading, 28)
    }

    private func agentRow(_ session: ClaudeDesktopSession) -> some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 3) {
                Text(session.displayTitle)
                    .font(.system(size: 11))
                    .foregroundStyle(.white.opacity(0.85))
                    .lineLimit(1)

                HStack(spacing: 6) {
                    if session.messageCount > 0 {
                        Text("\(session.messageCount) msgs")
                            .font(.system(size: 9))
                            .foregroundStyle(.tertiary)
                    }

                    Text(ByteCountFormatter.string(fromByteCount: Int64(session.fileSize), countStyle: .file))
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundStyle(.quaternary)

                    Spacer()

                    Text(relativeDate(session.modifiedDate))
                        .font(.system(size: 9))
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(cardBg.opacity(0.6))
        .cornerRadius(5)
        .padding(.leading, 28)
    }

    private func geminiRow(_ session: GeminiSession) -> some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 3) {
                Text(session.displayTitle)
                    .font(.system(size: 11))
                    .foregroundStyle(.white.opacity(0.85))
                    .lineLimit(1)

                HStack(spacing: 6) {
                    Text(session.project)
                        .font(.system(size: 9, weight: .medium))
                        .foregroundStyle(accent.opacity(0.7))

                    if let model = session.model {
                        Text(model)
                            .font(.system(size: 9))
                            .foregroundStyle(.quaternary)
                    }

                    if session.messageCount > 0 {
                        Text("\(session.messageCount) msgs")
                            .font(.system(size: 9))
                            .foregroundStyle(.tertiary)
                    }

                    Spacer()

                    Text(relativeDate(session.modifiedDate))
                        .font(.system(size: 9))
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(cardBg.opacity(0.6))
        .cornerRadius(5)
        .padding(.leading, 28)
    }

    // MARK: - Helpers

    private func relativeDate(_ date: Date) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: Date())
    }

    private func sizeString(_ bytes: Int) -> String {
        ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file)
    }
}
