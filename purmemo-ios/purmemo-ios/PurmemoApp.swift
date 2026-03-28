import SwiftUI

@main
struct PurmemoApp: App {
    @State private var authService = AuthService()

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
        }
    }
}
