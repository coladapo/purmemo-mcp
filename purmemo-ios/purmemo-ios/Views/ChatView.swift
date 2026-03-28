import SwiftUI

struct ChatView: View {
    var authService: AuthService
    @State private var viewModel: ChatViewModel
    @State private var composerText = ""
    @State private var scrollProxy: ScrollViewProxy? = nil

    init(authService: AuthService) {
        self.authService = authService
        _viewModel = State(wrappedValue: ChatViewModel(authService: authService))
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            Color.black.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                messageList
                ComposerView(
                    text: $composerText,
                    isLoading: viewModel.isLoading,
                    onSend: sendMessage
                )
                .background(Color.black)
            }
        }
        .preferredColorScheme(.dark)
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Image("PurmemoWordmark")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(height: 34)
                Text(authService.userEmail)
                    .font(.system(size: 12))
                    .foregroundColor(.white.opacity(0.4))
            }

            Spacer()

            Button(action: authService.logout) {
                Image(systemName: "rectangle.portrait.and.arrow.right")
                    .font(.system(size: 18))
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

    // MARK: - Message List

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 8) {
                    ForEach(viewModel.messages) { message in
                        MessageBubble(message: message)
                            .id(message.id)
                            .padding(.horizontal, 12)
                            .transition(.opacity.combined(with: .move(edge: .bottom)))
                    }

                    if viewModel.isLoading {
                        TypingIndicator()
                            .padding(.horizontal, 24)
                            .transition(.opacity)
                    }

                    // Scroll anchor
                    Color.clear.frame(height: 1).id("bottom")
                }
                .padding(.vertical, 12)
                .animation(.easeOut(duration: 0.2), value: viewModel.messages.count)
                .animation(.easeOut(duration: 0.2), value: viewModel.isLoading)
            }
            .onAppear { scrollProxy = proxy }
            .onChange(of: viewModel.messages.count) {
                // Small delay so user can still scroll up; only auto-scroll for new messages
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                    withAnimation { proxy.scrollTo("bottom", anchor: .bottom) }
                }
            }
        }
    }

    // MARK: - Send

    private func sendMessage() {
        let text = composerText.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        composerText = ""
        Task { await viewModel.send(text) }
    }
}

// MARK: - Typing Indicator

struct TypingIndicator: View {
    @State private var phase = 0

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3) { i in
                Circle()
                    .frame(width: 7, height: 7)
                    .foregroundColor(.white.opacity(phase == i ? 0.9 : 0.3))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color(hex: "#1a1a1a"))
        .clipShape(BubbleShape(isUser: false))
        .onAppear { animateDots() }
    }

    private func animateDots() {
        Timer.scheduledTimer(withTimeInterval: 0.4, repeats: true) { _ in
            withAnimation(.easeInOut(duration: 0.3)) {
                phase = (phase + 1) % 3
            }
        }
    }
}
