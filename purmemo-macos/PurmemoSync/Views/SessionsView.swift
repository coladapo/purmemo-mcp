import SwiftUI
import PurmemoShared

struct SessionsView: View {
    @Bindable var auth: AuthClient
    @State private var scanner = SessionScanner()
    @State private var searchText = ""
    @State private var expandedProjects: Set<String> = []
    @State private var expandedProjectFiles: Set<String> = []  // Phase K: expanded file lists
    @State private var selectedSession: SessionEntry?
    @State private var showingHistory = false
    @State private var showingSources = false
    @State private var sessionsWithSummaries: Set<String> = []  // Cached brain icon lookup
    @State private var dropQueue = DropQueue.shared
    private let store = SessionStore.shared
    private let cloud = CloudSync.shared

    private let accent = Color(red: 0.906, green: 0.988, blue: 0.267) // #E7FC44
    private let cardBg = Color(red: 0.102, green: 0.102, blue: 0.102) // #1a1a1a

    var body: some View {
        if dropQueue.isShowingPrompt {
            DropPromptView(queue: dropQueue)
        } else if showingSources {
            SourcesView {
                withAnimation(.easeInOut(duration: 0.15)) {
                    showingSources = false
                }
            }
        } else if showingHistory {
            HistoryView(onBack: {
                withAnimation(.easeInOut(duration: 0.15)) {
                    showingHistory = false
                }
            }, onSelectSession: { sessionId in
                // Find the session entry and navigate to it
                for group in scanner.projectGroups {
                    if let session = group.sessions.first(where: { $0.sessionId == sessionId }) {
                        withAnimation(.easeInOut(duration: 0.15)) {
                            showingHistory = false
                            selectedSession = session
                        }
                        return
                    }
                }
            })
        } else if let session = selectedSession {
            SessionDetailView(session: session) {
                withAnimation(.easeInOut(duration: 0.15)) {
                    selectedSession = nil
                }
            }
        } else {
            sessionsListBody
        }
    }

    private var sessionsListBody: some View {
        VStack(spacing: 0) {
            header
            Divider().opacity(0.2)
            searchBar

            if scanner.isScanning {
                Spacer()
                ProgressView().controlSize(.small)
                Spacer()
            } else if scanner.projectGroups.isEmpty {
                emptyState
            } else {
                sessionList
            }
        }
        .onAppear {
            scanner.scan()
            sessionsWithSummaries = SessionStore.shared.database.allSessionIdsWithSummaries()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                let first3 = scanner.projectGroups.prefix(3).map(\.name)
                expandedProjects = Set(first3)
            }
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(spacing: 6) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("purmemo")
                        .font(.system(size: 16, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)

                    Text("\(scanner.totalSessions) sessions across \(scanner.projectGroups.count) projects")
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Button(action: {
                    withAnimation(.easeInOut(duration: 0.15)) {
                        showingSources = true
                    }
                }) {
                    Image(systemName: "externaldrive.connected.to.line.below")
                        .font(.system(size: 13))
                        .foregroundStyle(accent)
                }
                .buttonStyle(.plain)
                .help("Data Sources")

                Button(action: {
                    withAnimation(.easeInOut(duration: 0.15)) {
                        showingHistory = true
                    }
                }) {
                    Image(systemName: "clock.arrow.circlepath")
                        .font(.system(size: 13))
                        .foregroundStyle(accent)
                }
                .buttonStyle(.plain)
                .help("Prompt History")

                Button(action: {
                    scanner.scan()
                    SessionStore.shared.fullSync()
                }) {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)

                Menu {
                    Text(auth.userEmail)
                    Divider()
                    Section("Local Store") {
                        Text("\(store.syncedCount) sessions backed up")
                        Text(store.totalStoredSize)
                        if store.deletedSourceCount > 0 {
                            Text("\(store.deletedSourceCount) preserved (source deleted)")
                        }
                    }
                    Section("Cloud Sync") {
                        Text("\(cloud.syncedThisSession) synced this session")
                        if let error = cloud.lastError {
                            Text("Last error: \(error)")
                        }
                    }
                    Divider()
                    Button("Sign Out") { auth.logout() }
                    Divider()
                    Button("Quit Purmemo") { NSApp.terminate(nil) }
                } label: {
                    Image(systemName: "person.circle")
                        .font(.system(size: 14))
                        .foregroundStyle(.secondary)
                }
                .menuStyle(.borderlessButton)
                .frame(width: 24)
            }

            // Sync status bar
            if store.isSyncing || cloud.isSyncing {
                HStack(spacing: 6) {
                    ProgressView().controlSize(.mini)
                    Text(cloud.isSyncing ? "Uploading to cloud..." : "Backing up...")
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                    Spacer()
                }
            } else {
                HStack(spacing: 6) {
                    Circle().fill(accent).frame(width: 6, height: 6)
                    Text("\(store.syncedCount) backed up")
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                    Text("·").foregroundStyle(.quaternary)
                    Text(store.totalStoredSize)
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(.tertiary)
                    Spacer()
                    Button(action: {
                        NSWorkspace.shared.open(SessionStore.purmemoHome)
                    }) {
                        HStack(spacing: 4) {
                            Image(systemName: "folder")
                                .font(.system(size: 10))
                            Text("Open in Finder")
                                .font(.system(size: 10, weight: .medium))
                        }
                        .foregroundStyle(accent)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Search

    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 12))
                .foregroundStyle(.tertiary)
            TextField("Search sessions...", text: $searchText)
                .textFieldStyle(.plain)
                .font(.system(size: 13))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(cardBg)
        .cornerRadius(8)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    // MARK: - Session List

    private var sessionList: some View {
        ScrollView {
            LazyVStack(spacing: 2, pinnedViews: .sectionHeaders) {
                ForEach(filteredGroups) { group in
                    projectSection(group)
                }
            }
            .padding(.horizontal, 8)
            .padding(.bottom, 8)
        }
    }

    private func projectSection(_ group: ProjectGroup) -> some View {
        Section {
            if expandedProjects.contains(group.name) {
                // Phase K: Project file summary
                projectFileSummary(group)

                ForEach(group.sessions) { session in
                    sessionRow(session)
                }
            }
        } header: {
            projectHeader(group)
        }
    }

    // MARK: - Project Header with Sync Controls

    private func projectHeader(_ group: ProjectGroup) -> some View {
        HStack(spacing: 8) {
            // Expand/collapse
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    if expandedProjects.contains(group.name) {
                        expandedProjects.remove(group.name)
                    } else {
                        expandedProjects.insert(group.name)
                    }
                }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: expandedProjects.contains(group.name) ? "chevron.down" : "chevron.right")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(.tertiary)
                        .frame(width: 12)

                    Text(group.name)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(.white)
                }
            }
            .buttonStyle(.plain)

            Spacer()

            // Project cloud sync menu
            let policy = cloud.preferences.policy(for: group.name)
            Menu {
                Section("Cloud Sync Policy") {
                    Button {
                        cloud.setProjectManual(project: group.name)
                    } label: {
                        HStack {
                            Text("Manual")
                            if policy == .manual { Image(systemName: "checkmark") }
                        }
                    }
                    Button {
                        cloud.enableProjectSync(project: group.name, sessionIds: group.sessions.map(\.sessionId))
                    } label: {
                        HStack {
                            Text("Auto-sync all")
                            if policy == .autoSync { Image(systemName: "checkmark") }
                        }
                    }
                    Button {
                        cloud.setProjectNever(project: group.name, sessionIds: group.sessions.map(\.sessionId))
                    } label: {
                        HStack {
                            Text("Never sync")
                            if policy == .never { Image(systemName: "checkmark") }
                        }
                    }
                }
            } label: {
                Image(systemName: cloudIconForProject(group))
                    .font(.system(size: 11))
                    .foregroundStyle(cloudColorForProject(group))
            }
            .menuStyle(.borderlessButton)
            .frame(width: 20)

            Text("\(group.sessions.count)")
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .foregroundStyle(accent)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(accent.opacity(0.15))
                .cornerRadius(4)

            if let date = group.latestActivity {
                Text(relativeDate(date))
                    .font(.system(size: 10))
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(Color(nsColor: .init(red: 0.06, green: 0.06, blue: 0.06, alpha: 1)))
    }

    // MARK: - Phase K: Project File Summary

    @ViewBuilder
    private func projectFileSummary(_ group: ProjectGroup) -> some View {
        let stats = store.database.fileStatsForProject(project: group.name)
        let isExpanded = expandedProjectFiles.contains(group.name)

        if stats.fileCount > 0 {
            VStack(alignment: .leading, spacing: 0) {
                Button {
                    withAnimation(.easeInOut(duration: 0.15)) {
                        if isExpanded {
                            expandedProjectFiles.remove(group.name)
                        } else {
                            expandedProjectFiles.insert(group.name)
                        }
                    }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                            .font(.system(size: 8, weight: .semibold))
                            .foregroundStyle(.tertiary)
                            .frame(width: 8)
                        Image(systemName: "doc.text")
                            .font(.system(size: 9))
                            .foregroundStyle(accent.opacity(0.6))
                        Text("\(stats.fileCount) files changed across \(stats.sessionCount) sessions")
                            .font(.system(size: 10))
                            .foregroundStyle(.secondary)
                        Spacer()
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 4)
                }
                .buttonStyle(.plain)
                .padding(.leading, 20)

                if isExpanded {
                    let topFiles = store.database.fetchTopFilesForProject(project: group.name)
                    VStack(alignment: .leading, spacing: 1) {
                        ForEach(topFiles, id: \.path) { file in
                            HStack(spacing: 6) {
                                Text(shortFilePath(file.path))
                                    .font(.system(size: 9, design: .monospaced))
                                    .foregroundStyle(.white.opacity(0.6))
                                    .lineLimit(1)
                                    .truncationMode(.head)
                                Spacer()
                                Text("\(file.sessions)s")
                                    .font(.system(size: 9, design: .monospaced))
                                    .foregroundStyle(accent.opacity(0.5))
                                    .help("\(file.sessions) sessions")
                            }
                            .padding(.horizontal, 14)
                            .padding(.vertical, 2)
                        }
                    }
                    .padding(.leading, 28)
                    .padding(.bottom, 4)
                }
            }
        }
    }

    private func shortFilePath(_ path: String) -> String {
        path.replacingOccurrences(of: "/Users/wivak/puo-jects/____active/purmemo/", with: "")
            .replacingOccurrences(of: "/Users/wivak/.claude/", with: ".claude/")
            .replacingOccurrences(of: "/Users/wivak/", with: "~/")
    }

    // MARK: - Session Row with Sync Button

    private func sessionRow(_ session: SessionEntry) -> some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 4) {
                Text(session.displayPrompt)
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.9))
                    .lineLimit(2)

                HStack(spacing: 8) {
                    if let count = session.messageCount {
                        Label("\(count) msgs", systemImage: "bubble.left.and.bubble.right")
                            .font(.system(size: 10))
                            .foregroundStyle(.tertiary)
                    }

                    if let branch = session.gitBranch, branch != "main" {
                        Label(branch, systemImage: "arrow.triangle.branch")
                            .font(.system(size: 10))
                            .foregroundStyle(accent.opacity(0.7))
                    }

                    // Phase G: PR link badge
                    if let pr = session.prLink, !pr.isEmpty {
                        Label("PR", systemImage: "arrow.triangle.pull")
                            .font(.system(size: 9, weight: .medium))
                            .foregroundStyle(accent)
                            .padding(.horizontal, 4)
                            .padding(.vertical, 1)
                            .background(accent.opacity(0.15))
                            .cornerRadius(3)
                    }

                    // Phase G: Session mode badge
                    if session.sessionMode == "coordinator" {
                        Text("coord")
                            .font(.system(size: 9, weight: .medium, design: .monospaced))
                            .foregroundStyle(.orange)
                            .padding(.horizontal, 4)
                            .padding(.vertical, 1)
                            .background(Color.orange.opacity(0.15))
                            .cornerRadius(3)
                    }

                    // Intelligence badge — session has compact summaries
                    if sessionsWithSummaries.contains(session.sessionId) {
                        Image(systemName: "brain.head.profile")
                            .font(.system(size: 9))
                            .foregroundStyle(accent)
                    }

                    Spacer()

                    if let date = session.modifiedDate {
                        Text(relativeDate(date))
                            .font(.system(size: 10))
                            .foregroundStyle(.tertiary)
                    }
                }

                // Phase G: Tags as chips
                if let tags = session.tags, !tags.isEmpty {
                    HStack(spacing: 4) {
                        ForEach(tags.prefix(3), id: \.self) { tag in
                            Text(tag)
                                .font(.system(size: 9, weight: .medium))
                                .foregroundStyle(accent)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(accent.opacity(0.1))
                                .cornerRadius(4)
                        }
                        if tags.count > 3 {
                            Text("+\(tags.count - 3)")
                                .font(.system(size: 9))
                                .foregroundStyle(.tertiary)
                        }
                    }
                }
            }

            // Cloud sync button
            Spacer(minLength: 8)
            cloudSyncButton(for: session)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(cardBg)
        .cornerRadius(6)
        .padding(.leading, 20)
        .contentShape(Rectangle())
        .onTapGesture {
            guard session.fullPath != nil else { return }
            withAnimation(.easeInOut(duration: 0.15)) {
                selectedSession = session
            }
        }
    }

    @ViewBuilder
    private func cloudSyncButton(for session: SessionEntry) -> some View {
        let sessionId = session.sessionId
        let isSynced = cloud.isCloudSynced(sessionId: sessionId)
        let isEnabled = cloud.isSyncEnabled(sessionId: sessionId)
        let isSyncingThis = cloud.syncQueue.contains(sessionId)

        if isSyncingThis {
            ProgressView()
                .controlSize(.mini)
                .frame(width: 24, height: 24)
        } else if isSynced {
            // Already in cloud
            Image(systemName: "checkmark.icloud.fill")
                .font(.system(size: 14))
                .foregroundStyle(accent)
                .frame(width: 24, height: 24)
                .help("Synced to cloud")
        } else if isEnabled {
            // Opted in but not yet synced (pending)
            Button {
                cloud.syncSession(sessionId)
            } label: {
                Image(systemName: "arrow.clockwise.icloud")
                    .font(.system(size: 14))
                    .foregroundStyle(accent.opacity(0.6))
            }
            .buttonStyle(.plain)
            .frame(width: 24, height: 24)
            .help("Retry cloud sync")
        } else {
            // Not opted in — show upload button
            Button {
                cloud.enableSync(sessionId: sessionId)
            } label: {
                Image(systemName: "icloud.and.arrow.up")
                    .font(.system(size: 14))
                    .foregroundStyle(.tertiary)
            }
            .buttonStyle(.plain)
            .frame(width: 24, height: 24)
            .help("Sync to cloud")
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "tray")
                .font(.system(size: 32))
                .foregroundStyle(.tertiary)
            Text("No Claude Code sessions found")
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
            Text("Start a Claude Code session to see it here")
                .font(.system(size: 11))
                .foregroundStyle(.tertiary)
            Spacer()
        }
    }

    // MARK: - Filtering

    private var filteredGroups: [ProjectGroup] {
        guard !searchText.isEmpty else { return scanner.projectGroups }
        let query = searchText.lowercased()
        return scanner.projectGroups.compactMap { group in
            let matchingByName = group.name.lowercased().contains(query)
            let matchingSessions = group.sessions.filter {
                ($0.firstPrompt?.lowercased().contains(query) ?? false) ||
                ($0.gitBranch?.lowercased().contains(query) ?? false) ||
                ($0.customTitle?.lowercased().contains(query) ?? false) ||
                ($0.aiTitle?.lowercased().contains(query) ?? false) ||
                ($0.tags?.contains { $0.lowercased().contains(query) } ?? false)
            }
            if matchingByName { return group }
            else if !matchingSessions.isEmpty {
                return ProjectGroup(name: group.name, projectPath: group.projectPath, sessions: matchingSessions)
            }
            return nil
        }
    }

    // MARK: - Helpers

    private func relativeDate(_ date: Date) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: Date())
    }

    private func cloudIconForProject(_ group: ProjectGroup) -> String {
        let policy = cloud.preferences.policy(for: group.name)
        switch policy {
        case .autoSync: return "icloud.fill"
        case .never: return "icloud.slash"
        case .manual: return "icloud"
        }
    }

    private func cloudColorForProject(_ group: ProjectGroup) -> Color {
        let policy = cloud.preferences.policy(for: group.name)
        switch policy {
        case .autoSync: return accent
        case .never: return .secondary.opacity(0.4)
        case .manual: return .secondary
        }
    }
}
