import SwiftUI

struct RecallResultBubble: View {
    let memories: [RecallMemory]
    let onTap: (RecallMemory) -> Void

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Found \(memories.count) memor\(memories.count == 1 ? "y" : "ies")")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.white.opacity(0.5))
                    .padding(.leading, 4)
                    .padding(.bottom, 2)

                ForEach(memories) { memory in
                    Button { onTap(memory) } label: {
                        HStack(spacing: 10) {
                            Circle()
                                .fill(Color(hex: "#E7FC44"))
                                .frame(width: 6, height: 6)

                            VStack(alignment: .leading, spacing: 3) {
                                Text(memory.title ?? "Untitled")
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundColor(.white)
                                    .lineLimit(1)

                                Text(snippet(memory.content))
                                    .font(.system(size: 12))
                                    .foregroundColor(.white.opacity(0.4))
                                    .lineLimit(2)
                            }

                            Spacer(minLength: 4)

                            Image(systemName: "chevron.right")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundColor(.white.opacity(0.2))
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 10)
                        .background(Color.white.opacity(0.04))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(Color.white.opacity(0.06), lineWidth: 1)
                        )
                    }
                }
            }
            .padding(12)
            .background(Color(hex: "#1a1a1a"))
            .clipShape(BubbleShape(isUser: false))

            Spacer(minLength: 24)
        }
    }

    private func snippet(_ content: String) -> String {
        let lines = content
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { $0.count > 10 && !$0.hasPrefix("===") && !$0.hasPrefix("---") && !$0.hasPrefix("[") }

        let text = lines.first ?? ""
        return String(text.prefix(100))
    }
}
