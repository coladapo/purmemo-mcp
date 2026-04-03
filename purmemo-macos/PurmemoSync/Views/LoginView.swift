import SwiftUI
import PurmemoShared

struct LoginView: View {
    @Bindable var auth: AuthClient
    @State private var email = ""
    @State private var password = ""
    @State private var isLoading = false
    @State private var errorMessage: String?

    private let accent = Color(red: 0.906, green: 0.988, blue: 0.267) // #E7FC44

    var body: some View {
        VStack(spacing: 20) {
            Spacer()

            // Logo area
            Image(systemName: "brain.head.profile")
                .font(.system(size: 48))
                .foregroundStyle(accent)

            Text("purmemo")
                .font(.system(size: 24, weight: .bold, design: .rounded))
                .foregroundStyle(.white)

            Text("Sign in to sync your sessions")
                .font(.system(size: 13))
                .foregroundStyle(.secondary)

            // Fields
            VStack(spacing: 12) {
                TextField("Email", text: $email)
                    .textFieldStyle(.roundedBorder)
                    .textContentType(.emailAddress)

                SecureField("Password", text: $password)
                    .textFieldStyle(.roundedBorder)
                    .textContentType(.password)
                    .onSubmit { login() }
            }
            .padding(.horizontal)

            if let error = errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
            }

            Button(action: login) {
                Group {
                    if isLoading {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Text("Sign In")
                            .fontWeight(.semibold)
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 36)
            }
            .buttonStyle(.borderedProminent)
            .tint(accent)
            .foregroundStyle(.black)
            .padding(.horizontal)
            .disabled(email.isEmpty || password.isEmpty || isLoading)

            // OAuth buttons
            HStack(spacing: 12) {
                oauthButton(label: "Google", icon: "globe") {
                    openOAuth(provider: "google")
                }
                oauthButton(label: "GitHub", icon: "chevron.left.forwardslash.chevron.right") {
                    openOAuth(provider: "github")
                }
            }
            .padding(.horizontal)

            Spacer()
        }
        .padding()
    }

    private func login() {
        guard !email.isEmpty, !password.isEmpty else { return }
        isLoading = true
        errorMessage = nil
        Task {
            do {
                try await auth.login(email: email, password: password)
            } catch {
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }

    private func openOAuth(provider: String) {
        // Use the web landing page as return_url — it shows "Signed in, close this tab"
        // then redirects to purmemo:// to deliver tokens to the desktop app
        let callbackURL = "https://app.purmemo.ai/oauth/desktop"
        guard let encoded = callbackURL.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let url = URL(string: "\(AuthClient.baseURL)/api/v1/oauth/\(provider)/login?return_url=\(encoded)") else { return }
        NSWorkspace.shared.open(url)
    }

    private func oauthButton(label: String, icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 12))
                Text(label)
                    .font(.system(size: 12, weight: .medium))
            }
            .frame(maxWidth: .infinity)
            .frame(height: 32)
        }
        .buttonStyle(.bordered)
        .tint(.secondary)
    }
}
