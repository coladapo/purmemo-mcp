import SwiftUI

/// Page-level loading — purmemo ring with smooth rotation
struct RingLoader: View {
    var size: CGFloat = 60
    @State private var rotating = false

    var body: some View {
        Image("PurmemoRing")
            .resizable()
            .interpolation(.high)
            .aspectRatio(contentMode: .fit)
            .frame(width: size, height: size)
            .rotationEffect(.degrees(rotating ? 360 : 0))
            .onAppear {
                withAnimation(.linear(duration: 2.0).repeatForever(autoreverses: false)) {
                    rotating = true
                }
            }
    }
}

/// Card-level placeholder — simple static dark card, no animation
struct SkeletonPulse: View {
    var body: some View {
        Color(hex: "#141414")
    }
}
