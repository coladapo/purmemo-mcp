import SwiftUI

struct MessageBubble: View {
    let message: Message

    private var isUser: Bool { message.role == .user }

    private var isLongMessage: Bool { message.content.count > 100 }

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if isUser { Spacer(minLength: 48) }

            Text(message.content)
                .font(.system(size: isUser ? 16 : (isLongMessage ? 14.5 : 16), weight: .regular))
                .lineSpacing(isLongMessage ? 4 : 2)
                .foregroundColor(isUser ? .black : .white.opacity(0.9))
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(bubbleBackground)
                .clipShape(BubbleShape(isUser: isUser))

            if !isUser { Spacer(minLength: 24) }
        }
    }

    private var bubbleBackground: Color {
        isUser ? Color(hex: "#E7FC44") : Color(hex: "#1a1a1a")
    }
}

// Custom bubble shape with asymmetric corner radius
struct BubbleShape: Shape {
    let isUser: Bool

    func path(in rect: CGRect) -> Path {
        let radius: CGFloat = 18
        let smallRadius: CGFloat = 4

        var path = Path()

        if isUser {
            // User bubble: sharp bottom-right corner
            path.addRoundedRect(
                in: rect,
                cornerRadii: .init(
                    topLeading: radius,
                    bottomLeading: radius,
                    bottomTrailing: smallRadius,
                    topTrailing: radius
                )
            )
        } else {
            // Assistant bubble: sharp bottom-left corner
            path.addRoundedRect(
                in: rect,
                cornerRadii: .init(
                    topLeading: radius,
                    bottomLeading: smallRadius,
                    bottomTrailing: radius,
                    topTrailing: radius
                )
            )
        }

        return path
    }
}

// Hex color extension
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
