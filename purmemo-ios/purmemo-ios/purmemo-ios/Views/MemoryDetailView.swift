import SwiftUI

struct MemoryDetailView: View {
    let memory: RecallMemory
    var authService: AuthService?
    @Environment(\.dismiss) private var dismiss
    @State private var fullMemory: FullMemory?
    @State private var isLoading = true
    @State private var showRawContent = false
    @State private var editedEntities: [Entity]?

    /// Convenience init for navigating from project dashboard items (just ID + optional title)
    init(memoryId: String, memoryTitle: String? = nil, authService: AuthService) {
        self.memory = RecallMemory(id: memoryId, title: memoryTitle, content: "", score: nil, created_at: nil)
        self.authService = authService
    }

    init(memory: RecallMemory, authService: AuthService? = nil) {
        self.memory = memory
        self.authService = authService
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 0) {
                header

                if isLoading {
                    Spacer()
                    RingLoader(size: 56)
                    Spacer()
                } else if let fm = fullMemory {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 20) {
                            titleSection(fm)
                            chipRow(fm)
                            if !fm.observations.isEmpty { observationsSection(fm.observations) }
                            if !fm.workItems.isEmpty { workItemsSection(fm.workItems) }
                            if !fm.blockers.isEmpty { blockersSection(fm.blockers) }
                            if !fm.completions.isEmpty { completionsSection(fm.completions) }
                            if !(editedEntities ?? fm.entities).isEmpty { entitiesSection(editedEntities ?? fm.entities) }
                            if !fm.technologies.isEmpty { technologiesSection(fm.technologies) }
                            rawContentToggle(fm)
                        }
                        .padding(.horizontal, 20)
                        .padding(.vertical, 20)
                    }
                } else {
                    // Fallback: show recall snippet if API call failed
                    ScrollView {
                        VStack(alignment: .leading, spacing: 16) {
                            if let title = memory.title, !title.isEmpty {
                                Text(title)
                                    .font(.system(size: 20, weight: .semibold))
                                    .foregroundColor(.white)
                            }
                            Text(memory.content)
                                .font(.system(size: 15))
                                .foregroundColor(.white.opacity(0.85))
                                .lineSpacing(5)
                        }
                        .padding(20)
                    }
                }
            }
        }
        .preferredColorScheme(.dark)
        .task { await loadFullContent() }
    }

    // MARK: - Title & Metadata

    private func titleSection(_ fm: FullMemory) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let title = fm.title, !title.isEmpty {
                Text(title)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundColor(.white)
            }

            if let summary = fm.summary, !summary.isEmpty {
                Text(summary)
                    .font(.system(size: 15))
                    .foregroundColor(.white.opacity(0.65))
                    .lineSpacing(4)
            }

            HStack(spacing: 12) {
                if let date = fm.created_at {
                    Label(formatDate(date), systemImage: "clock")
                        .font(.system(size: 12))
                        .foregroundColor(.white.opacity(0.35))
                }
                if let platform = fm.platform, !platform.isEmpty {
                    Text(platform)
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(.white.opacity(0.5))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.white.opacity(0.08))
                        .clipShape(Capsule())
                }
                if let score = memory.score {
                    Label("\(Int(score * 100))%", systemImage: "target")
                        .font(.system(size: 12))
                        .foregroundColor(Color(hex: "#E7FC44").opacity(0.7))
                }
                Spacer()
            }
        }
    }

    // MARK: - Chip Row (category, intent, status, project)

    private func chipRow(_ fm: FullMemory) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                if let cat = fm.category, !cat.isEmpty, cat != "Other" {
                    chip(cat, icon: "folder", color: "#E7FC44")
                }
                if let intent = fm.intent, !intent.isEmpty {
                    chip(intent, icon: "arrow.right.circle", color: "#8E8E93")
                }
                if let status = fm.status, !status.isEmpty {
                    chip(status, icon: "circle.fill", color: statusColor(status))
                }
                if let proj = fm.project_name, !proj.isEmpty {
                    chip(proj, icon: "chart.bar.doc.horizontal", color: "#E7FC44")
                }
                if let wc = fm.word_count, wc > 0 {
                    chip("\(wc) words", icon: "doc.text", color: "#8E8E93")
                }
            }
        }
    }

    private func chip(_ text: String, icon: String, color: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 9))
            Text(text)
                .font(.system(size: 11, weight: .medium))
        }
        .foregroundColor(Color(hex: color))
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Color(hex: color).opacity(0.1))
        .clipShape(Capsule())
    }

    // MARK: - Observations (key insights)

    private func observationsSection(_ obs: [MemoryObservation]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionLabel("Key Insights", icon: "lightbulb", color: "#E7FC44")
            ForEach(obs.prefix(8)) { o in
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: o.typeIcon)
                        .font(.system(size: 11))
                        .foregroundColor(Color(hex: "#E7FC44").opacity(0.6))
                        .frame(width: 16, alignment: .center)
                        .padding(.top, 2)
                    Text(o.text)
                        .font(.system(size: 14))
                        .foregroundColor(.white.opacity(0.85))
                        .lineSpacing(3)
                }
            }
        }
        .padding(14)
        .background(Color(hex: "#1a1a1a"))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Work Items

    private func workItemsSection(_ items: [MemoryWorkItem]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionLabel("Action Items", icon: "checklist", color: "#FF9500")
            ForEach(items.prefix(6)) { item in
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: item.status == "open" ? "circle" : "checkmark.circle.fill")
                        .font(.system(size: 12))
                        .foregroundColor(item.status == "open" ? Color(hex: "#FF9500") : Color(hex: "#E7FC44"))
                        .frame(width: 16)
                        .padding(.top, 1)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.text)
                            .font(.system(size: 14))
                            .foregroundColor(.white.opacity(0.85))
                        if let type = item.type {
                            Text(type)
                                .font(.system(size: 10, weight: .medium))
                                .foregroundColor(.white.opacity(0.35))
                                .padding(.horizontal, 5)
                                .padding(.vertical, 1)
                                .background(Color.white.opacity(0.06))
                                .clipShape(Capsule())
                        }
                    }
                }
            }
        }
        .padding(14)
        .background(Color(hex: "#1a1a1a"))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Blockers

    private func blockersSection(_ items: [MemoryBlocker]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionLabel("Blockers", icon: "exclamationmark.triangle.fill", color: "#FF3B30")
            ForEach(items) { item in
                HStack(alignment: .top, spacing: 8) {
                    Circle()
                        .fill(Color(hex: item.severity == "critical" ? "#FF3B30" : item.severity == "major" ? "#FF9500" : "#8E8E93"))
                        .frame(width: 6, height: 6)
                        .padding(.top, 5)
                    Text(item.text)
                        .font(.system(size: 14))
                        .foregroundColor(.white.opacity(0.85))
                }
            }
        }
        .padding(14)
        .background(Color(hex: "#1a1a1a"))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Completions

    private func completionsSection(_ items: [MemoryCompletion]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionLabel("Shipped", icon: "checkmark.circle.fill", color: "#E7FC44")
            ForEach(items) { item in
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 12))
                        .foregroundColor(Color(hex: "#E7FC44"))
                        .frame(width: 16)
                        .padding(.top, 1)
                    Text(item.text)
                        .font(.system(size: 14))
                        .foregroundColor(.white.opacity(0.85))
                }
            }
        }
        .padding(14)
        .background(Color(hex: "#1a1a1a"))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Entities (horizontal, editable)

    private func entitiesSection(_ entities: [Entity]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionLabel("Entities", icon: "person.2", color: "#8E8E93")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(entities) { entity in
                        HStack(spacing: 4) {
                            if let type = entity.type {
                                Image(systemName: entityIcon(type))
                                    .font(.system(size: 9))
                            }
                            Text(entity.name)
                                .font(.system(size: 12, weight: .medium))
                            Button {
                                removeEntity(entity)
                            } label: {
                                Image(systemName: "xmark")
                                    .font(.system(size: 8, weight: .bold))
                                    .foregroundColor(.white.opacity(0.3))
                            }
                        }
                        .foregroundColor(.white.opacity(0.6))
                        .padding(.leading, 8)
                        .padding(.trailing, 6)
                        .padding(.vertical, 5)
                        .background(Color.white.opacity(0.06))
                        .clipShape(Capsule())
                    }
                }
            }
        }
        .padding(14)
        .background(Color(hex: "#1a1a1a"))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Technologies (horizontal)

    private func technologiesSection(_ techs: [String]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionLabel("Technologies", icon: "wrench.and.screwdriver", color: "#8E8E93")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(techs, id: \.self) { tech in
                        Text(tech)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(.white.opacity(0.6))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 5)
                            .background(Color.white.opacity(0.06))
                            .clipShape(Capsule())
                    }
                }
            }
        }
        .padding(14)
        .background(Color(hex: "#1a1a1a"))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Raw Content Toggle

    private func rawContentToggle(_ fm: FullMemory) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) { showRawContent.toggle() }
            } label: {
                HStack {
                    Image(systemName: "doc.plaintext")
                        .font(.system(size: 12))
                    Text("Full Conversation")
                        .font(.system(size: 13, weight: .medium))
                    Spacer()
                    Image(systemName: showRawContent ? "chevron.up" : "chevron.down")
                        .font(.system(size: 11))
                }
                .foregroundColor(.white.opacity(0.35))
                .padding(14)
                .background(Color(hex: "#1a1a1a"))
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)

            if showRawContent, let content = fm.content {
                Text(cleanContent(content))
                    .font(.system(size: 13))
                    .foregroundColor(.white.opacity(0.6))
                    .lineSpacing(4)
                    .textSelection(.enabled)
                    .padding(14)
                    .background(Color(hex: "#1a1a1a"))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
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

            Button {
                if let content = fullMemory?.content {
                    UIPasteboard.general.string = content
                }
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

    // MARK: - Entity Editing

    private func removeEntity(_ entity: Entity) {
        guard let fm = fullMemory else { return }
        let current = editedEntities ?? fm.entities
        let updated = current.filter { $0.name != entity.name }
        withAnimation(.easeInOut(duration: 0.2)) {
            editedEntities = updated
        }
        // Persist to backend
        Task {
            guard let authService else { return }
            let api = PurmemoAPI(authService: authService)
            try? await api.updateEntities(memoryId: fm.id, entities: updated)
        }
    }

    // MARK: - Data Loading

    private func loadFullContent() async {
        guard let authService else {
            isLoading = false
            return
        }

        let api = PurmemoAPI(authService: authService)
        do {
            fullMemory = try await api.getMemory(id: memory.id)
        } catch {
            fullMemory = nil
        }
        isLoading = false
    }

    // MARK: - Helpers

    private func sectionLabel(_ title: String, icon: String, color: String) -> some View {
        HStack(spacing: 5) {
            Image(systemName: icon)
                .font(.system(size: 11))
                .foregroundColor(Color(hex: color))
            Text(title.uppercased())
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(Color(hex: color))
                .tracking(0.6)
        }
    }

    private func entityIcon(_ type: String) -> String {
        switch type {
        case "person": return "person"
        case "organization": return "building.2"
        case "technology": return "cpu"
        case "concept": return "lightbulb"
        case "location": return "mappin"
        case "product": return "shippingbox"
        default: return "tag"
        }
    }

    private func statusColor(_ status: String) -> String {
        switch status {
        case "active", "in_progress": return "#E7FC44"
        case "completed", "shipped": return "#34C759"
        case "blocked": return "#FF3B30"
        default: return "#8E8E93"
        }
    }

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

// MARK: - Flow Layout (for tags/entities)

struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = arrange(proposal: proposal, subviews: subviews)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrange(proposal: proposal, subviews: subviews)
        for (index, frame) in result.frames.enumerated() {
            subviews[index].place(at: CGPoint(x: bounds.minX + frame.minX, y: bounds.minY + frame.minY), proposal: .init(frame.size))
        }
    }

    private func arrange(proposal: ProposedViewSize, subviews: Subviews) -> (size: CGSize, frames: [CGRect]) {
        let maxWidth = proposal.width ?? .infinity
        var frames: [CGRect] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            frames.append(CGRect(origin: CGPoint(x: x, y: y), size: size))
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
        }

        return (CGSize(width: maxWidth, height: y + rowHeight), frames)
    }
}
