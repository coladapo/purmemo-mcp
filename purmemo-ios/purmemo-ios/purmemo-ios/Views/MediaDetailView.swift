import SwiftUI

struct MediaDetailView: View {
    let item: MediaItem
    var authService: AuthService
    var namespace: Namespace.ID
    var onDismiss: () -> Void

    @State private var fullMemory: FullMemory?
    @State private var imageUrls: [String] = []
    @State private var isLoading = true
    @State private var selectedImageIndex = 0
    @State private var showSheet = true
    @GestureState private var pullDown: CGFloat = 0

    private var pullProgress: CGFloat {
        min(pullDown / 200, 1)
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            Color.black.ignoresSafeArea()

            // Full-bleed media
            if isLoading {
                thumbnailPreview
                    .matchedGeometryEffect(id: item.id, in: namespace, isSource: true)
                    .ignoresSafeArea()
            } else {
                mediaPreview
                    .matchedGeometryEffect(id: item.id, in: namespace, isSource: true)
                    .ignoresSafeArea()
            }

            // Close button overlay (top-left)
            VStack {
                HStack {
                    Button {
                        showSheet = false
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                            onDismiss()
                        }
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(.white)
                            .padding(8)
                            .background(.ultraThinMaterial.opacity(0.8))
                            .clipShape(Circle())
                    }
                    Spacer()
                    if !isLoading && imageUrls.count > 1 {
                        Text("\(selectedImageIndex + 1) / \(imageUrls.count)")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(.white.opacity(0.7))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(.ultraThinMaterial.opacity(0.6))
                            .clipShape(Capsule())
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 54)
                Spacer()
            }

            if !isLoading && !showSheet {
                dockedTitle
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .scaleEffect(1 - pullProgress * 0.1)
        .offset(y: pullDown)
        .opacity(1 - Double(pullProgress) * 0.3)
        .gesture(
            showSheet ? nil : DragGesture(minimumDistance: 20)
                .updating($pullDown) { value, state, _ in
                    if value.translation.height > 0 {
                        state = value.translation.height
                    }
                }
                .onEnded { value in
                    if value.translation.height > 120 || value.predictedEndTranslation.height > 300 {
                        onDismiss()
                    }
                }
        )
        .preferredColorScheme(.dark)
        .task { await loadData() }
        .sheet(isPresented: $showSheet) {
            intelligenceSheet
                .presentationDetents([.fraction(0.4), .large])
                .presentationDragIndicator(.visible)
                .presentationBackgroundInteraction(.enabled(upThrough: .fraction(0.4)))
                .presentationCornerRadius(20)
                .presentationBackground(Color(hex: "#1a1a1a"))
                .interactiveDismissDisabled(false)
        }
    }

    // MARK: - Thumbnail (shown immediately while full images load)

    private var thumbnailPreview: some View {
        Group {
            if let thumbUrl = item.thumbnailUrl, let url = URL(string: thumbUrl) {
                AsyncImage(url: url) { phase in
                    if case .success(let image) = phase {
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else {
                        Color(hex: "#0a0a0a")
                            .overlay(RingLoader(size: 40))
                    }
                }
            } else {
                Color(hex: "#0a0a0a")
                    .overlay(RingLoader(size: 40))
            }
        }
        .background(Color(hex: "#0a0a0a"))
    }

    // MARK: - Media Preview

    @ViewBuilder
    private var mediaPreview: some View {
        if !imageUrls.isEmpty {
            imageGallery
        } else if let url = item.sourceUrl {
            linkPreview(url)
        } else {
            thumbnailPreview
        }
    }

    private var imageGallery: some View {
        TabView(selection: $selectedImageIndex) {
            ForEach(Array(imageUrls.enumerated()), id: \.offset) { index, urlString in
                if let url = URL(string: urlString) {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image
                                .resizable()
                                .aspectRatio(contentMode: .fit)
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                        case .failure:
                            imagePlaceholder
                        case .empty:
                            SkeletonPulse()
                        @unknown default:
                            imagePlaceholder
                        }
                    }
                    .tag(index)
                }
            }
        }
        .tabViewStyle(.page(indexDisplayMode: imageUrls.count > 1 ? .always : .never))
        .background(Color(hex: "#0a0a0a"))
    }

    private var imagePlaceholder: some View {
        Color(hex: "#0a0a0a")
            .overlay(
                Image(systemName: "photo")
                    .font(.system(size: 32))
                    .foregroundColor(.white.opacity(0.15))
            )
    }

    // MARK: - Link Preview

    private var isVideoLink: Bool {
        guard let url = item.sourceUrl?.lowercased() else { return false }
        return url.contains("youtube") || url.contains("youtu.be") || url.contains("tiktok") || url.contains("vimeo") || url.contains("instagram.com/reel")
    }

    private func linkPreview(_ urlString: String) -> some View {
        ZStack {
            if let thumb = item.thumbnailUrl, let thumbURL = URL(string: thumb) {
                AsyncImage(url: thumbURL) { phase in
                    if case .success(let image) = phase {
                        image.resizable()
                            .aspectRatio(contentMode: .fit)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else {
                        Color(hex: "#0a0a0a")
                    }
                }
                if isVideoLink {
                    Circle()
                        .fill(.black.opacity(0.5))
                        .frame(width: 64, height: 64)
                        .overlay(
                            Image(systemName: "play.fill")
                                .font(.system(size: 26))
                                .foregroundColor(.white)
                                .offset(x: 2)
                        )
                }
            } else {
                VStack(spacing: 12) {
                    Image(systemName: item.mediaTypeIcon)
                        .font(.system(size: 40))
                        .foregroundColor(.white.opacity(0.15))
                    Text(isVideoLink ? "Tap to play" : "Tap to open")
                        .font(.system(size: 13))
                        .foregroundColor(.white.opacity(0.25))
                }
            }
        }
        .background(Color(hex: "#0a0a0a"))
        .contentShape(Rectangle())
        .onTapGesture { openLink(urlString) }
    }

    // MARK: - Intelligence Sheet

    private var intelligenceSheet: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let title = item.title ?? fullMemory?.title, !title.isEmpty {
                    Text(title)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.white)
                }

                HStack(spacing: 8) {
                    if let date = item.createdAt {
                        Label(formatDate(date), systemImage: "clock")
                            .font(.system(size: 12))
                            .foregroundColor(.white.opacity(0.35))
                    }
                    if let badge = item.sourceBadge {
                        Text(badge)
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(.white.opacity(0.5))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.white.opacity(0.08))
                            .clipShape(Capsule())
                    }
                    Spacer()
                }

                if let urlString = item.sourceUrl {
                    Button { openLink(urlString) } label: {
                        HStack(spacing: 5) {
                            Image(systemName: isVideoLink ? "play.fill" : "arrow.up.right.square")
                                .font(.system(size: 12))
                            Text(isVideoLink ? "Play" : "Open Link")
                                .font(.system(size: 13, weight: .medium))
                            Spacer()
                            Text(shortenUrl(urlString))
                                .font(.system(size: 11))
                                .foregroundColor(.white.opacity(0.25))
                                .lineLimit(1)
                        }
                        .foregroundColor(Color(hex: "#E7FC44"))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 11)
                        .background(Color(hex: "#E7FC44").opacity(0.08))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                    .buttonStyle(.plain)
                }

                if let fm = fullMemory {
                    if !fm.observations.isEmpty {
                        Divider().overlay(Color.white.opacity(0.06))
                        insightsSection(fm.observations)
                    }
                    if !fm.entities.isEmpty { entitiesRow(fm.entities) }
                    if !fm.technologies.isEmpty { techRow(fm.technologies) }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 40)
        }
    }

    // MARK: - Docked Title

    private var dockedTitle: some View {
        Button { withAnimation { showSheet = true } } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    if let title = item.title ?? fullMemory?.title, !title.isEmpty {
                        Text(title)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(.white)
                            .lineLimit(1)
                    }
                    HStack(spacing: 6) {
                        if let date = item.createdAt {
                            Text(formatDate(date))
                                .font(.system(size: 11))
                                .foregroundColor(.white.opacity(0.3))
                        }
                        if let badge = item.sourceBadge {
                            Text(badge)
                                .font(.system(size: 10, weight: .medium))
                                .foregroundColor(.white.opacity(0.4))
                        }
                    }
                }
                Spacer()
                Image(systemName: "chevron.up")
                    .font(.system(size: 11))
                    .foregroundColor(.white.opacity(0.3))
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 14)
            .background(Color(hex: "#1a1a1a").shadow(.drop(color: .black.opacity(0.3), radius: 8, y: -2)))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Intelligence Sections

    private func insightsSection(_ obs: [MemoryObservation]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 4) {
                Image(systemName: "lightbulb").font(.system(size: 10)).foregroundColor(Color(hex: "#E7FC44"))
                Text("KEY INSIGHTS").font(.system(size: 10, weight: .bold)).foregroundColor(Color(hex: "#E7FC44")).tracking(0.5)
            }
            ForEach(obs.prefix(5)) { o in
                HStack(alignment: .top, spacing: 6) {
                    Circle().fill(Color(hex: "#E7FC44").opacity(0.4)).frame(width: 4, height: 4).padding(.top, 6)
                    Text(o.text).font(.system(size: 13)).foregroundColor(.white.opacity(0.8)).lineSpacing(2)
                }
            }
        }
    }

    private func entitiesRow(_ entities: [Entity]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Image(systemName: "person.2").font(.system(size: 10)).foregroundColor(.white.opacity(0.4))
                Text("ENTITIES").font(.system(size: 10, weight: .bold)).foregroundColor(.white.opacity(0.4)).tracking(0.5)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 5) {
                    ForEach(entities.prefix(10)) { e in
                        Text(e.name).font(.system(size: 11, weight: .medium)).foregroundColor(.white.opacity(0.5))
                            .padding(.horizontal, 7).padding(.vertical, 3).background(Color.white.opacity(0.06)).clipShape(Capsule())
                    }
                }
            }
        }
    }

    private func techRow(_ techs: [String]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Image(systemName: "wrench.and.screwdriver").font(.system(size: 10)).foregroundColor(.white.opacity(0.4))
                Text("TECHNOLOGIES").font(.system(size: 10, weight: .bold)).foregroundColor(.white.opacity(0.4)).tracking(0.5)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 5) {
                    ForEach(techs.prefix(8), id: \.self) { t in
                        Text(t).font(.system(size: 11, weight: .medium)).foregroundColor(.white.opacity(0.5))
                            .padding(.horizontal, 7).padding(.vertical, 3).background(Color.white.opacity(0.06)).clipShape(Capsule())
                    }
                }
            }
        }
    }

    // MARK: - Data

    private func loadData() async {
        let api = PurmemoAPI(authService: authService)
        async let memoryTask: FullMemory? = { try? await api.getMemory(id: item.id) }()
        async let imagesTask: [String] = { (try? await api.getMemoryImages(memoryId: item.id)) ?? [] }()
        fullMemory = await memoryTask
        imageUrls = await imagesTask
        isLoading = false
    }

    private func openLink(_ urlString: String) {
        guard let url = URL(string: urlString) else { return }
        UIApplication.shared.open(url)
    }

    private func formatDate(_ dateString: String) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: dateString) { let r = RelativeDateTimeFormatter(); r.unitsStyle = .short; return r.localizedString(for: d, relativeTo: Date()) }
        f.formatOptions = [.withInternetDateTime]
        if let d = f.date(from: dateString) { let r = RelativeDateTimeFormatter(); r.unitsStyle = .short; return r.localizedString(for: d, relativeTo: Date()) }
        return String(dateString.prefix(10))
    }

    private func shortenUrl(_ url: String) -> String {
        var s = url.replacingOccurrences(of: "https://", with: "").replacingOccurrences(of: "http://", with: "").replacingOccurrences(of: "www.", with: "")
        if s.count > 35 { s = String(s.prefix(35)) + "..." }
        return s
    }
}
