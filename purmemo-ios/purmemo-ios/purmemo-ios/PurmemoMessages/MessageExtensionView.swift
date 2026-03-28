import SwiftUI

// MARK: - Data Model

struct RecallResult: Identifiable {
    let id: String
    let title: String?
    let content: String
    let score: Double?
    let platform: String?
    let createdAt: String?
}

// MARK: - Main Extension View

struct MessageExtensionView: View {
    let isExpanded: Bool
    let onExpand: () -> Void
    let onInsertMemory: (RecallResult) -> Void
    let onCollapse: () -> Void

    @State private var searchText = ""
    @State private var results: [RecallResult] = []
    @State private var isLoading = false
    @State private var hasSearched = false
    @State private var errorMessage: String?
    @State private var activeTab: Tab = .recall

    enum Tab { case recall, save }

    private var isSignedIn: Bool {
        KeychainService.load(.accessToken) != nil
    }

    var body: some View {
        ZStack {
            Color(hex: "#111111").ignoresSafeArea()

            if !isSignedIn {
                signedOutView
            } else if isExpanded {
                expandedView
            } else {
                compactView
            }
        }
        .preferredColorScheme(.dark)
    }

    // MARK: - Signed Out

    private var signedOutView: some View {
        VStack(spacing: 12) {
            Image(systemName: "brain.head.profile")
                .font(.system(size: 28))
                .foregroundColor(Color(hex: "#E7FC44"))
            Text("Open pūrmemo to sign in")
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(.white.opacity(0.6))
        }
    }

    // MARK: - Compact Mode

    private var compactView: some View {
        VStack(spacing: 10) {
            // Search bar
            Button(action: onExpand) {
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 14))
                        .foregroundColor(.white.opacity(0.35))
                    Text("Ask pūrmemo...")
                        .font(.system(size: 15))
                        .foregroundColor(.white.opacity(0.35))
                    Spacer()
                    Image(systemName: "brain.head.profile")
                        .font(.system(size: 14))
                        .foregroundColor(Color(hex: "#E7FC44"))
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(Color(hex: "#1a1a1a"))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.white.opacity(0.08), lineWidth: 1)
                )
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)

            // Recent memories horizontal scroll
            if !results.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(results.prefix(5)) { memory in
                            recentCard(memory)
                        }
                    }
                    .padding(.horizontal, 16)
                }
            }

            Spacer()
        }
        .task {
            if results.isEmpty {
                await loadRecentMemories()
            }
        }
    }

    private func recentCard(_ memory: RecallResult) -> some View {
        Button {
            onInsertMemory(memory)
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                Text(memory.title ?? "Memory")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.white)
                    .lineLimit(1)
                Text(memory.content)
                    .font(.system(size: 11))
                    .foregroundColor(.white.opacity(0.4))
                    .lineLimit(2)
            }
            .padding(10)
            .frame(width: 140, alignment: .leading)
            .background(Color(hex: "#1a1a1a"))
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(Color.white.opacity(0.06), lineWidth: 1)
            )
        }
    }

    // MARK: - Expanded Mode

    private var expandedView: some View {
        VStack(spacing: 0) {
            // Header with tabs
            HStack {
                Text("pūrmemo")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(.white)
                Spacer()
                HStack(spacing: 0) {
                    tabButton("Recall", tab: .recall)
                    tabButton("Save", tab: .save)
                }
                .background(Color(hex: "#1a1a1a"))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 12)

            if activeTab == .recall {
                recallView
            } else {
                saveView
            }
        }
    }

    private func tabButton(_ label: String, tab: Tab) -> some View {
        Button {
            withAnimation(.easeInOut(duration: 0.15)) { activeTab = tab }
        } label: {
            Text(label)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(activeTab == tab ? .black : .white.opacity(0.5))
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
                .background(activeTab == tab ? Color(hex: "#E7FC44") : Color.clear)
                .clipShape(RoundedRectangle(cornerRadius: 7))
        }
    }

    // MARK: - Recall Tab

    private var recallView: some View {
        VStack(spacing: 12) {
            // Search field
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 14))
                    .foregroundColor(.white.opacity(0.35))
                TextField("Search memories...", text: $searchText)
                    .font(.system(size: 15))
                    .foregroundColor(.white)
                    .submitLabel(.search)
                    .onSubmit { Task { await search() } }
                if isLoading {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: Color(hex: "#E7FC44")))
                        .scaleEffect(0.8)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 11)
            .background(Color(hex: "#1a1a1a"))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.white.opacity(0.08), lineWidth: 1)
            )
            .padding(.horizontal, 16)

            // Results
            ScrollView {
                LazyVStack(spacing: 10) {
                    if let error = errorMessage {
                        Text(error)
                            .font(.system(size: 13))
                            .foregroundColor(.white.opacity(0.4))
                            .padding(.top, 20)
                    } else if hasSearched && results.isEmpty {
                        VStack(spacing: 8) {
                            Image(systemName: "sparkle.magnifyingglass")
                                .font(.system(size: 24))
                                .foregroundColor(.white.opacity(0.2))
                            Text("No memories found for \"\(searchText)\"")
                                .font(.system(size: 13))
                                .foregroundColor(.white.opacity(0.4))
                        }
                        .padding(.top, 30)
                    } else {
                        ForEach(results) { memory in
                            memoryCard(memory)
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 20)
            }
        }
    }

    private func memoryCard(_ memory: RecallResult) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            // Title + metadata row
            HStack(alignment: .top) {
                if let title = memory.title, !title.isEmpty {
                    Text(title)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.white)
                        .lineLimit(1)
                }
                Spacer()
                if let timeAgo = relativeTime(from: memory.createdAt) {
                    Text(timeAgo)
                        .font(.system(size: 11))
                        .foregroundColor(.white.opacity(0.3))
                }
            }

            Text(memory.content)
                .font(.system(size: 13))
                .foregroundColor(.white.opacity(0.6))
                .lineLimit(3)

            HStack {
                if let platform = memory.platform, !platform.isEmpty {
                    Text(platform)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(Color(hex: "#E7FC44").opacity(0.6))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color(hex: "#E7FC44").opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                }
                Spacer()
                Button {
                    onInsertMemory(memory)
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "arrowshape.turn.up.right.fill")
                            .font(.system(size: 11))
                        Text("Send")
                            .font(.system(size: 12, weight: .semibold))
                    }
                    .foregroundColor(.black)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Color(hex: "#E7FC44"))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
        }
        .padding(12)
        .background(Color(hex: "#1a1a1a"))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.white.opacity(0.06), lineWidth: 1)
        )
    }

    private func relativeTime(from isoString: String?) -> String? {
        guard let isoString else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: isoString)
                ?? ISO8601DateFormatter().date(from: isoString) // fallback without fractional seconds
        else { return nil }

        let interval = Date().timeIntervalSince(date)
        switch interval {
        case ..<60: return "now"
        case ..<3600: return "\(Int(interval / 60))m"
        case ..<86400: return "\(Int(interval / 3600))h"
        case ..<604800: return "\(Int(interval / 86400))d"
        default: return "\(Int(interval / 604800))w"
        }
    }

    // MARK: - Save Tab

    @State private var saveText = ""
    @State private var isSaving = false
    @State private var saveSuccess = false

    private var saveView: some View {
        VStack(spacing: 16) {
            TextField("Type or paste something to save...", text: $saveText, axis: .vertical)
                .font(.system(size: 15))
                .foregroundColor(.white)
                .lineLimit(3...8)
                .padding(14)
                .background(Color(hex: "#1a1a1a"))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.white.opacity(0.08), lineWidth: 1)
                )
                .padding(.horizontal, 16)

            Button {
                Task { await saveMemory() }
            } label: {
                Group {
                    if isSaving {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: .black))
                    } else if saveSuccess {
                        HStack(spacing: 6) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 14))
                            Text("Saved!")
                        }
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(.black)
                    } else {
                        Text("Save Memory")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundColor(.black)
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 46)
                .background(saveText.trimmingCharacters(in: .whitespaces).isEmpty ? Color(hex: "#E7FC44").opacity(0.3) : Color(hex: "#E7FC44"))
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .disabled(saveText.trimmingCharacters(in: .whitespaces).isEmpty || isSaving || saveSuccess)
            .padding(.horizontal, 16)

            Spacer()
        }
        .padding(.top, 12)
    }

    // MARK: - API Calls

    private func search() async {
        let query = searchText.trimmingCharacters(in: .whitespaces)
        guard !query.isEmpty else { return }
        guard let token = KeychainService.load(.accessToken) else {
            errorMessage = "Open pūrmemo to sign in"
            return
        }

        isLoading = true
        hasSearched = true
        errorMessage = nil

        do {
            results = try await recallAPI(query: query, token: token)
        } catch RecallError.unauthorized {
            errorMessage = "Session expired. Open pūrmemo to sign in again."
        } catch {
            errorMessage = "Couldn't reach pūrmemo. Try again."
        }

        isLoading = false
    }

    private func loadRecentMemories() async {
        guard let token = KeychainService.load(.accessToken) else { return }
        do {
            results = try await recallAPI(query: "recent memories", token: token)
        } catch {
            // Silently fail for recent — not critical
        }
    }

    private func saveMemory() async {
        let content = saveText.trimmingCharacters(in: .whitespaces)
        guard !content.isEmpty else { return }
        guard let token = KeychainService.load(.accessToken) else { return }

        isSaving = true

        do {
            try await saveMemoryAPI(content: content, token: token)
            let haptic = UIImpactFeedbackGenerator(style: .medium)
            haptic.impactOccurred()
            saveSuccess = true
            try? await Task.sleep(for: .seconds(1.5))
            saveText = ""
            saveSuccess = false
        } catch {
            // Show error briefly
            errorMessage = "Failed to save. Try again."
        }

        isSaving = false
    }

    // MARK: - Network

    private func recallAPI(query: String, token: String) async throws -> [RecallResult] {
        let encoded = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
        let url = URL(string: "https://api.purmemo.ai/api/v9/recall-memories?query=\(encoded)")!
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 10

        let (data, response) = try await URLSession.shared.data(for: request)

        if let httpResponse = response as? HTTPURLResponse {
            if httpResponse.statusCode == 401 {
                throw RecallError.unauthorized
            }
            guard (200...299).contains(httpResponse.statusCode) else {
                throw URLError(.badServerResponse)
            }
        }

        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let tiersRaw = json["tiers"] as? [String: Any]
        else { return [] }

        // Merge all tiers: full (has content) → summary (has summary) → metadata (title only)
        var allItems: [[String: Any]] = []
        if let full = tiersRaw["full"] as? [[String: Any]] { allItems.append(contentsOf: full) }
        if let summary = tiersRaw["summary"] as? [[String: Any]] { allItems.append(contentsOf: summary) }
        if let metadata = tiersRaw["metadata"] as? [[String: Any]] { allItems.append(contentsOf: metadata) }

        return allItems.compactMap { item in
            guard let id = item["id"] as? String else { return nil }
            let content = (item["content"] as? String)
                ?? (item["summary"] as? String)
                ?? (item["title"] as? String)
                ?? ""
            guard !content.isEmpty else { return nil }
            return RecallResult(
                id: id,
                title: item["title"] as? String,
                content: content,
                score: item["relevance_score"] as? Double,
                platform: item["platform"] as? String,
                createdAt: item["created_at"] as? String
            )
        }
    }

    private enum RecallError: Error {
        case unauthorized
    }

    private func saveMemoryAPI(content: String, token: String) async throws {
        let url = URL(string: "https://api.purmemo.ai/api/v1/memories/")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 10

        let body: [String: Any] = [
            "content": content,
            "source_type": "ios_imessage_extension",
            "title": String(content.prefix(60))
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (_, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode)
        else {
            throw URLError(.badServerResponse)
        }
    }
}

// MARK: - Color Extension

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let r = Double((int >> 16) & 0xFF) / 255
        let g = Double((int >> 8) & 0xFF) / 255
        let b = Double(int & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }
}
