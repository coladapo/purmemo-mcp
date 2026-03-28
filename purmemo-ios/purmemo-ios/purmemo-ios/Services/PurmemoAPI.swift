import Foundation
import UIKit

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

    // MARK: - Save Screenshot Memory

    func saveScreenshotMemory(imageData: Data, context: String) async throws -> SaveMemoryResponse {
        let token = try await authService.validToken()
        let url = URL(string: "\(baseURL)/api/v1/memories/")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        // Compress to JPEG and base64-encode
        let jpeg = UIImage(data: imageData)?.jpegData(compressionQuality: 0.5) ?? imageData
        let base64 = jpeg.base64EncodedString()

        let body: [String: Any] = [
            "title": String(context.prefix(60)),
            "content": "\(context)\n\n[Image attached]",
            "source_type": "ios_image_capture",
            "metadata": [
                "image_base64": base64,
                "image_mime": "image/jpeg"
            ]
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await perform(request)

        if let http = response as? HTTPURLResponse, http.statusCode == 401 {
            let newToken = try await authService.refreshToken()
            request.setValue("Bearer \(newToken)", forHTTPHeaderField: "Authorization")
            let (retryData, _) = try await perform(request)
            return try JSONDecoder().decode(SaveMemoryResponse.self, from: retryData)
        }

        return try JSONDecoder().decode(SaveMemoryResponse.self, from: data)
    }

    // MARK: - Create Memory (returns ID, no images)

    func createMemory(content: String, title: String, sourceType: String) async throws -> String {
        let token = try await authService.validToken()
        let url = URL(string: "\(baseURL)/api/v1/memories/")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 15

        let body: [String: Any] = [
            "content": content,
            "title": title,
            "source_type": sourceType
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await perform(request)

        if let http = response as? HTTPURLResponse, http.statusCode == 401 {
            let newToken = try await authService.refreshToken()
            request.setValue("Bearer \(newToken)", forHTTPHeaderField: "Authorization")
            let (retryData, _) = try await perform(request)
            return try parseMemoryId(retryData)
        }

        return try parseMemoryId(data)
    }

    private func parseMemoryId(_ data: Data) throws -> String {
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let id = json["id"] as? String ?? json["memory_id"] as? String else {
            throw APIError.decodingError
        }
        return id
    }

    // MARK: - Upload Image (multipart, one at a time)

    func uploadImage(memoryId: String, imageData: Data, position: Int, isPrivate: Bool, ocrText: String?) async throws {
        let token = try await authService.validToken()
        let url = URL(string: "\(baseURL)/api/v1/memories/\(memoryId)/images")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 30

        let boundary = UUID().uuidString
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()

        // Image file
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"image\"; filename=\"image_\(position).jpg\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
        body.append(imageData)
        body.append("\r\n".data(using: .utf8)!)

        // Position
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"position\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(position)\r\n".data(using: .utf8)!)

        // Private flag
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"private\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(isPrivate)\r\n".data(using: .utf8)!)

        // OCR text
        if let ocr = ocrText, !ocr.isEmpty {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"ocr_text\"\r\n\r\n".data(using: .utf8)!)
            body.append(ocr.data(using: .utf8)!)
            body.append("\r\n".data(using: .utf8)!)
        }

        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body

        let (_, response) = try await perform(request)
        if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            throw APIError.serverError(http.statusCode)
        }
    }

    // MARK: - Get Full Memory

    func getMemory(id: String) async throws -> FullMemory {
        let token = try await authService.validToken()
        let url = URL(string: "\(baseURL)/api/v1/memories/\(id)")!
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await perform(request)
        let httpStatus = (response as? HTTPURLResponse)?.statusCode ?? 0

        if httpStatus == 401 {
            let newToken = try await authService.refreshToken()
            request.setValue("Bearer \(newToken)", forHTTPHeaderField: "Authorization")
            let (retryData, _) = try await perform(request)
            return try JSONDecoder().decode(FullMemory.self, from: retryData)
        }

        return try JSONDecoder().decode(FullMemory.self, from: data)
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

    /// Parse the recall response — handles both v9 flat results and tiered formats
    private static func parseRecallResponse(_ data: Data) throws -> RecallResponse {
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw APIError.decodingError
        }

        if json["detail"] is String {
            throw APIError.serverError(0)
        }

        let query = json["query"] as? String ?? ""
        var memories: [RecallMemory] = []

        // v9 endpoint returns { results: [...] }
        if let results = json["results"] as? [[String: Any]] {
            for item in results {
                let memory = parseMemoryItem(item)
                if memory != nil { memories.append(memory!) }
            }
        }
        // Tiered format returns { tiers: { summary: [...], full: [...] } }
        else if let tiers = json["tiers"] as? [String: Any] {
            let preferredTier = (tiers["summary"] as? [[String: Any]])?.isEmpty == false ? "summary" : "full"
            if let items = tiers[preferredTier] as? [[String: Any]] {
                for item in items {
                    let memory = parseMemoryItem(item)
                    if memory != nil { memories.append(memory!) }
                }
            }
        }

        return RecallResponse(memories: memories, query: query)
    }

    private static func parseMemoryItem(_ item: [String: Any]) -> RecallMemory? {
        let id = (item["id"] as? String) ?? UUID().uuidString
        let title = item["title"] as? String
        let content = (item["summary"] as? String)
            ?? (item["content"] as? String)
            ?? (item["title"] as? String)
            ?? ""
        let score = item["relevance_score"] as? Double
        let createdAt = item["created_at"] as? String
        guard !content.isEmpty else { return nil }
        return RecallMemory(id: id, title: title, content: content, score: score, created_at: createdAt)
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
