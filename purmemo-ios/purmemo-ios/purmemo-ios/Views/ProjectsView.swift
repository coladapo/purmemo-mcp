import SwiftUI

struct ProjectsView: View {
    var authService: AuthService
    @State private var summary: ProjectsSummary?
    @State private var isLoading = true
    @State private var selectedTab = 0

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                segmentedControl

                if isLoading {
                    Spacer()
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .white.opacity(0.4)))
                    Spacer()
                } else if let summary {
                    TabView(selection: $selectedTab) {
                        projectsList(summary)
                            .tag(0)
                        workItemsList(summary)
                            .tag(1)
                        completionsList(summary)
                            .tag(2)
                    }
                    .tabViewStyle(.page(indexDisplayMode: .never))
                } else {
                    emptyState
                }
            }
        }
        .preferredColorScheme(.dark)
        .task { await loadData() }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Image("PurmemoWordmark")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(height: 34)
                Text("Project Intelligence")
                    .font(.system(size: 12))
                    .foregroundColor(.white.opacity(0.4))
            }
            Spacer()
            Button { Task { await loadData() } } label: {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 16))
                    .foregroundColor(.white.opacity(0.4))
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
        .background(Color.black)
    }

    // MARK: - Segmented Control

    private var segmentedControl: some View {
        HStack(spacing: 0) {
            segmentButton("Projects", tab: 0, count: summary?.projects.count)
            segmentButton("Action Items", tab: 1, count: summary?.workItems.count)
            segmentButton("Shipped", tab: 2, count: summary?.completions.count)
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
        .background(Color.black)
        .overlay(
            Rectangle()
                .fill(Color.white.opacity(0.06))
                .frame(height: 0.5),
            alignment: .bottom
        )
    }

    private func segmentButton(_ title: String, tab: Int, count: Int?) -> some View {
        Button { withAnimation(.easeInOut(duration: 0.2)) { selectedTab = tab } } label: {
            VStack(spacing: 6) {
                HStack(spacing: 4) {
                    Text(title)
                        .font(.system(size: 13, weight: selectedTab == tab ? .semibold : .regular))
                        .foregroundColor(selectedTab == tab ? .white : .white.opacity(0.4))
                    if let count, count > 0 {
                        Text("\(count)")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(selectedTab == tab ? .black : .white.opacity(0.4))
                            .padding(.horizontal, 5)
                            .padding(.vertical, 1)
                            .background(selectedTab == tab ? Color(hex: "#E7FC44") : Color.white.opacity(0.1))
                            .clipShape(Capsule())
                    }
                }
                Rectangle()
                    .fill(selectedTab == tab ? Color(hex: "#E7FC44") : Color.clear)
                    .frame(height: 2)
                    .clipShape(Capsule())
            }
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Projects List

    private func projectsList(_ summary: ProjectsSummary) -> some View {
        ScrollView {
            LazyVStack(spacing: 8) {
                // Blockers section (if any)
                if !summary.blockers.isEmpty {
                    sectionHeader("Blockers", icon: "exclamationmark.triangle.fill", color: "#FF3B30")
                    ForEach(summary.blockers) { blocker in
                        blockerRow(blocker)
                    }
                    .padding(.bottom, 8)
                }

                // Projects
                ForEach(summary.projects) { project in
                    projectCard(project)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
    }

    private func projectCard(_ project: ProjectItem) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(project.name)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.white)
                    .lineLimit(1)
                Spacer()
                if let date = project.lastActivity {
                    Text(formatRelative(date))
                        .font(.system(size: 11))
                        .foregroundColor(.white.opacity(0.25))
                }
            }

            HStack(spacing: 16) {
                statBadge("\(project.memoryCount)", label: "memories", color: "#E7FC44")
                if project.openItems > 0 {
                    statBadge("\(project.openItems)", label: "open", color: "#FF9500")
                }
                if project.blockerCount > 0 {
                    statBadge("\(project.blockerCount)", label: "blocked", color: "#FF3B30")
                }
            }
        }
        .padding(14)
        .background(Color(hex: "#1a1a1a"))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.white.opacity(0.06), lineWidth: 1)
        )
    }

    private func statBadge(_ value: String, label: String, color: String) -> some View {
        HStack(spacing: 4) {
            Text(value)
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(Color(hex: color))
            Text(label)
                .font(.system(size: 11))
                .foregroundColor(.white.opacity(0.3))
        }
    }

    private func blockerRow(_ blocker: BlockerItem) -> some View {
        HStack(spacing: 10) {
            Circle()
                .fill(Color(hex: blocker.severityColor))
                .frame(width: 8, height: 8)
            VStack(alignment: .leading, spacing: 2) {
                Text(blocker.text)
                    .font(.system(size: 13))
                    .foregroundColor(.white)
                    .lineLimit(2)
                if let project = blocker.projectName {
                    Text(project)
                        .font(.system(size: 11))
                        .foregroundColor(.white.opacity(0.3))
                }
            }
            Spacer()
        }
        .padding(12)
        .background(Color(hex: "#1a1a1a"))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(Color(hex: blocker.severityColor).opacity(0.2), lineWidth: 1)
        )
    }

    // MARK: - Work Items List

    private func workItemsList(_ summary: ProjectsSummary) -> some View {
        ScrollView {
            LazyVStack(spacing: 6) {
                ForEach(summary.workItems) { item in
                    workItemRow(item)
                }
                if summary.workItems.isEmpty {
                    emptySection("No open work items", icon: "checkmark.circle")
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
    }

    private func workItemRow(_ item: WorkItem) -> some View {
        HStack(spacing: 10) {
            Image(systemName: item.typeIcon)
                .font(.system(size: 13))
                .foregroundColor(Color(hex: item.priorityColor))
                .frame(width: 20)

            VStack(alignment: .leading, spacing: 3) {
                Text(item.text)
                    .font(.system(size: 14))
                    .foregroundColor(.white)
                    .lineLimit(2)
                HStack(spacing: 8) {
                    if let project = item.projectName {
                        Text(project)
                            .font(.system(size: 11))
                            .foregroundColor(.white.opacity(0.3))
                    }
                    Text(item.type)
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(.white.opacity(0.4))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 1)
                        .background(Color.white.opacity(0.06))
                        .clipShape(Capsule())
                }
            }

            Spacer(minLength: 4)

            // Priority dot
            Circle()
                .fill(Color(hex: item.priorityColor))
                .frame(width: 6, height: 6)
        }
        .padding(12)
        .background(Color(hex: "#1a1a1a"))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(Color.white.opacity(0.04), lineWidth: 1)
        )
    }

    // MARK: - Completions List

    private func completionsList(_ summary: ProjectsSummary) -> some View {
        ScrollView {
            LazyVStack(spacing: 6) {
                ForEach(summary.completions) { item in
                    completionRow(item)
                }
                if summary.completions.isEmpty {
                    emptySection("No recent completions", icon: "tray")
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
    }

    private func completionRow(_ item: CompletionItem) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 14))
                .foregroundColor(Color(hex: "#E7FC44"))

            VStack(alignment: .leading, spacing: 3) {
                Text(item.text)
                    .font(.system(size: 14))
                    .foregroundColor(.white)
                    .lineLimit(2)
                HStack(spacing: 8) {
                    if let project = item.projectName {
                        Text(project)
                            .font(.system(size: 11))
                            .foregroundColor(.white.opacity(0.3))
                    }
                    if let date = item.createdAt {
                        Text(formatRelative(date))
                            .font(.system(size: 11))
                            .foregroundColor(.white.opacity(0.2))
                    }
                }
            }
            Spacer()
        }
        .padding(12)
        .background(Color(hex: "#1a1a1a"))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    // MARK: - Helpers

    private func sectionHeader(_ title: String, icon: String, color: String) -> some View {
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
        .padding(.top, 4)
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "chart.bar.doc.horizontal")
                .font(.system(size: 36))
                .foregroundColor(.white.opacity(0.15))
            Text("No project data yet")
                .font(.system(size: 15))
                .foregroundColor(.white.opacity(0.3))
            Text("Save conversations to see projects here")
                .font(.system(size: 13))
                .foregroundColor(.white.opacity(0.2))
            Spacer()
        }
    }

    private func emptySection(_ text: String, icon: String) -> some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 24))
                .foregroundColor(.white.opacity(0.15))
            Text(text)
                .font(.system(size: 13))
                .foregroundColor(.white.opacity(0.3))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
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

    private func loadData() async {
        isLoading = true
        let api = PurmemoAPI(authService: authService)
        do {
            summary = try await api.getProjectsSummary()
        } catch {
            summary = nil
        }
        isLoading = false
    }
}
