import SwiftUI

struct MemoryDetailView: View {
    let memory: RecallMemory
    var authService: AuthService?
    @Environment(\.dismiss) private var dismiss
    @State private var fullContent: String?
    @State private var isLoading = true

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        // Title
                        if let title = memory.title, !title.isEmpty {
                            Text(title)
                                .font(.system(size: 20, weight: .semibold))
                                .foregroundColor(.white)
                        }

                        // Metadata row
                        HStack(spacing: 12) {
                            if let date = memory.created_at {
                                Label(formatDate(date), systemImage: "clock")
                                    .font(.system(size: 12))
                                    .foregroundColor(.white.opacity(0.35))
                            }
                            if let score = memory.score {
                                Label("\(Int(score * 100))% match", systemImage: "target")
                                    .font(.system(size: 12))
                                    .foregroundColor(Color(hex: "#E7FC44").opacity(0.7))
                            }
                            Spacer()
                        }

                        // Divider
                        Rectangle()
                            .fill(Color.white.opacity(0.06))
                            .frame(height: 1)

                        // Content
                        if isLoading {
                            HStack(spacing: 8) {
                                ProgressView()
                                    .progressViewStyle(CircularProgressViewStyle(tint: .white.opacity(0.4)))
                                Text("Loading full memory...")
                                    .font(.system(size: 14))
                                    .foregroundColor(.white.opacity(0.3))
                            }
                            .padding(.top, 20)
                        } else {
                            Text(displayContent)
                                .font(.system(size: 15))
                                .foregroundColor(.white.opacity(0.85))
                                .lineSpacing(5)
                                .textSelection(.enabled)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 20)
                }
            }
        }
        .preferredColorScheme(.dark)
        .task { await loadFullContent() }
    }

    private var displayContent: String {
        cleanContent(fullContent ?? memory.content)
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Button { dismiss() } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 17, weight: .medium))
                    .foregroundColor(.white)
            }

            Spacer()

            Text("Memory")
                .font(.system(size: 17, weight: .semibold))
                .foregroundColor(.white)

            Spacer()

            // Copy button
            Button {
                UIPasteboard.general.string = displayContent
            } label: {
                Image(systemName: "doc.on.doc")
                    .font(.system(size: 16))
                    .foregroundColor(.white.opacity(0.4))
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
        .background(Color.black)
        .overlay(
            Rectangle()
                .frame(height: 0.5)
                .foregroundColor(.white.opacity(0.08)),
            alignment: .bottom
        )
    }

    // MARK: - Load Full Content

    private func loadFullContent() async {
        guard let authService else {
            // No auth service — show recall snippet
            isLoading = false
            return
        }

        let api = PurmemoAPI(authService: authService)
        do {
            let full = try await api.getMemory(id: memory.id)
            fullContent = full.content
        } catch {
            // Fall back to recall snippet
            fullContent = nil
        }
        isLoading = false
    }

    // MARK: - Helpers

    private func formatDate(_ dateString: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: dateString) {
            let relative = RelativeDateTimeFormatter()
            relative.unitsStyle = .short
            return relative.localizedString(for: date, relativeTo: Date())
        }
        formatter.formatOptions = [.withInternetDateTime]
        if let date = formatter.date(from: dateString) {
            let relative = RelativeDateTimeFormatter()
            relative.unitsStyle = .short
            return relative.localizedString(for: date, relativeTo: Date())
        }
        return dateString.prefix(10).description
    }

    private func cleanContent(_ content: String) -> String {
        var text = content
        text = text.replacingOccurrences(of: "=== CONVERSATION START ===", with: "")
        text = text.replacingOccurrences(of: "=== CONVERSATION END ===", with: "")
        text = text.replacingOccurrences(of: "=== END ===", with: "")
        return text.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
