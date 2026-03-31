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

            MediaView(authService: authService)
                .tabItem {
                    Image(systemName: "photo.on.rectangle.angled")
                    Text("Media")
                }

            ThinkingView(authService: authService)
                .tabItem {
                    Image(systemName: "brain.head.profile")
                    Text("Thinking")
                }
        }
        .tint(Color(hex: "#E7FC44"))
        .toolbarBackground(.ultraThinMaterial, for: .tabBar)
        .toolbarBackground(.visible, for: .tabBar)
    }
}
