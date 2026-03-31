import SwiftUI

struct TileItem: Identifiable {
    let project: ProjectItem
    var id: String { project.name }
}

struct BubbleGridView: View {
    let projects: [ProjectItem]
    let onSelect: (ProjectItem) -> Void

    private let gap: CGFloat = 5

    var body: some View {
        let blocks = Self.buildBlocks(from: projects)

        VStack(spacing: gap) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { blockIdx, block in
                BlockView(block: block, gap: gap, blockIndex: blockIdx, onSelect: onSelect)
            }
        }
    }

    enum Block {
        case heroRow(large: ProjectItem, small: ProjectItem)
        case tripleRow(a: ProjectItem, b: ProjectItem, c: ProjectItem)
        case stackedLeft(topLeft: ProjectItem, bottomLeft: ProjectItem, tallRight: ProjectItem)
        case stackedRight(tallLeft: ProjectItem, topRight: ProjectItem, bottomRight: ProjectItem)
        case wideRow(wide: ProjectItem, small: ProjectItem)
        case fullWidth(project: ProjectItem)
        case doubleRow(a: ProjectItem, b: ProjectItem)
    }

    /// Builds Tetris-like blocks cycling through patterns.
    /// Projects are sorted by memory count — biggest projects get the biggest blocks.
    static func buildBlocks(from projects: [ProjectItem]) -> [Block] {
        guard !projects.isEmpty else { return [] }

        let sorted = projects.sorted { $0.memoryCount > $1.memoryCount }
        var blocks: [Block] = []
        var i = 0
        let count = sorted.count
        var patternIndex = 0

        // Pattern: hero(2) → stacked(3) → triple(3) → wide(2) → triple(3) → stacked(3) → triple(3) → full(1) → repeat
        let patterns = [0, 1, 2, 3, 2, 4, 2, 5]

        while i < count {
            let remaining = count - i
            let pattern = patterns[patternIndex % patterns.count]

            switch pattern {
            case 0: // heroRow: 2 items
                if remaining >= 2 {
                    blocks.append(.heroRow(large: sorted[i], small: sorted[i + 1]))
                    i += 2
                } else {
                    blocks.append(.fullWidth(project: sorted[i])); i += 1
                }

            case 1: // stackedRight: 3 items
                if remaining >= 3 {
                    blocks.append(.stackedRight(tallLeft: sorted[i], topRight: sorted[i + 1], bottomRight: sorted[i + 2]))
                    i += 3
                } else if remaining == 2 {
                    blocks.append(.doubleRow(a: sorted[i], b: sorted[i + 1])); i += 2
                } else {
                    blocks.append(.fullWidth(project: sorted[i])); i += 1
                }

            case 2: // tripleRow: 3 items
                if remaining >= 3 {
                    blocks.append(.tripleRow(a: sorted[i], b: sorted[i + 1], c: sorted[i + 2]))
                    i += 3
                } else if remaining == 2 {
                    blocks.append(.doubleRow(a: sorted[i], b: sorted[i + 1])); i += 2
                } else {
                    blocks.append(.fullWidth(project: sorted[i])); i += 1
                }

            case 3: // wideRow: 2 items
                if remaining >= 2 {
                    blocks.append(.wideRow(wide: sorted[i], small: sorted[i + 1]))
                    i += 2
                } else {
                    blocks.append(.fullWidth(project: sorted[i])); i += 1
                }

            case 4: // stackedLeft: 3 items
                if remaining >= 3 {
                    blocks.append(.stackedLeft(topLeft: sorted[i], bottomLeft: sorted[i + 1], tallRight: sorted[i + 2]))
                    i += 3
                } else if remaining == 2 {
                    blocks.append(.doubleRow(a: sorted[i], b: sorted[i + 1])); i += 2
                } else {
                    blocks.append(.fullWidth(project: sorted[i])); i += 1
                }

            case 5: // fullWidth: 1 item
                blocks.append(.fullWidth(project: sorted[i]))
                i += 1

            default: break
            }
            patternIndex += 1
        }
        return blocks
    }
}

// MARK: - Block View

struct BlockView: View {
    let block: BubbleGridView.Block
    let gap: CGFloat
    let blockIndex: Int
    let onSelect: (ProjectItem) -> Void

    var body: some View {
        switch block {
        case .heroRow(let large, let small):
            GeometryReader { geo in
                let largeW = (geo.size.width - gap) * 2 / 3
                let smallW = (geo.size.width - gap) / 3
                HStack(spacing: gap) {
                    tile(large).frame(width: largeW, height: geo.size.height)
                    tile(small).frame(width: smallW, height: geo.size.height)
                }
            }
            .frame(height: 170)

        case .tripleRow(let a, let b, let c):
            HStack(spacing: gap) {
                tile(a).frame(maxWidth: .infinity)
                tile(b).frame(maxWidth: .infinity)
                tile(c).frame(maxWidth: .infinity)
            }
            .frame(height: 110)

        case .stackedLeft(let topLeft, let bottomLeft, let tallRight):
            HStack(spacing: gap) {
                VStack(spacing: gap) {
                    tile(topLeft).frame(maxWidth: .infinity, maxHeight: .infinity)
                    tile(bottomLeft).frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                tile(tallRight).frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .frame(height: 225)

        case .stackedRight(let tallLeft, let topRight, let bottomRight):
            HStack(spacing: gap) {
                tile(tallLeft).frame(maxWidth: .infinity, maxHeight: .infinity)
                VStack(spacing: gap) {
                    tile(topRight).frame(maxWidth: .infinity, maxHeight: .infinity)
                    tile(bottomRight).frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .frame(height: 225)

        case .wideRow(let wide, let small):
            GeometryReader { geo in
                let wideW = (geo.size.width - gap) * 2 / 3
                let smallW = (geo.size.width - gap) / 3
                HStack(spacing: gap) {
                    tile(wide).frame(width: wideW, height: geo.size.height)
                    tile(small).frame(width: smallW, height: geo.size.height)
                }
            }
            .frame(height: 130)

        case .fullWidth(let project):
            tile(project)
                .frame(maxWidth: .infinity)
                .frame(height: 80)

        case .doubleRow(let a, let b):
            HStack(spacing: gap) {
                tile(a).frame(maxWidth: .infinity)
                tile(b).frame(maxWidth: .infinity)
            }
            .frame(height: 100)
        }
    }

    private func tile(_ project: ProjectItem) -> some View {
        GlassTileView(
            project: project,
            appearDelay: Double(blockIndex) * 0.04,
            onTap: { onSelect(project) }
        )
    }
}
