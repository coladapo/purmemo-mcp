import UIKit
import SwiftUI
import UniformTypeIdentifiers
import Vision

@objc(ShareViewController)
class ShareViewController: UIViewController {

    private var sharedText: String = ""
    private var sharedURL: String = ""
    private var sharedImages: [UIImage] = []
    private let shareState = ShareState()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        extractContent { [weak self] text, url, images in
            guard let self else { return }
            self.sharedText = text ?? ""
            self.sharedURL = url ?? ""
            self.sharedImages = images
            DispatchQueue.main.async { self.presentShareView() }
        }
    }

    private func presentShareView() {
        let shareView = ShareExtensionView(
            text: sharedText,
            url: sharedURL,
            images: sharedImages,
            onSave: { [weak self] note, isPrivate in self?.saveMemory(note: note, isPrivate: isPrivate) },
            onCancel: { [weak self] in self?.close() },
            shareState: shareState
        )

        let host = UIHostingController(rootView: shareView)
        host.view.backgroundColor = .clear
        addChild(host)
        view.addSubview(host.view)
        host.didMove(toParent: self)

        host.view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            host.view.topAnchor.constraint(equalTo: view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
    }

    // MARK: - Extract shared content (supports multiple images)

    private func extractContent(completion: @escaping (String?, String?, [UIImage]) -> Void) {
        guard let extensionItem = extensionContext?.inputItems.first as? NSExtensionItem,
              let attachments = extensionItem.attachments else {
            completion(nil, nil, [])
            return
        }

        var resultText: String?
        var resultURL: String?
        var resultImages: [UIImage] = []
        let group = DispatchGroup()
        let lock = NSLock()

        for provider in attachments {
            if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
                group.enter()
                provider.loadItem(forTypeIdentifier: UTType.image.identifier) { item, _ in
                    var image: UIImage?
                    if let url = item as? URL, let data = try? Data(contentsOf: url) {
                        image = UIImage(data: data)
                    } else if let img = item as? UIImage {
                        image = img
                    } else if let data = item as? Data {
                        image = UIImage(data: data)
                    }
                    if let image {
                        lock.lock()
                        resultImages.append(image)
                        lock.unlock()
                    }
                    group.leave()
                }
            }
            if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                group.enter()
                provider.loadItem(forTypeIdentifier: UTType.url.identifier) { item, _ in
                    if let url = item as? URL { resultURL = url.absoluteString }
                    group.leave()
                }
            }
            if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                group.enter()
                provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) { item, _ in
                    if let text = item as? String { resultText = text }
                    group.leave()
                }
            }
        }

        group.notify(queue: .main) { completion(resultText, resultURL, resultImages) }
    }

    // MARK: - Save to Purmemo API

    private func saveMemory(note: String, isPrivate: Bool) {
        Task {
            do {
                try await postMemory(note: note, isPrivate: isPrivate)
                await MainActor.run {
                    shareState.onSuccess()
                    let haptic = UINotificationFeedbackGenerator()
                    haptic.notificationOccurred(.success)
                }
                try? await Task.sleep(for: .seconds(1.5))
                await MainActor.run { close() }
            } catch {
                await MainActor.run {
                    shareState.onError(error.localizedDescription)
                }
            }
        }
    }

    private func postMemory(note: String, isPrivate: Bool) async throws {
        guard let token = KeychainService.load(.accessToken) else {
            throw ShareError.notAuthenticated
        }

        var content = note
        if !sharedURL.isEmpty {
            content += "\n\nSource: \(sharedURL)"
        }
        if !sharedText.isEmpty && sharedText != note {
            content += "\n\n\(sharedText)"
        }

        // Placeholder content for image-only saves
        if content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !sharedImages.isEmpty {
            let formatter = ISO8601DateFormatter()
            let timestamp = formatter.string(from: Date())
            content = sharedImages.count == 1
                ? "[Image captured at \(timestamp)]"
                : "[\(sharedImages.count) images captured at \(timestamp)]"
        }

        if content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            throw ShareError.emptyContent
        }

        let hasImages = !sharedImages.isEmpty

        // ── Step 1: Create the memory (lightweight JSON, no images) ──
        var body: [String: Any] = [
            "content": content,
            "source_type": hasImages ? "ios_image_share" : "ios_share_extension"
        ]

        // Pass source_url so link enrichment triggers (transcripts, thumbnails, OG metadata)
        if !sharedURL.isEmpty {
            body["source_url"] = sharedURL
        }

        if hasImages {
            body["title"] = note.isEmpty
                ? (sharedImages.count == 1 ? "Image" : "\(sharedImages.count) Images")
                : String(note.prefix(60))
        }

        let createURL = URL(string: "https://api.purmemo.ai/api/v1/memories/")!
        var createReq = URLRequest(url: createURL)
        createReq.httpMethod = "POST"
        createReq.setValue("application/json", forHTTPHeaderField: "Content-Type")
        createReq.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        createReq.httpBody = try JSONSerialization.data(withJSONObject: body)
        createReq.timeoutInterval = 15

        let (createData, createResp) = try await URLSession.shared.data(for: createReq)
        guard let createHttp = createResp as? HTTPURLResponse,
              (200...299).contains(createHttp.statusCode) else {
            let respBody = String(data: createData, encoding: .utf8) ?? "No response"
            let code = (createResp as? HTTPURLResponse)?.statusCode ?? 0
            throw ShareError.serverError(code, respBody)
        }

        // Parse memory ID from response
        guard let json = try? JSONSerialization.jsonObject(with: createData) as? [String: Any],
              let memoryId = json["id"] as? String ?? json["memory_id"] as? String else {
            throw ShareError.apiFailed
        }

        // ── Step 2: Upload images one at a time (multipart) ──
        // Each image is processed and uploaded individually to stay within
        // the Share Extension's ~120MB memory limit.

        for (i, image) in sharedImages.enumerated() {
            // Update progress
            await MainActor.run {
                shareState.progress = "Uploading \(i + 1)/\(sharedImages.count)..."
            }

            // Synchronous image processing inside autoreleasepool to manage memory
            let (jpeg, ocrText) = autoreleasepool { () -> (Data?, String?) in
                let compressed = resizeAndCompress(image)
                let ocr = isPrivate ? performOnDeviceOCR(image) : nil
                return (compressed, ocr)
            }

            guard let jpeg else { continue }

            // Build multipart form data
            let boundary = UUID().uuidString
            var formBody = Data()

            // Image file
            formBody.append("--\(boundary)\r\n".data(using: .utf8)!)
            formBody.append("Content-Disposition: form-data; name=\"image\"; filename=\"image_\(i).jpg\"\r\n".data(using: .utf8)!)
            formBody.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
            formBody.append(jpeg)
            formBody.append("\r\n".data(using: .utf8)!)

            // Position
            formBody.append("--\(boundary)\r\n".data(using: .utf8)!)
            formBody.append("Content-Disposition: form-data; name=\"position\"\r\n\r\n".data(using: .utf8)!)
            formBody.append("\(i)\r\n".data(using: .utf8)!)

            // Private flag
            formBody.append("--\(boundary)\r\n".data(using: .utf8)!)
            formBody.append("Content-Disposition: form-data; name=\"private\"\r\n\r\n".data(using: .utf8)!)
            formBody.append("\(isPrivate)\r\n".data(using: .utf8)!)

            // OCR text (if available)
            if let ocr = ocrText, !ocr.isEmpty {
                formBody.append("--\(boundary)\r\n".data(using: .utf8)!)
                formBody.append("Content-Disposition: form-data; name=\"ocr_text\"\r\n\r\n".data(using: .utf8)!)
                formBody.append(ocr.data(using: .utf8)!)
                formBody.append("\r\n".data(using: .utf8)!)
            }

            formBody.append("--\(boundary)--\r\n".data(using: .utf8)!)

            // Upload
            let uploadURL = URL(string: "https://api.purmemo.ai/api/v1/memories/\(memoryId)/images")!
            var uploadReq = URLRequest(url: uploadURL)
            uploadReq.httpMethod = "POST"
            uploadReq.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            uploadReq.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
            uploadReq.httpBody = formBody
            uploadReq.timeoutInterval = 30

            let (_, uploadResp) = try await URLSession.shared.data(for: uploadReq)
            if let http = uploadResp as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
                print("[purmemo] Image \(i) upload failed: HTTP \(http.statusCode)")
            }
        }
    }

    /// Resize to max 800px width and compress to JPEG at 30% quality
    private func resizeAndCompress(_ image: UIImage) -> Data? {
        let maxWidth: CGFloat = 800
        let scale = min(1.0, maxWidth / image.size.width)
        let newSize = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        UIGraphicsBeginImageContextWithOptions(newSize, false, 1.0)
        image.draw(in: CGRect(origin: .zero, size: newSize))
        let resized = UIGraphicsGetImageFromCurrentImageContext()
        UIGraphicsEndImageContext()
        return (resized ?? image).jpegData(compressionQuality: 0.3)
    }

    /// On-device OCR using Apple Vision framework — never leaves the device.
    /// Uses .fast recognition to stay within Share Extension memory limits.
    private func performOnDeviceOCR(_ image: UIImage) -> String? {
        let maxDim: CGFloat = 1200
        let scale = min(1.0, maxDim / max(image.size.width, image.size.height))
        let ocrSize = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        UIGraphicsBeginImageContextWithOptions(ocrSize, false, 1.0)
        image.draw(in: CGRect(origin: .zero, size: ocrSize))
        let scaled = UIGraphicsGetImageFromCurrentImageContext()
        UIGraphicsEndImageContext()

        guard let cgImage = (scaled ?? image).cgImage else { return nil }

        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .fast
        request.usesLanguageCorrection = false

        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        try? handler.perform([request])

        guard let observations = request.results else { return nil }

        let text = observations
            .compactMap { $0.topCandidates(1).first?.string }
            .joined(separator: "\n")

        return text.isEmpty ? nil : text
    }

    private func close() {
        extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
    }
}

enum ShareError: LocalizedError {
    case notAuthenticated
    case apiFailed
    case emptyContent
    case serverError(Int, String)

    var errorDescription: String? {
        switch self {
        case .notAuthenticated:
            return "Not signed in. Open purmemo and sign in first."
        case .apiFailed:
            return "Couldn't reach purmemo. Check your connection."
        case .emptyContent:
            return "Nothing to save."
        case .serverError(let code, let body):
            return "Server error (\(code)): \(String(body.prefix(200)))"
        }
    }
}
