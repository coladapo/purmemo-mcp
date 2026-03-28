import Foundation
import Observation

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

    init() {
        if let token = KeychainService.load(.accessToken), !token.isEmpty {
            isAuthenticated = true
            userEmail = KeychainService.load(.userEmail) ?? ""
        }
    }

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

enum AuthError: LocalizedError {
    case invalidCredentials
    case noRefreshToken
    case sessionExpired
    case notAuthenticated

    var errorDescription: String? {
        switch self {
        case .invalidCredentials: return "Invalid email or password"
        case .noRefreshToken:     return "Session expired, please log in again"
        case .sessionExpired:     return "Session expired, please log in again"
        case .notAuthenticated:   return "Please log in to continue"
        }
    }
}
