import SwiftUI

struct ProjectDetailView: View {
    let project: ProjectItem
    let workItems: [WorkItem]
    let blockers: [BlockerItem]
    let completions: [CompletionItem]
    var authService: AuthService

    @Environment(\.dismiss) private var dismiss
    @State private var selectedMemoryId: String?
    @State private var selectedMemoryTitle: String?

    // Filtered to this project
    private var projectWorkItems: [WorkItem] {
        workItems.filter { ($0.projectName ?? "").localizedCaseInsensitiveCompare(project.name) == .orderedSame }
    }

    private var projectBlockers: [BlockerItem] {
        blockers.filter { ($0.projectName ?? "").localizedCaseInsensitiveCompare(project.name) == .orderedSame }
    }

    private var projectCompletions: [CompletionItem] {
        completions.filter { ($0.projectName ?? "").localizedCaseInsensitiveCompare(project.name) == .orderedSame }
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        heroSection
                        statsRow
                        if !projectBlockers.isEmpty { blockersSection }
                        if !projectWorkItems.isEmpty { workItemsSection }
                        if !projectCompletions.isEmpty { completionsSection }
                        if projectBlockers.isEmpty && projectWorkItems.isEmpty && projectCompletions.isEmpty {
                            emptyState
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 20)
                    .padding(.bottom, 40)
                }
            }
        }
        .preferredColorScheme(.dark)
        .sheet(isPresented: Binding(
            get: { selectedMemoryId != nil },
            set: { if !$0 { selectedMemoryId = nil; selectedMemoryTitle = nil } }
        )) {
            if let memId = selectedMemoryId {
                MemoryDetailView(memoryId: memId, memoryTitle: selectedMemoryTitle, authService: authService)
            }
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Button { dismiss() } label: {
                HStack(spacing: 4) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 16, weight: .semibold))
                    Text("Back")
                        .font(.system(size: 17))
                }
                .foregroundColor(Color(hex: "#E7FC44"))
            }
            Spacer()
            Text("Project")
                .font(.system(size: 17, weight: .semibold))
                .foregroundColor(.white)
            Spacer()
            // Invisible balancer
            HStack(spacing: 4) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .semibold))
                Text("Back")
                    .font(.system(size: 17))
            }
            .opacity(0)
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

    // MARK: - Hero

    private var heroSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(project.name)
                .font(.system(size: 24, weight: .bold))
                .foregroundColor(.white)

            if let date = project.lastActivity {
                HStack(spacing: 6) {
                    Image(systemName: "clock")
                        .font(.system(size: 11))
                    Text("Last active \(formatRelative(date))")
                        .font(.system(size: 13))
                }
                .foregroundColor(.white.opacity(0.35))
            }

            // Pulse indicator
            HStack(spacing: 8) {
                pulseChip
                if project.blockerCount > 0 {
                    chip("Blocked", color: "#FF3B30")
                }
            }
            .padding(.top, 4)
        }
    }

    private var pulseChip: some View {
        let hasBlockers = project.blockerCount > 0
        let hasOpen = project.openItems > 0
        let pulse: (String, String) = hasBlockers
            ? ("Needs attention", "#FF3B30")
            : hasOpen
                ? ("Active", "#E7FC44")
                : ("Clear", "#34C759")

        return HStack(spacing: 5) {
            Circle()
                .fill(Color(hex: pulse.1))
                .frame(width: 6, height: 6)
            Text(pulse.0)
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(Color(hex: pulse.1))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(Color(hex: pulse.1).opacity(0.1))
        .clipShape(Capsule())
    }

    private func chip(_ text: String, color: String) -> some View {
        Text(text)
            .font(.system(size: 11, weight: .semibold))
            .foregroundColor(Color(hex: color))
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Color(hex: color).opacity(0.1))
            .clipShape(Capsule())
    }

    // MARK: - Stats

    private var statsRow: some View {
        HStack(spacing: 12) {
            statCard("\(project.memoryCount)", label: "Memories", icon: "doc.text", color: "#E7FC44")
            statCard("\(project.openItems)", label: "Open", icon: "circle.dashed", color: "#FF9500")
            statCard("\(project.blockerCount)", label: "Blocked", icon: "exclamationmark.triangle", color: "#FF3B30")
            statCard("\(projectCompletions.count)", label: "Shipped", icon: "checkmark.circle", color: "#34C759")
        }
    }

    private func statCard(_ value: String, label: String, icon: String, color: String) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 14))
                .foregroundColor(Color(hex: color))
            Text(value)
                .font(.system(size: 20, weight: .bold))
                .foregroundColor(.white)
            Text(label)
                .font(.system(size: 10))
                .foregroundColor(.white.opacity(0.35))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(Color(hex: "#1a1a1a"))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color(hex: color).opacity(0.15), lineWidth: 1)
        )
    }

    // MARK: - Blockers

    private var blockersSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionLabel("Blockers", icon: "exclamationmark.triangle.fill", color: "#FF3B30")

            ForEach(projectBlockers) { blocker in
                Button {
                    selectedMemoryId = blocker.memoryId
                    selectedMemoryTitle = blocker.memoryTitle
                } label: {
                    HStack(alignment: .top, spacing: 10) {
                        Circle()
                            .fill(Color(hex: blocker.severityColor))
                            .frame(width: 8, height: 8)
                            .padding(.top, 5)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(blocker.text)
                                .font(.system(size: 14))
                                .foregroundColor(.white.opacity(0.85))
                                .multilineTextAlignment(.leading)
                            if let cause = blocker.blockingCause, !cause.isEmpty {
                                Text(cause)
                                    .font(.system(size: 12))
                                    .foregroundColor(.white.opacity(0.35))
                                    .lineLimit(2)
                            }
                        }
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.system(size: 11))
                            .foregroundColor(.white.opacity(0.15))
                    }
                    .padding(12)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(14)
        .background(Color(hex: "#1a1a1a"))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color(hex: "#FF3B30").opacity(0.15), lineWidth: 1)
        )
    }

    // MARK: - Work Items

    private var workItemsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionLabel("Open Items", icon: "checklist", color: "#FF9500")

            ForEach(projectWorkItems) { item in
                Button {
                    selectedMemoryId = item.memoryId
                    selectedMemoryTitle = item.memoryTitle
                } label: {
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: item.typeIcon)
                            .font(.system(size: 12))
                            .foregroundColor(Color(hex: item.priorityColor))
                            .frame(width: 16)
                            .padding(.top, 2)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(item.text)
                                .font(.system(size: 14))
                                .foregroundColor(.white.opacity(0.85))
                                .multilineTextAlignment(.leading)
                            HStack(spacing: 6) {
                                Text(item.type)
                                    .font(.system(size: 10, weight: .medium))
                                    .foregroundColor(.white.opacity(0.4))
                                    .padding(.horizontal, 5)
                                    .padding(.vertical, 1)
                                    .background(Color.white.opacity(0.06))
                                    .clipShape(Capsule())
                                Text(item.priority)
                                    .font(.system(size: 10, weight: .medium))
                                    .foregroundColor(Color(hex: item.priorityColor).opacity(0.8))
                                    .padding(.horizontal, 5)
                                    .padding(.vertical, 1)
                                    .background(Color(hex: item.priorityColor).opacity(0.1))
                                    .clipShape(Capsule())
                            }
                        }
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.system(size: 11))
                            .foregroundColor(.white.opacity(0.15))
                    }
                    .padding(12)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(14)
        .background(Color(hex: "#1a1a1a"))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Completions

    private var completionsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionLabel("Shipped", icon: "checkmark.circle.fill", color: "#34C759")

            ForEach(projectCompletions.prefix(10)) { item in
                Button {
                    selectedMemoryId = item.memoryId
                    selectedMemoryTitle = item.memoryTitle
                } label: {
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 12))
                            .foregroundColor(Color(hex: "#34C759"))
                            .frame(width: 16)
                            .padding(.top, 2)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(item.text)
                                .font(.system(size: 14))
                                .foregroundColor(.white.opacity(0.85))
                                .multilineTextAlignment(.leading)
                            if let date = item.createdAt {
                                Text(formatRelative(date))
                                    .font(.system(size: 11))
                                    .foregroundColor(.white.opacity(0.25))
                            }
                        }
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.system(size: 11))
                            .foregroundColor(.white.opacity(0.15))
                    }
                    .padding(12)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(14)
        .background(Color(hex: "#1a1a1a"))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "tray")
                .font(.system(size: 28))
                .foregroundColor(.white.opacity(0.15))
            Text("No extracted items yet")
                .font(.system(size: 14))
                .foregroundColor(.white.opacity(0.3))
            Text("Items will appear as you save conversations about this project")
                .font(.system(size: 12))
                .foregroundColor(.white.opacity(0.2))
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }

    // MARK: - Components

    private func sectionLabel(_ title: String, icon: String, color: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 12))
                .foregroundColor(Color(hex: color))
            Text(title.uppercased())
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(Color(hex: color))
                .tracking(0.8)
            Spacer()
        }
    }

    private func formatRelative(_ dateString: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: dateString) {
            let rel = RelativeDateTimeFormatter()
            rel.unitsStyle = .abbreviated
            return rel.localizedString(for: date, relativeTo: Date())
        }
        formatter.formatOptions = [.withInternetDateTime]
        if let date = formatter.date(from: dateString) {
            let rel = RelativeDateTimeFormatter()
            rel.unitsStyle = .abbreviated
            return rel.localizedString(for: date, relativeTo: Date())
        }
        return String(dateString.prefix(10))
    }
}
