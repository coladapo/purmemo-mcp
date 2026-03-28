import Foundation
import Observation
import AuthenticationServices

struct LoginRequest: Codable {
    let email: String
    let password: String
}

struct LoginResponse: Codable {
    let access_token: String
    let refresh_token: String
    let token_type: String
}

struct RefreshRequest: Codable {
    let refresh_token: String
}

@Observable
class AuthService {
    var isAuthenticated = false
    var userEmail: String = ""

    private let baseURL = "https://api.purmemo.ai"
    static let oauthCallbackScheme = "purmemo"

    init() {
        if let token = KeychainService.load(.accessToken), !token.isEmpty {
            isAuthenticated = true
            userEmail = KeychainService.load(.userEmail) ?? ""
        }
    }

    // MARK: - Email/Password Login

    func login(email: String, password: String) async throws {
        let url = URL(string: "\(baseURL)/api/v1/auth/login")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(LoginRequest(email: email, password: password))

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw AuthError.invalidCredentials
        }

        let loginResponse = try JSONDecoder().decode(LoginResponse.self, from: data)
        KeychainService.save(loginResponse.access_token, for: .accessToken)
        KeychainService.save(loginResponse.refresh_token, for: .refreshToken)
        KeychainService.save(email, for: .userEmail)

        await MainActor.run {
            self.userEmail = email
            self.isAuthenticated = true
        }
    }

    // MARK: - OAuth Login (Google / GitHub)

    func loginWithOAuth(provider: String) async throws {
        let callbackURL = "\(Self.oauthCallbackScheme)://oauth_callback"
        let loginURL = URL(string: "\(baseURL)/api/v1/oauth/\(provider)/login?return_url=\(callbackURL.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? callbackURL)")!

        let callbackUrl = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<URL, Error>) in
            let session = ASWebAuthenticationSession(
                url: loginURL,
                callbackURLScheme: Self.oauthCallbackScheme
            ) { url, error in
                if let error {
                    continuation.resume(throwing: error)
                } else if let url {
                    continuation.resume(returning: url)
                } else {
                    continuation.resume(throwing: AuthError.oauthFailed)
                }
            }
            session.prefersEphemeralWebBrowserSession = false
            session.presentationContextProvider = OAuthPresentationContext.shared

            DispatchQueue.main.async {
                session.start()
            }
        }

        // Parse tokens from callback URL: purmemo://oauth_callback?token=...&refresh_token=...&provider=...
        guard let components = URLComponents(url: callbackUrl, resolvingAgainstBaseURL: false),
              let items = components.queryItems,
              let token = items.first(where: { $0.name == "token" })?.value,
              let refreshToken = items.first(where: { $0.name == "refresh_token" })?.value else {
            throw AuthError.oauthFailed
        }

        // Save tokens
        KeychainService.save(token, for: .accessToken)
        KeychainService.save(refreshToken, for: .refreshToken)

        // Fetch user email from /auth/me
        let email = try await fetchUserEmail(token: token)
        KeychainService.save(email, for: .userEmail)

        await MainActor.run {
            self.userEmail = email
            self.isAuthenticated = true
        }
    }

    private func fetchUserEmail(token: String) async throws -> String {
        let url = URL(string: "\(baseURL)/api/v1/auth/me")!
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let http = response as? HTTPURLResponse, http.statusCode == 200,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let email = json["email"] as? String else {
            return "User"
        }
        return email
    }

    // MARK: - Token Management

    func refreshToken() async throws -> String {
        guard let refreshToken = KeychainService.load(.refreshToken) else {
            throw AuthError.noRefreshToken
        }

        let url = URL(string: "\(baseURL)/api/v1/auth/refresh")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(RefreshRequest(refresh_token: refreshToken))

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            await MainActor.run { self.logout() }
            throw AuthError.sessionExpired
        }

        let loginResponse = try JSONDecoder().decode(LoginResponse.self, from: data)
        KeychainService.save(loginResponse.access_token, for: .accessToken)
        KeychainService.save(loginResponse.refresh_token, for: .refreshToken)
        return loginResponse.access_token
    }

    func validToken() async throws -> String {
        guard let token = KeychainService.load(.accessToken) else {
            throw AuthError.notAuthenticated
        }
        return token
    }

    func logout() {
        KeychainService.deleteAll()
        isAuthenticated = false
        userEmail = ""
    }
}

// MARK: - OAuth Presentation Context

class OAuthPresentationContext: NSObject, ASWebAuthenticationPresentationContextProviding {
    static let shared = OAuthPresentationContext()

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let window = scene.windows.first else {
            return ASPresentationAnchor()
        }
        return window
    }
}

// MARK: - Errors

enum AuthError: LocalizedError {
    case invalidCredentials
    case noRefreshToken
    case sessionExpired
    case notAuthenticated
    case oauthFailed

    var errorDescription: String? {
        switch self {
        case .invalidCredentials: return "Invalid email or password"
        case .noRefreshToken:     return "Session expired, please log in again"
        case .sessionExpired:     return "Session expired, please log in again"
        case .notAuthenticated:   return "Please log in to continue"
        case .oauthFailed:        return "Sign in was cancelled or failed"
        }
    }
}
