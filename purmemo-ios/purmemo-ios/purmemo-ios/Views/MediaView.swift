import SwiftUI

struct MediaView: View {
    var authService: AuthService
    @State private var items: [MediaItem] = []
    @State private var isLoading = true
    @State private var hasMore = false
    @State private var page = 1
    @State private var showImagePicker = false
    @State private var selectedItem: MediaItem?
    @State private var showSettings = false
    @Namespace private var heroNamespace

    private let gap: CGFloat = 6
    private let hPad: CGFloat = 6

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            // Grid layer
            VStack(spacing: 0) {
                header

                if isLoading && items.isEmpty {
                    Spacer()
                    RingLoader(size: 56)
                    Spacer()
                } else if items.isEmpty {
                    emptyState
                } else {
                    masonryGrid
                }
            }
            .opacity(selectedItem != nil ? 0 : 1)

            // FAB
            if selectedItem == nil {
                VStack {
                    Spacer()
                    HStack {
                        Spacer()
                        Button { showImagePicker = true } label: {
                            Image(systemName: "plus")
                                .font(.system(size: 20, weight: .semibold))
                                .foregroundColor(.black)
                                .frame(width: 52, height: 52)
                                .background(Color(hex: "#E7FC44"))
                                .clipShape(Circle())
                                .shadow(color: Color(hex: "#E7FC44").opacity(0.3), radius: 8, y: 4)
                        }
                        .padding(.trailing, 20)
                        .padding(.bottom, 20)
                    }
                }
            }

            // Detail overlay — zooms in from grid position
            if let item = selectedItem {
                MediaDetailView(
                    item: item,
                    authService: authService,
                    namespace: heroNamespace,
                    onDismiss: {
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.88)) {
                            selectedItem = nil
                        }
                    }
                )
                .zIndex(1)
                .transition(.identity)
            }
        }
        .preferredColorScheme(.dark)
        .toolbar(selectedItem != nil ? .hidden : .visible, for: .tabBar)
        .animation(.easeInOut(duration: 0.25), value: selectedItem != nil)
        .task { await loadData() }
        .fullScreenCover(isPresented: $showImagePicker) {
            ImagePickerView(authService: authService)
        }
        .onChange(of: showImagePicker) { _, isShowing in
            if !isShowing {
                Task { page = 1; await loadData() }
            }
        }
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
                Text("Media & Bookmarks")
                    .font(.system(size: 12))
                    .foregroundColor(.white.opacity(0.4))
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
    }

    // MARK: - Masonry Grid

    private var colWidth: CGFloat {
        (UIScreen.main.bounds.width - hPad * 2 - gap) / 2
    }

    private var masonryGrid: some View {
        ScrollView(showsIndicators: false) {
            HStack(alignment: .top, spacing: gap) {
                LazyVStack(spacing: gap) {
                    ForEach(leftColumn) { item in
                        masonryCell(item, width: colWidth)
                    }
                }
                .frame(width: colWidth)

                LazyVStack(spacing: gap) {
                    ForEach(rightColumn) { item in
                        masonryCell(item, width: colWidth)
                    }
                }
                .frame(width: colWidth)
            }
            .padding(.horizontal, hPad)
            .padding(.top, gap)
            .padding(.bottom, 80)

            if hasMore {
                Button {
                    Task { page += 1; await loadData() }
                } label: {
                    Text("Load More")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(Color(hex: "#E7FC44"))
                        .padding(.vertical, 12)
                        .frame(maxWidth: .infinity)
                }
            }
        }
        .refreshable { page = 1; await loadData() }
    }

    private var leftColumn: [MediaItem] {
        items.enumerated().compactMap { $0.offset % 2 == 0 ? $0.element : nil }
    }

    private var rightColumn: [MediaItem] {
        items.enumerated().compactMap { $0.offset % 2 == 1 ? $0.element : nil }
    }

    private func cellHeight(for item: MediaItem) -> CGFloat {
        let hash = abs(item.id.hashValue)
        let heights: [CGFloat] = [180, 220, 260, 300, 240, 200, 280, 190]
        return heights[hash % heights.count]
    }

    // MARK: - Masonry Cell

    private func masonryCell(_ item: MediaItem, width: CGFloat) -> some View {
        let h = cellHeight(for: item)

        return ZStack(alignment: .topTrailing) {
            if let thumbUrl = item.thumbnailUrl, let url = URL(string: thumbUrl) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                    case .failure:
                        placeholderContent(item)
                    case .empty:
                        SkeletonPulse()
                    @unknown default:
                        placeholderContent(item)
                    }
                }
            } else {
                placeholderContent(item)
            }

            if item.mediaTypeIcon == "play.rectangle" {
                Image(systemName: "play.fill")
                    .font(.system(size: 10))
                    .foregroundColor(.white)
                    .padding(6)
                    .background(.black.opacity(0.5))
                    .clipShape(Circle())
                    .padding(8)
            }

            if item.imageCount > 1 {
                HStack(spacing: 2) {
                    Image(systemName: "square.on.square")
                        .font(.system(size: 8))
                    Text("\(item.imageCount)")
                        .font(.system(size: 9, weight: .bold))
                }
                .foregroundColor(.white)
                .padding(.horizontal, 6)
                .padding(.vertical, 3)
                .background(.black.opacity(0.5))
                .clipShape(Capsule())
                .padding(8)
            }
        }
        .frame(width: width, height: h)
        .clipped()
        .matchedGeometryEffect(id: item.id, in: heroNamespace, isSource: selectedItem?.id != item.id)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(
                    LinearGradient(
                        colors: [
                            Color.white.opacity(0.3),
                            Color(hex: "#8B9FD4").opacity(0.35),
                            Color(hex: "#6B7DB3").opacity(0.3),
                            Color.white.opacity(0.2)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: 1
                )
        )
        .contentShape(RoundedRectangle(cornerRadius: 8))
        .onTapGesture {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.88)) {
                selectedItem = item
            }
        }
    }

    private func placeholderContent(_ item: MediaItem) -> some View {
        Color(hex: "#1a1a1a")
            .overlay(
                VStack(spacing: 6) {
                    Image(systemName: item.mediaTypeIcon)
                        .font(.system(size: 22))
                        .foregroundColor(Color(hex: "#E7FC44").opacity(0.2))
                    if let badge = item.sourceBadge {
                        Text(badge)
                            .font(.system(size: 10))
                            .foregroundColor(.white.opacity(0.2))
                    }
                }
            )
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "photo.on.rectangle.angled")
                .font(.system(size: 40))
                .foregroundColor(.white.opacity(0.12))
            Text("No media yet")
                .font(.system(size: 16, weight: .medium))
                .foregroundColor(.white.opacity(0.3))
            Text("Share photos, videos, and links to purmemo\nfrom any app, or tap + to add")
                .font(.system(size: 13))
                .foregroundColor(.white.opacity(0.2))
                .multilineTextAlignment(.center)
            Button { showImagePicker = true } label: {
                Text("Add Photos")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.black)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 10)
                    .background(Color(hex: "#E7FC44"))
                    .clipShape(Capsule())
            }
            .padding(.top, 4)
            Spacer()
        }
    }

    // MARK: - Data Loading

    private func loadData() async {
        if page == 1 && items.isEmpty { isLoading = true }
        let api = PurmemoAPI(authService: authService)
        do {
            let response = try await api.getMediaItems(page: page, pageSize: 40)
            if page == 1 {
                items = response.items
            } else {
                items.append(contentsOf: response.items)
            }
            hasMore = response.hasMore
        } catch {
            if page == 1 { items = [] }
        }
        isLoading = false
    }
}
