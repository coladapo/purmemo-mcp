import AppIntents

struct PurmemoShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: SaveScreenshotIntent(),
            phrases: [
                "Save screenshot to \(.applicationName)",
                "Capture screenshot with \(.applicationName)"
            ],
            shortTitle: "Save Screenshot",
            systemImageName: "camera.viewfinder"
        )
    }
}
