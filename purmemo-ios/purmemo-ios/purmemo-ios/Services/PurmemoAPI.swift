import Foundation

class PurmemoAPI {
    private let baseURL = "https://api.purmemo.ai"
    private let authService: AuthService

    init(authService: AuthService) {
        self.authService = authService
    }

    // MARK: - Save Memory

    func saveMemory(content: String) async throws -> SaveMemoryResponse {
        let token = try await authService.validToken()
        let url = URL(string: "\(baseURL)/api/v1/memories/")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let body = ["content": content, "source_type": "mobile_ios"]
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await perform(request)

        if let http = response as? HTTPURLResponse, http.statusCode == 401 {
            let newToken = try await authService.refreshToken()
            request.setValue("Bearer \(newToken)", forHTTPHeaderField: "Authorization")
            let (retryData, _) = try await perform(request)
            return try JSONDecoder().decode(SaveMemoryResponse.self, from: retryData)
        }

        return try JSONDecoder().decode(SaveMemoryResponse.self, from: data)
    }

    // MARK: - Recall Memories

    func recall(query: String) async throws -> RecallResponse {
        let token = try await authService.validToken()
        let url = URL(string: "\(baseURL)/api/v10/recall/")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(RecallRequest(query: query))

        let (data, response) = try await perform(request)

        if let http = response as? HTTPURLResponse, http.statusCode == 401 {
            let newToken = try await authService.refreshToken()
            request.setValue("Bearer \(newToken)", forHTTPHeaderField: "Authorization")
            let (retryData, _) = try await perform(request)
            return try JSONDecoder().decode(RecallResponse.self, from: retryData)
        }

        return try JSONDecoder().decode(RecallResponse.self, from: data)
    }

    // MARK: - Private

    private func perform(_ request: URLRequest) async throws -> (Data, URLResponse) {
        do {
            return try await URLSession.shared.data(for: request)
        } catch {
            throw APIError.networkError(error.localizedDescription)
        }
    }
}

enum APIError: LocalizedError {
    case networkError(String)
    case decodingError
    case serverError(Int)

    var errorDescription: String? {
        switch self {
        case .networkError(let msg): return "Network error: \(msg)"
        case .decodingError:         return "Failed to parse response"
        case .serverError(let code): return "Server error (\(code))"
        }
    }
}
