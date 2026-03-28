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
        let encoded = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
        let url = URL(string: "\(baseURL)/api/v9/recall-memories?query=\(encoded)")!
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await perform(request)
        let httpStatus = (response as? HTTPURLResponse)?.statusCode ?? 0

        if httpStatus == 401 {
            let newToken = try await authService.refreshToken()
            request.setValue("Bearer \(newToken)", forHTTPHeaderField: "Authorization")
            let (retryData, _) = try await perform(request)
            return try Self.parseRecallResponse(retryData)
        }

        return try Self.parseRecallResponse(data)
    }

    /// Parse the tiered recall response — prefer summary tier for clean mobile display
    private static func parseRecallResponse(_ data: Data) throws -> RecallResponse {
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw APIError.decodingError
        }

        if let detail = json["detail"] as? String {
            throw APIError.serverError(0)
        }

        let query = json["query"] as? String ?? ""

        guard let tiersRaw = json["tiers"] as? [String: Any] else {
            return RecallResponse(memories: [], query: query)
        }

        var memories: [RecallMemory] = []

        // Prefer summary tier — cleanest for mobile (has title + summary text)
        // Fall back to full tier if summary is empty
        let preferredTier = (tiersRaw["summary"] as? [[String: Any]])?.isEmpty == false ? "summary" : "full"

        if let items = tiersRaw[preferredTier] as? [[String: Any]] {
            for item in items {
                let id = (item["id"] as? String) ?? UUID().uuidString
                let title = item["title"] as? String
                let content = (item["summary"] as? String)
                    ?? (item["content"] as? String)
                    ?? (item["title"] as? String)
                    ?? ""
                let score = item["relevance_score"] as? Double
                let createdAt = item["created_at"] as? String
                if !content.isEmpty {
                    memories.append(RecallMemory(id: id, title: title, content: content, score: score, created_at: createdAt))
                }
            }
        }

        return RecallResponse(memories: memories, query: query)
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
