import Foundation
import UIKit
import Observation

@Observable
@MainActor
class ScreenshotManager {
    static let shared = ScreenshotManager()

    var pendingScreenshotData: Data?
    var pendingImage: UIImage?
    var isShowingCapture: Bool = false

    private init() {}

    func receiveScreenshot(_ data: Data) {
        pendingScreenshotData = data
        pendingImage = UIImage(data: data)
        isShowingCapture = true
    }

    func clear() {
        pendingScreenshotData = nil
        pendingImage = nil
        isShowingCapture = false
    }
}
