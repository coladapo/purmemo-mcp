import SwiftUI

@main
struct PurmemoApp: App {
    @State private var authService = AuthService()
    private var screenshotManager = ScreenshotManager.shared

    var body: some Scene {
        WindowGroup {
            Group {
                if authService.isAuthenticated {
                    ChatView(authService: authService)
                } else {
                    LoginView(authService: authService)
                }
            }
            .preferredColorScheme(.dark)
            .fullScreenCover(isPresented: .init(
                get: { screenshotManager.isShowingCapture && authService.isAuthenticated },
                set: { if !$0 { screenshotManager.clear() } }
            )) {
                ScreenshotCaptureView(
                    authService: authService,
                    screenshotManager: screenshotManager
                )
            }
        }
    }
}
