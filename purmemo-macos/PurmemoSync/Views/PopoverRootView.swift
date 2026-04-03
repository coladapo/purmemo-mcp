import SwiftUI
import PurmemoShared

struct PopoverRootView: View {
    @Bindable var auth: AuthClient

    var body: some View {
        Group {
            if auth.isAuthenticated {
                SessionsView(auth: auth)
            } else {
                LoginView(auth: auth)
            }
        }
        .frame(width: 380, height: 520)
        .background(Color(nsColor: .init(red: 0.08, green: 0.08, blue: 0.08, alpha: 1)))
        .preferredColorScheme(.dark)
    }
}
