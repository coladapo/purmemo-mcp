import SwiftUI

@main
struct PurmemoApp: App {
    @State private var authService = AuthService()
    private var screenshotManager = ScreenshotManager.shared

    var body: some Scene {
        WindowGroup {
            Group {
                if authService.isAuthenticated {
                    mainTabView
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

    private var mainTabView: some View {
        TabView {
            ProjectsView(authService: authService)
                .tabItem {
                    Image(systemName: "chart.bar.doc.horizontal")
                    Text("Projects")
                }

            ChatView(authService: authService)
                .tabItem {
                    Image(systemName: "message")
                    Text("Chat")
                }

            SettingsView(authService: authService)
                .tabItem {
                    Image(systemName: "gearshape")
                    Text("Settings")
                }
        }
        .tint(Color(hex: "#E7FC44"))
    }
}
