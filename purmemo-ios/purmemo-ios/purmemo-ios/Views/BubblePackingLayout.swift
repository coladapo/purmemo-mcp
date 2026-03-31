import Foundation
import CoreGraphics

struct BubbleNode: Identifiable {
    let projectId: String
    var width: CGFloat
    var height: CGFloat
    var position: CGPoint  // top-left corner

    var id: String { projectId }
    var diameter: CGFloat { min(width, height) }
    var radius: CGFloat { diameter / 2 }
}

enum BubblePackingLayout {

    // MARK: - Tetris Packing

    /// Packs tiles into a 3-column grid like Tetris.
    /// Large projects (top tier) get 2 columns wide.
    /// Tile heights are fixed per tier — no stretching to fill.
    static func packTiles(
        projects: [ProjectItem],
        containerWidth: CGFloat,
        gap: CGFloat
    ) -> (nodes: [BubbleNode], height: CGFloat) {
        guard !projects.isEmpty else { return ([], 0) }

        let columns = 3
        let totalGap = gap * CGFloat(columns - 1)
        let colWidth = (containerWidth - totalGap) / CGFloat(columns)

        // Fixed row height — compact tiles
        let rowHeight: CGFloat = colWidth * 0.95

        // Determine size tiers based on memory count
        let maxCount = projects.map(\.memoryCount).max() ?? 1
        let maxLog = log2(Double(max(maxCount, 1)) + 1)

        struct TileInfo {
            let project: ProjectItem
            let cols: Int
            let heightMultiplier: CGFloat
        }

        var tiles: [TileInfo] = []
        for project in projects {
            let logScale = log2(Double(max(project.memoryCount, 1)) + 1)
            let t = maxLog > 0 ? min(logScale / maxLog, 1.0) : 0

            if t > 0.80 {
                // Large — 2 cols wide, 1.4x tall
                tiles.append(TileInfo(project: project, cols: 2, heightMultiplier: 1.4))
            } else if t > 0.45 {
                // Medium — 1 col, 1.1x tall
                tiles.append(TileInfo(project: project, cols: 1, heightMultiplier: 1.1))
            } else {
                // Small — 1 col, standard
                tiles.append(TileInfo(project: project, cols: 1, heightMultiplier: 1.0))
            }
        }

        // Sort largest first for better packing
        tiles.sort { a, b in
            let aArea = CGFloat(a.cols) * a.heightMultiplier
            let bArea = CGFloat(b.cols) * b.heightMultiplier
            return aArea > bArea
        }

        // Track column bottoms (heightmap)
        var columnHeights = [CGFloat](repeating: 0, count: columns)
        var nodes: [BubbleNode] = []

        for tile in tiles {
            let tileW: CGFloat
            let tileH = rowHeight * tile.heightMultiplier

            if tile.cols == 2 {
                tileW = colWidth * 2 + gap

                // Find best adjacent column pair with lowest max height
                var bestStart = 0
                var bestY = CGFloat.greatestFiniteMagnitude
                for start in 0...(columns - 2) {
                    let maxH = max(columnHeights[start], columnHeights[start + 1])
                    if maxH < bestY {
                        bestY = maxH
                        bestStart = start
                    }
                }

                let x = CGFloat(bestStart) * (colWidth + gap)
                let y = bestY + (bestY > 0 ? gap : 0)

                nodes.append(BubbleNode(
                    projectId: tile.project.name,
                    width: tileW,
                    height: tileH,
                    position: CGPoint(x: x, y: y)
                ))

                let newBottom = y + tileH
                columnHeights[bestStart] = newBottom
                columnHeights[bestStart + 1] = newBottom
            } else {
                tileW = colWidth

                // Single column — place in shortest column
                let shortestCol = columnHeights.enumerated().min(by: { $0.element < $1.element })!.offset
                let x = CGFloat(shortestCol) * (colWidth + gap)
                let y = columnHeights[shortestCol] + (columnHeights[shortestCol] > 0 ? gap : 0)

                nodes.append(BubbleNode(
                    projectId: tile.project.name,
                    width: tileW,
                    height: tileH,
                    position: CGPoint(x: x, y: y)
                ))

                columnHeights[shortestCol] = y + tileH
            }
        }

        let totalHeight = columnHeights.max() ?? 200
        return (nodes, totalHeight)
    }
}
