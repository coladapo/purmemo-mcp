import SwiftUI
import Combine

struct ThinkingView: View {
    var authService: AuthService
    @State private var todos: [TodoItem] = []
    @State private var completedTodos: [TodoItem] = []
    @State private var suggestions: [TodoSuggestion] = []
    @State private var isLoading = true
    @State private var newTodoText = ""
    @State private var showCompleted = false
    @State private var showSettings = false
    @State private var placeholderIndex = 0
    @State private var voiceService = VoiceService()
    @State private var isRecording = false

    private let placeholders = [
        "Add a todo...",
        "Record a voice note...",
        "Plan your Claude Code session..."
    ]

    private var activeTodos: [TodoItem] { todos.filter { !$0.isDone } }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                todoContent
            }
            .safeAreaInset(edge: .bottom) {
                addBar
            }
        }
        .preferredColorScheme(.dark)
        .task { await loadTodos() }
        .sheet(isPresented: $showSettings) {
            SettingsView(authService: authService)
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 6) {
                Image("PurmemoWordmark")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(height: 34)
                HStack(spacing: 6) {
                    Text("Thinking")
                        .font(.system(size: 12))
                        .foregroundColor(.white.opacity(0.4))
                    if !activeTodos.isEmpty {
                        Text("\(activeTodos.count)")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(.black)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 1)
                            .background(Color(hex: "#E7FC44"))
                            .clipShape(Capsule())
                    }
                }
            }
            Spacer()
            Button { showSettings = true } label: {
                Image(systemName: "gearshape")
                    .font(.system(size: 18))
                    .foregroundColor(.white.opacity(0.5))
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

    // MARK: - Content

    private var todoContent: some View {
        Group {
            if isLoading {
                Spacer()
                RingLoader(size: 56)
                Spacer()
            } else if activeTodos.isEmpty && completedTodos.isEmpty {
                emptyState
            } else {
                todoList
            }
        }
    }

    private var todoList: some View {
        ScrollView {
            LazyVStack(spacing: 6) {

                let urgent = activeTodos.filter { $0.priority == "urgent" || $0.priority == "high" }
                let rest = activeTodos.filter { $0.priority != "urgent" && $0.priority != "high" }

                if !urgent.isEmpty {
                    sectionHeader("Priority", icon: "flame.fill", color: "#FF9500")
                    ForEach(urgent) { todo in
                        todoWithSuggestion(todo)
                    }
                }

                if !rest.isEmpty {
                    if !urgent.isEmpty {
                        sectionHeader("Queue", icon: "tray.full", color: "#E7FC44")
                    }
                    ForEach(rest) { todo in
                        todoWithSuggestion(todo)
                    }
                }

                // Completed section
                if !completedTodos.isEmpty {
                    completedSection
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .padding(.bottom, 60)
        }
        .refreshable { await loadTodos() }
    }

    // MARK: - Completed Section

    private var completedSection: some View {
        VStack(spacing: 6) {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) { showCompleted.toggle() }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 12))
                        .foregroundColor(.white.opacity(0.3))
                    Text("COMPLETED")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.white.opacity(0.3))
                        .tracking(0.8)
                    Text("\(completedTodos.count)")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.white.opacity(0.2))
                        .padding(.horizontal, 5)
                        .padding(.vertical, 1)
                        .background(Color.white.opacity(0.06))
                        .clipShape(Capsule())
                    Spacer()
                    Image(systemName: showCompleted ? "chevron.up" : "chevron.down")
                        .font(.system(size: 11))
                        .foregroundColor(.white.opacity(0.2))
                }
                .padding(.top, 12)
            }
            .buttonStyle(.plain)

            if showCompleted {
                ForEach(completedTodos) { todo in
                    completedRow(todo)
                }
            }
        }
    }

    private func completedRow(_ todo: TodoItem) -> some View {
        HStack(spacing: 12) {
            Button {
                Task { await reopen(todo) }
            } label: {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 20))
                    .foregroundColor(Color(hex: "#E7FC44").opacity(0.5))
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(todo.text)
                    .font(.system(size: 14))
                    .foregroundColor(.white.opacity(0.25))
                    .strikethrough(true, color: .white.opacity(0.15))
                    .lineLimit(2)

                HStack(spacing: 8) {
                    if let proj = todo.projectName, !proj.isEmpty {
                        Text(proj)
                            .font(.system(size: 11))
                            .foregroundColor(.white.opacity(0.15))
                            .lineLimit(1)
                    }
                    if let date = todo.completedAt ?? todo.updatedAt {
                        Text(formatRelative(date))
                            .font(.system(size: 11))
                            .foregroundColor(.white.opacity(0.12))
                    }
                }
            }

            Spacer()
        }
        .padding(12)
        .background(Color(hex: "#1a1a1a").opacity(0.5))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .contextMenu {
            Button { Task { await reopen(todo) } } label: {
                Label("Reopen", systemImage: "arrow.uturn.backward")
            }
            Divider()
            Button(role: .destructive) { Task { await delete(todo) } } label: {
                Label("Delete", systemImage: "trash")
            }
        }
    }

    // MARK: - Active Todo Row

    private func todoRow(_ todo: TodoItem) -> some View {
        HStack(spacing: 12) {
            Button {
                Task { await toggleDone(todo) }
            } label: {
                Image(systemName: todo.isDone ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 20))
                    .foregroundColor(todo.isDone ? Color(hex: "#E7FC44") : .white.opacity(0.3))
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(todo.text)
                    .font(.system(size: 14))
                    .foregroundColor(todo.isDone ? .white.opacity(0.3) : .white)
                    .strikethrough(todo.isDone)
                    .lineLimit(3)

                HStack(spacing: 8) {
                    if let proj = todo.projectName, !proj.isEmpty {
                        Text(proj)
                            .font(.system(size: 11))
                            .foregroundColor(.white.opacity(0.3))
                            .lineLimit(1)
                    }
                    if todo.sourceType == "extracted" {
                        Text("from memory")
                            .font(.system(size: 10))
                            .foregroundColor(.white.opacity(0.2))
                            .padding(.horizontal, 5)
                            .padding(.vertical, 1)
                            .background(Color.white.opacity(0.06))
                            .clipShape(Capsule())
                    }
                }
            }

            Spacer(minLength: 4)

            if todo.priority != "medium" && todo.priority != "low" {
                Circle()
                    .fill(Color(hex: todo.priorityColor))
                    .frame(width: 6, height: 6)
            }
        }
        .padding(12)
        .background(Color(hex: "#1a1a1a"))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(Color.white.opacity(0.04), lineWidth: 1)
        )
        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
            Button(role: .destructive) {
                Task { await delete(todo) }
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
        .swipeActions(edge: .leading, allowsFullSwipe: true) {
            Button {
                Task { await snooze(todo) }
            } label: {
                Label("Snooze", systemImage: "moon.zzz")
            }
            .tint(.purple)
        }
        .contextMenu {
            Button { Task { await toggleDone(todo) } } label: {
                Label("Complete", systemImage: "checkmark")
            }
            Button { Task { await snooze(todo) } } label: {
                Label("Snooze 1 day", systemImage: "moon.zzz")
            }
            if todo.priority != "urgent" {
                Button { Task { await setPriority(todo, "urgent") } } label: {
                    Label("Mark Urgent", systemImage: "exclamationmark.triangle")
                }
            }
            Divider()
            Button(role: .destructive) { Task { await delete(todo) } } label: {
                Label("Delete", systemImage: "trash")
            }
        }
    }

    // MARK: - Suggestion Banner

    @ViewBuilder
    private func todoWithSuggestion(_ todo: TodoItem) -> some View {
        let suggestion = suggestions.first(where: { $0.todoId == todo.id })
        if let suggestion {
            suggestionBanner(suggestion)
        }
        todoRow(todo)
    }

    private func suggestionBanner(_ suggestion: TodoSuggestion) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "sparkles")
                    .font(.system(size: 11))
                    .foregroundColor(Color(hex: "#E7FC44"))
                Text("Looks like you shipped this")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Color(hex: "#E7FC44"))
            }

            Text("\"\(suggestion.completionText)\"")
                .font(.system(size: 13))
                .foregroundColor(.white.opacity(0.7))
                .italic()
                .lineLimit(2)

            if let title = suggestion.memoryTitle {
                Text("from: \(title)")
                    .font(.system(size: 11))
                    .foregroundColor(.white.opacity(0.25))
                    .lineLimit(1)
            }

            HStack(spacing: 12) {
                Button {
                    Task { await acceptSuggestion(suggestion) }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "checkmark")
                            .font(.system(size: 11, weight: .bold))
                        Text("Mark done")
                            .font(.system(size: 12, weight: .semibold))
                    }
                    .foregroundColor(.black)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Color(hex: "#E7FC44"))
                    .clipShape(Capsule())
                }

                Button {
                    Task { await dismissSuggestion(suggestion) }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "xmark")
                            .font(.system(size: 10))
                        Text("Dismiss")
                            .font(.system(size: 12))
                    }
                    .foregroundColor(.white.opacity(0.4))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Color.white.opacity(0.06))
                    .clipShape(Capsule())
                }
            }
        }
        .padding(12)
        .background(Color(hex: "#1a1a1a"))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(Color(hex: "#E7FC44").opacity(0.3), lineWidth: 1)
        )
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "brain.head.profile")
                .font(.system(size: 36))
                .foregroundColor(.white.opacity(0.15))
            Text("Your thinking space")
                .font(.system(size: 15))
                .foregroundColor(.white.opacity(0.3))
            Text("Add todos from projects or type below")
                .font(.system(size: 13))
                .foregroundColor(.white.opacity(0.2))
            Spacer()
        }
    }

    // MARK: - Add Bar

    private var addBar: some View {
        HStack(spacing: 10) {
            ZStack(alignment: .leading) {
                if newTodoText.isEmpty {
                    Text(placeholders[placeholderIndex])
                        .font(.system(size: 15))
                        .foregroundColor(.white.opacity(0.3))
                        .padding(.leading, 14)
                        .animation(.easeInOut(duration: 0.3), value: placeholderIndex)
                        .transition(.opacity)
                        .id(placeholderIndex)
                }
                TextField("", text: $newTodoText)
                    .font(.system(size: 15))
                    .foregroundColor(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
            }
            .background(Color(hex: "#1a1a1a"))
            .clipShape(RoundedRectangle(cornerRadius: 20))
            .onReceive(Timer.publish(every: 3, on: .main, in: .common).autoconnect()) { _ in
                if newTodoText.isEmpty {
                    withAnimation(.easeInOut(duration: 0.3)) {
                        placeholderIndex = (placeholderIndex + 1) % placeholders.count
                    }
                }
            }

            if !newTodoText.trimmingCharacters(in: .whitespaces).isEmpty {
                Button { addTodo() } label: {
                    Image(systemName: "plus.circle.fill")
                        .font(.system(size: 28))
                        .foregroundColor(Color(hex: "#E7FC44"))
                }
            } else {
                Button {
                    if isRecording { stopRecording() } else { startRecording() }
                } label: {
                    Image(systemName: isRecording ? "waveform" : "mic.fill")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(isRecording ? .black : .white.opacity(0.6))
                        .symbolEffect(.variableColor.iterative, isActive: isRecording)
                        .frame(width: 36, height: 36)
                        .background(isRecording ? Color(hex: "#E7FC44") : Color(hex: "#1a1a1a"))
                        .clipShape(Circle())
                        .overlay(
                            Circle()
                                .stroke(isRecording ? Color.clear : Color.white.opacity(0.08), lineWidth: 1)
                        )
                        .animation(.easeInOut(duration: 0.2), value: isRecording)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .onChange(of: voiceService.transcript) { _, newValue in
            if !newValue.isEmpty {
                newTodoText = newValue
            }
        }
    }

    private func startRecording() {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        isRecording = true
        voiceService.startListening()
    }

    private func stopRecording() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        isRecording = false
        voiceService.stopListening()
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
        return ""
    }

    // MARK: - Actions

    private func loadTodos() async {
        isLoading = todos.isEmpty && completedTodos.isEmpty
        let api = PurmemoAPI(authService: authService)
        do {
            async let activeFetch = api.getTodos()
            async let allFetch = api.getAllTodos()
            async let suggestionsFetch = api.getTodoSuggestions()
            let (active, all, suggs) = try await (activeFetch, allFetch, suggestionsFetch)
            todos = active
            completedTodos = all.filter { $0.isDone }
            suggestions = suggs
        } catch {
            // Keep existing on error
        }
        isLoading = false
    }

    private func addTodo() {
        if isRecording { stopRecording() }
        let text = newTodoText.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        newTodoText = ""
        Task {
            let api = PurmemoAPI(authService: authService)
            do {
                let todo = try await api.createTodo(text: text)
                withAnimation { todos.insert(todo, at: 0) }
            } catch {}
        }
    }

    private func toggleDone(_ todo: TodoItem) async {
        let api = PurmemoAPI(authService: authService)
        do {
            try await api.updateTodo(id: todo.id, status: "done")
            if let idx = todos.firstIndex(where: { $0.id == todo.id }) {
                // Show checkmark + strikethrough
                withAnimation { todos[idx].status = "done" }
                // Move to completed after delay
                try? await Task.sleep(nanoseconds: 1_500_000_000)
                if let removeIdx = todos.firstIndex(where: { $0.id == todo.id }) {
                    var completed = todos[removeIdx]
                    completed.status = "done"
                    withAnimation {
                        todos.remove(at: removeIdx)
                        completedTodos.insert(completed, at: 0)
                    }
                }
            }
        } catch {}
    }

    private func reopen(_ todo: TodoItem) async {
        let api = PurmemoAPI(authService: authService)
        do {
            try await api.updateTodo(id: todo.id, status: "pending")
            if let idx = completedTodos.firstIndex(where: { $0.id == todo.id }) {
                var reopened = completedTodos[idx]
                reopened.status = "pending"
                withAnimation {
                    completedTodos.remove(at: idx)
                    todos.append(reopened)
                }
            }
        } catch {}
    }

    private func snooze(_ todo: TodoItem) async {
        let api = PurmemoAPI(authService: authService)
        let tomorrow = ISO8601DateFormatter().string(from: Date().addingTimeInterval(86400))
        do {
            try await api.updateTodo(id: todo.id, snoozedUntil: tomorrow)
            if let idx = todos.firstIndex(where: { $0.id == todo.id }) {
                withAnimation { todos.remove(at: idx) }
            }
        } catch {}
    }

    private func setPriority(_ todo: TodoItem, _ priority: String) async {
        let api = PurmemoAPI(authService: authService)
        do {
            try await api.updateTodo(id: todo.id, priority: priority)
            await loadTodos()
        } catch {}
    }

    private func delete(_ todo: TodoItem) async {
        let api = PurmemoAPI(authService: authService)
        do {
            try await api.deleteTodo(id: todo.id)
            if let idx = todos.firstIndex(where: { $0.id == todo.id }) {
                withAnimation { todos.remove(at: idx) }
            }
            if let idx = completedTodos.firstIndex(where: { $0.id == todo.id }) {
                withAnimation { completedTodos.remove(at: idx) }
            }
        } catch {}
    }

    private func acceptSuggestion(_ suggestion: TodoSuggestion) async {
        let api = PurmemoAPI(authService: authService)
        do {
            try await api.resolveSuggestion(id: suggestion.id, accept: true)
            withAnimation {
                suggestions.removeAll { $0.id == suggestion.id }
                // Move todo to completed
                if let idx = todos.firstIndex(where: { $0.id == suggestion.todoId }) {
                    var completed = todos[idx]
                    completed.status = "done"
                    todos.remove(at: idx)
                    completedTodos.insert(completed, at: 0)
                }
            }
        } catch {}
    }

    private func dismissSuggestion(_ suggestion: TodoSuggestion) async {
        let api = PurmemoAPI(authService: authService)
        do {
            try await api.resolveSuggestion(id: suggestion.id, accept: false)
            withAnimation { suggestions.removeAll { $0.id == suggestion.id } }
        } catch {}
    }
}
