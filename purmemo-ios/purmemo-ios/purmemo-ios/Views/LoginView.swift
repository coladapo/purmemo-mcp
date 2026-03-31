import SwiftUI

struct LoginView: View {
    var authService: AuthService
    @State private var email = ""
    @State private var password = ""
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                // Logo / wordmark
                VStack(spacing: 8) {
                    Image("PurmemoWordmark")
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(height: 56)
                    Text("Save once. Recall everywhere you work.")
                        .font(.system(size: 15))
                        .foregroundColor(.white.opacity(0.4))
                }
                .padding(.bottom, 40)

                VStack(spacing: 16) {
                    // OAuth buttons
                    VStack(spacing: 10) {
                        OAuthButton(
                            label: "Continue with Google",
                            logoImage: "GoogleLogo",
                            isLoading: false,
                            action: { authService.startOAuth(provider: "google") }
                        )

                        OAuthButton(
                            label: "Continue with GitHub",
                            logoImage: "GitHubLogo",
                            isLoading: false,
                            action: { authService.startOAuth(provider: "github") }
                        )
                    }
                    .disabled(isLoading)

                    // Divider
                    HStack(spacing: 12) {
                        Rectangle()
                            .fill(Color.white.opacity(0.08))
                            .frame(height: 1)
                        Text("or")
                            .font(.system(size: 13))
                            .foregroundColor(.white.opacity(0.25))
                        Rectangle()
                            .fill(Color.white.opacity(0.08))
                            .frame(height: 1)
                    }

                    // Email/password form
                    VStack(spacing: 12) {
                        TextField("Email", text: $email)
                            .textFieldStyle(PurmemoFieldStyle())
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .autocapitalization(.none)
                            .autocorrectionDisabled()

                        SecureField("Password", text: $password)
                            .textFieldStyle(PurmemoFieldStyle())
                            .textContentType(.password)
                            .onSubmit { login() }

                        if let error = errorMessage {
                            Text(error)
                                .font(.system(size: 13))
                                .foregroundColor(.red.opacity(0.8))
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 4)
                        }

                        Button(action: login) {
                            Group {
                                if isLoading {
                                    ProgressView()
                                        .progressViewStyle(CircularProgressViewStyle(tint: .black))
                                } else {
                                    Text("Sign In")
                                        .font(.system(size: 16, weight: .semibold))
                                        .foregroundColor(.black)
                                }
                            }
                            .frame(maxWidth: .infinity)
                            .frame(height: 52)
                            .background(Color(hex: "#E7FC44"))
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                        }
                        .disabled(isLoading || email.isEmpty || password.isEmpty)
                        .padding(.top, 4)
                    }
                }
                .padding(.horizontal, 24)

                Spacer()

                Text("Bridge all your AI conversations.")
                    .font(.system(size: 12))
                    .foregroundColor(.white.opacity(0.2))
                    .padding(.bottom, 32)
            }
        }
        .preferredColorScheme(.dark)
        .onChange(of: authService.oauthError) { _, newError in
            if let newError {
                errorMessage = newError
                authService.oauthError = nil
            }
        }
    }

    private func login() {
        guard !email.isEmpty, !password.isEmpty else { return }
        isLoading = true
        errorMessage = nil
        Task {
            do {
                try await authService.login(email: email, password: password)
            } catch {
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }
}

// MARK: - OAuth Button Component

struct OAuthButton: View {
    let label: String
    let logoImage: String
    let isLoading: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                if isLoading {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                        .frame(width: 20, height: 20)
                } else {
                    Image(logoImage)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(width: 20, height: 20)
                }
                Text(label)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(.white)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .background(Color(hex: "#1a1a1a"))
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(Color.white.opacity(0.12), lineWidth: 1)
            )
        }
    }
}

struct PurmemoFieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .font(.system(size: 16))
            .foregroundColor(.white)
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(Color(hex: "#1a1a1a"))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.white.opacity(0.08), lineWidth: 1)
            )
    }
}
