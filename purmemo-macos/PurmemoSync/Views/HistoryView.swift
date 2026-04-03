import SwiftUI

struct HistoryView: View {
    let onBack: () -> Void
    var onSelectSession: ((String) -> Void)? = nil  // Navigate to session by ID

    @State private var scanner = HistoryScanner()
    @State private var searchText = ""
    @State private var selectedProject: String? = nil
    @State private var expandedMonths: Set<String> = []
    @State private var expandedPastes: Set<String> = []  // Track which entries show pasted content

    private let accent = Color(red: 0.906, green: 0.988, blue: 0.267) // #E7FC44
    private let cardBg = Color(red: 0.102, green: 0.102, blue: 0.102)

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider().opacity(0.2)

            if scanner.isLoading {
                Spacer()
                ProgressView("Loading prompt history...")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                Spacer()
            } else if scanner.monthGroups.isEmpty {
                emptyState
            } else {
                filters
                timeline
            }
        }
        .onAppear {
            scanner.load()
            // Auto-expand the most recent month
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                if let first = scanner.monthGroups.first {
                    expandedMonths.insert(first.month)
                }
            }
        }
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
                    Text("Prompt History")
                        .font(.system(size: 16, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)

                    if let oldest = scanner.oldestDate {
                        let formatter = DateFormatter()
                        let _ = formatter.dateFormat = "MMM yyyy"
                        Text("\(scanner.totalCount.formatted()) prompts since \(formatter.string(from: oldest))")
                            .font(.system(size: 11))
                            .foregroundStyle(.secondary)
                    }
                }

                Spacer()
            }

            // Search
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 11))
                    .foregroundStyle(.tertiary)
                TextField("Search all prompts...", text: $searchText)
                    .textFieldStyle(.plain)
                    .font(.system(size: 12))
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(cardBg)
            .cornerRadius(6)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    // MARK: - Filters

    private var filters: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                filterChip("All", isSelected: selectedProject == nil) {
                    selectedProject = nil
                }
                ForEach(scanner.projectNames.prefix(8), id: \.self) { project in
                    filterChip(project, isSelected: selectedProject == project) {
                        selectedProject = selectedProject == project ? nil : project
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
        }
    }

    private func filterChip(_ label: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 11, weight: isSelected ? .semibold : .regular))
                .foregroundStyle(isSelected ? .black : .secondary)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(isSelected ? accent : cardBg)
                .cornerRadius(12)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Timeline

    private var timeline: some View {
        ScrollView {
            LazyVStack(spacing: 2, pinnedViews: .sectionHeaders) {
                ForEach(filteredGroups) { group in
                    monthSection(group)
                }
            }
            .padding(.horizontal, 8)
            .padding(.bottom, 8)
        }
    }

    private func monthSection(_ group: MonthGroup) -> some View {
        Section {
            if expandedMonths.contains(group.month) {
                ForEach(group.entries) { entry in
                    promptRow(entry)
                }
            }
        } header: {
            monthHeader(group)
        }
    }

    private func monthHeader(_ group: MonthGroup) -> some View {
        Button {
            withAnimation(.easeInOut(duration: 0.2)) {
                if expandedMonths.contains(group.month) {
                    expandedMonths.remove(group.month)
                } else {
                    expandedMonths.insert(group.month)
                }
            }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: expandedMonths.contains(group.month) ? "chevron.down" : "chevron.right")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(.tertiary)
                    .frame(width: 12)

                Text(group.displayMonth)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.white)

                Spacer()

                Text("\(group.entries.count)")
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                    .foregroundStyle(accent)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(accent.opacity(0.15))
                    .cornerRadius(4)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .background(Color(nsColor: .init(red: 0.06, green: 0.06, blue: 0.06, alpha: 1)))
        }
        .buttonStyle(.plain)
    }

    private func promptRow(_ entry: HistoryEntry) -> some View {
        let isExpanded = expandedPastes.contains(entry.id)

        return VStack(alignment: .leading, spacing: 4) {
            Text(entry.displayText)
                .font(.system(size: 12))
                .foregroundStyle(entry.isImageOrPaste ? Color.secondary : Color.white.opacity(0.9))
                .lineLimit(isExpanded ? nil : 2)
                .textSelection(.enabled)

            // Pasted content indicator + expansion
            if entry.hasPastedContent {
                Button {
                    withAnimation(.easeInOut(duration: 0.15)) {
                        if isExpanded {
                            expandedPastes.remove(entry.id)
                        } else {
                            expandedPastes.insert(entry.id)
                        }
                    }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                            .font(.system(size: 8, weight: .semibold))
                        Image(systemName: "doc.on.clipboard")
                            .font(.system(size: 9))
                        Text("\(entry.pastedLineCount) lines pasted")
                            .font(.system(size: 10, weight: .medium))
                    }
                    .foregroundStyle(accent.opacity(0.8))
                }
                .buttonStyle(.plain)

                if isExpanded, let pastes = entry.pastedContents {
                    ForEach(pastes) { paste in
                        if !paste.content.isEmpty {
                            Text(paste.content)
                                .font(.system(size: 10, design: .monospaced))
                                .foregroundStyle(.white.opacity(0.7))
                                .textSelection(.enabled)
                                .padding(8)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(Color.black.opacity(0.3))
                                .cornerRadius(4)
                                .lineLimit(50)
                        }
                    }
                }
            }

            HStack(spacing: 8) {
                Text(entry.projectName)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(accent.opacity(0.8))

                if entry.hasPastedContent {
                    Image(systemName: "doc.on.clipboard")
                        .font(.system(size: 9))
                        .foregroundStyle(.tertiary)
                }

                // Link to full session if sessionId exists
                if let sid = entry.sessionId, !sid.isEmpty, onSelectSession != nil {
                    Button {
                        onSelectSession?(sid)
                    } label: {
                        HStack(spacing: 3) {
                            Image(systemName: "arrow.right.circle")
                                .font(.system(size: 9))
                            Text("session")
                                .font(.system(size: 9, weight: .medium))
                        }
                        .foregroundStyle(accent.opacity(0.6))
                    }
                    .buttonStyle(.plain)
                }

                Spacer()

                Text(formatDate(entry.date))
                    .font(.system(size: 10))
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(cardBg)
        .cornerRadius(6)
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "clock.arrow.circlepath")
                .font(.system(size: 28))
                .foregroundStyle(.tertiary)
            Text("No prompt history found")
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
            Text("history.jsonl not found in ~/.claude/")
                .font(.system(size: 11))
                .foregroundStyle(.tertiary)
            Spacer()
        }
    }

    // MARK: - Filtering

    private var filteredGroups: [MonthGroup] {
        var groups = scanner.monthGroups

        // Filter by project
        if let project = selectedProject {
            groups = groups.compactMap { group in
                let filtered = group.entries.filter { $0.projectName == project }
                guard !filtered.isEmpty else { return nil }
                return MonthGroup(month: group.month, displayMonth: group.displayMonth, entries: filtered)
            }
        }

        // Filter by search — also searches pasted content
        if !searchText.isEmpty {
            let query = searchText.lowercased()
            groups = groups.compactMap { group in
                let filtered = group.entries.filter {
                    $0.display.lowercased().contains(query) ||
                    $0.projectName.lowercased().contains(query) ||
                    ($0.pastedContents?.contains { $0.content.lowercased().contains(query) } ?? false)
                }
                guard !filtered.isEmpty else { return nil }
                return MonthGroup(month: group.month, displayMonth: group.displayMonth, entries: filtered)
            }
        }

        return groups
    }

    // MARK: - Helpers

    private func formatDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        let calendar = Calendar.current
        if calendar.isDateInToday(date) {
            formatter.dateFormat = "h:mm a"
        } else if calendar.isDateInYesterday(date) {
            return "Yesterday"
        } else {
            formatter.dateFormat = "MMM d, h:mm a"
        }
        return formatter.string(from: date)
    }
}
