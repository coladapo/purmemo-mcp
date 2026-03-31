import SwiftUI

/// Glass tile matching Figma visionOS design:
/// - border: 1.4px rgba(255,255,255,0.4)
/// - background: rgba(149,149,149,0.25)
/// - border-radius: 16px
/// - Memory count size scales with actual count
struct GlassTileView: View {
    let project: ProjectItem
    var isActiveToday: Bool = false
    var isActiveThisWeek: Bool = false
    let appearDelay: Double
    let onTap: () -> Void

    @State private var appeared = false

    private let cornerRadius: CGFloat = 16

    /// Memory count font size scales with the count:
    /// 1000+ → 28pt, 100+ → 22pt, 50+ → 18pt, 20+ → 15pt, else → 13pt
    private var countFontSize: CGFloat {
        let count = project.memoryCount
        if count >= 500 { return 28 }
        if count >= 100 { return 24 }
        if count >= 50 { return 20 }
        if count >= 20 { return 16 }
        return 13
    }

    /// Name font size — larger for bigger projects
    private var nameFontSize: CGFloat {
        let count = project.memoryCount
        if count >= 500 { return 18 }
        if count >= 50 { return 16 }
        return 14
    }

    /// Show "memories" label for bigger projects
    private var showMemoriesLabel: Bool {
        project.memoryCount >= 15
    }

    var body: some View {
        ZStack {
            // Glass body
            RoundedRectangle(cornerRadius: cornerRadius)
                .fill(Color(red: 0.584, green: 0.584, blue: 0.584).opacity(0.25))

            // Border
            RoundedRectangle(cornerRadius: cornerRadius)
                .stroke(Color.white.opacity(0.4), lineWidth: 1.4)

            // Content
            VStack(spacing: 3) {
                Spacer(minLength: 0)

                Text(project.name)
                    .font(.system(size: nameFontSize, weight: .bold))
                    .foregroundColor(.white.opacity(0.96))
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                    .minimumScaleFactor(0.6)

                HStack(spacing: 4) {
                    Text("\(project.memoryCount)")
                        .font(.system(size: countFontSize, weight: .heavy))
                        .foregroundColor(Color(hex: "#E7FC44"))
                    if showMemoriesLabel {
                        Text("memories")
                            .font(.system(size: max(countFontSize * 0.5, 9)))
                            .foregroundColor(.white.opacity(0.35))
                    }
                }

                if project.openItems > 0 {
                    Text("\(project.openItems) open")
                        .font(.system(size: max(countFontSize * 0.45, 9)))
                        .foregroundColor(Color(hex: "#FF9500").opacity(0.8))
                }

                Spacer(minLength: 0)
            }
            .padding(12)

            // Blocker dot
            if project.blockerCount > 0 {
                Circle()
                    .fill(Color(hex: "#FF3B30"))
                    .frame(width: 8, height: 8)
                    .shadow(color: Color(hex: "#FF3B30").opacity(0.5), radius: 3)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                    .padding(8)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
        .contentShape(RoundedRectangle(cornerRadius: cornerRadius))
        .onTapGesture { onTap() }
        .scaleEffect(appeared ? 1 : 0.92)
        .opacity(appeared ? 1 : 0)
        .onAppear {
            DispatchQueue.main.asyncAfter(deadline: .now() + appearDelay) {
                withAnimation(.spring(response: 0.4, dampingFraction: 0.78)) {
                    appeared = true
                }
            }
        }
    }
}
