import AppIntents

struct SaveScreenshotIntent: AppIntent {
    static var title: LocalizedStringResource = "Save Screenshot to pūrmemo"
    static var description = IntentDescription("Save a screenshot with context to your pūrmemo memory")
    static var openAppWhenRun: Bool = true

    @Parameter(title: "Screenshot")
    var screenshot: IntentFile

    @MainActor
    func perform() async throws -> some IntentResult {
        let data = screenshot.data
        ScreenshotManager.shared.receiveScreenshot(data)
        return .result()
    }
}
