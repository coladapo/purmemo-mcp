import Foundation
import AppKit
import PurmemoShared

/// Queues image drops from chris memo/ for user review before uploading.
/// When images are dropped, they're held here until the user adds a note
/// and confirms — then uploaded as a single memory with multiple images.
@Observable
@MainActor
class DropQueue {

    static let shared = DropQueue()

    /// Pending images waiting for user confirmation
    var pendingImages: [PendingImage] = []

    /// Whether the drop prompt is visible
    var isShowingPrompt = false

    /// User's note for the current batch
    var userNote = ""

    /// Debounce timer — groups drops within 2 seconds
    private var debounceWork: DispatchWorkItem?

    struct PendingImage: Identifiable {
        let id = UUID()
        let path: String
        let fileName: String
        let thumbnail: NSImage?
        let fileSize: UInt64
    }

    /// Called by SessionWatcher when an image is dropped into chris memo/
    func addImage(path: String) {
        let fileName = URL(fileURLWithPath: path).lastPathComponent
        let attrs = try? FileManager.default.attributesOfItem(atPath: path)
        let fileSize = attrs?[.size] as? UInt64 ?? 0

        // Load thumbnail
        let thumbnail = NSImage(contentsOfFile: path)

        let pending = PendingImage(
            path: path,
            fileName: fileName,
            thumbnail: thumbnail,
            fileSize: fileSize
        )
        pendingImages.append(pending)

        // Debounce — wait 2 seconds for more images before showing prompt
        debounceWork?.cancel()
        let work = DispatchWorkItem { [weak self] in
            Task { @MainActor in
                self?.showPrompt()
            }
        }
        debounceWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0, execute: work)
    }

    private func showPrompt() {
        guard !pendingImages.isEmpty else { return }
        userNote = ""
        isShowingPrompt = true

        // Open the popover after SwiftUI has a chance to render the DropPromptView.
        // The 0.2s delay ensures: state update → SwiftUI layout → popover opens with content ready.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
            NotificationCenter.default.post(name: .showDropPrompt, object: nil)
        }
    }

    /// User confirmed — upload all pending images as one memory
    func confirmUpload() {
        let images = pendingImages
        let note = userNote.trimmingCharacters(in: .whitespacesAndNewlines)

        // Reset state
        pendingImages = []
        isShowingPrompt = false
        userNote = ""

        // Upload in background
        Task.detached {
            await Self.uploadBatch(images: images, note: note)
        }
    }

    /// User cancelled — just index locally, don't upload
    func cancelUpload() {
        let images = pendingImages
        pendingImages = []
        isShowingPrompt = false
        userNote = ""

        // Still index locally
        for img in images {
            let sessionId = "memo-\(img.fileName)"
            let syncRoot = SessionStore.purmemoHome.path
            let relativePath = img.path.hasPrefix(syncRoot)
                ? String(img.path.dropFirst(syncRoot.count + 1))
                : "chris memo/\(img.fileName)"

            SessionStore.shared.database.upsert(SyncItem(
                id: 0, origin: "local", sourceType: "personal",
                sessionId: sessionId, title: img.fileName,
                project: "personal", localPath: relativePath,
                sourcePath: img.path, localHash: "",
                fileSize: img.fileSize, messageCount: nil,
                cloudId: nil, syncState: .localOnly,
                sourceDeleted: false, cloudUpdatedAt: nil,
                localUpdatedAt: Date(), createdAt: Date(),
                customTitle: nil, aiTitle: nil, tags: nil, prLink: nil,
                lastPrompt: nil, worktreeBranch: nil, sessionMode: nil,
                projectId: nil
            ))
        }
    }

    /// Remove a single image from the pending batch
    func removeImage(_ image: PendingImage) {
        pendingImages.removeAll { $0.id == image.id }
        if pendingImages.isEmpty {
            isShowingPrompt = false
        }
    }

    // MARK: - Upload Logic

    private static func uploadBatch(images: [PendingImage], note: String) async {
        guard let token = KeychainService.load(.accessToken) else { return }

        let title = note.isEmpty
            ? (images.count == 1 ? "Desktop: \(images[0].fileName)" : "Desktop: \(images.count) images")
            : note
        let content = note.isEmpty
            ? "Images saved from desktop"
            : note

        // Step 1: Create memory
        let bodyJSON: [String: Any] = [
            "title": title,
            "content": content,
            "content_type": "image",
            "source_type": "desktop_image",
            "platform": "purmemo-desktop",
            "source_metadata": [
                "filenames": images.map(\.fileName),
                "image_count": images.count,
                "app": "PurmemoSync"
            ]
        ]

        guard let bodyData = try? JSONSerialization.data(withJSONObject: bodyJSON) else { return }

        var createReq = URLRequest(url: URL(string: "https://api.purmemo.ai/api/v1/memories/")!)
        createReq.httpMethod = "POST"
        createReq.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        createReq.setValue("application/json", forHTTPHeaderField: "Content-Type")
        createReq.httpBody = bodyData
        createReq.timeoutInterval = 30

        guard let (data, response) = try? await URLSession.shared.data(for: createReq),
              let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 || httpResponse.statusCode == 201,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let memoryId = json["id"] as? String else {
            Log.shared.error("Failed to create memory for batch upload", source: "DropQueue")
            return
        }

        // Step 2: Upload each image to the memory
        for (position, img) in images.enumerated() {
            guard let imageData = FileManager.default.contents(atPath: img.path) else { continue }

            let boundary = UUID().uuidString
            var uploadReq = URLRequest(url: URL(string: "https://api.purmemo.ai/api/v1/memories/\(memoryId)/images")!)
            uploadReq.httpMethod = "POST"
            uploadReq.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            uploadReq.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
            uploadReq.timeoutInterval = 60

            let ext = URL(fileURLWithPath: img.path).pathExtension.lowercased()
            let mimeType = ext == "png" ? "image/png" :
                           ext == "gif" ? "image/gif" :
                           ext == "webp" ? "image/webp" :
                           ext == "heic" ? "image/heic" : "image/jpeg"

            var body = Data()
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"image\"; filename=\"\(img.fileName)\"\r\n".data(using: .utf8)!)
            body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
            body.append(imageData)
            body.append("\r\n--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"position\"\r\n\r\n\(position)\r\n".data(using: .utf8)!)
            body.append("--\(boundary)--\r\n".data(using: .utf8)!)
            uploadReq.httpBody = body

            let _ = try? await URLSession.shared.data(for: uploadReq)
        }

        // Step 3: Track in DB — one entry for the group
        let groupSessionId = "memo-\(memoryId)"
        let syncRoot = SessionStore.purmemoHome.path
        let firstImagePath = images[0].path
        let relativePath = firstImagePath.hasPrefix(syncRoot)
            ? String(firstImagePath.dropFirst(syncRoot.count + 1))
            : "chris memo/\(images[0].fileName)"

        SessionStore.shared.database.upsert(SyncItem(
            id: 0, origin: "local", sourceType: "desktop_image",
            sessionId: groupSessionId, title: title,
            project: "personal", localPath: relativePath,
            sourcePath: firstImagePath, localHash: "",
            fileSize: images.reduce(0) { $0 + $1.fileSize },
            messageCount: images.count, cloudId: memoryId,
            syncState: .synced, sourceDeleted: false,
            cloudUpdatedAt: Date(), localUpdatedAt: Date(),
            createdAt: Date(),
            customTitle: nil, aiTitle: nil, tags: nil, prLink: nil,
            lastPrompt: nil, worktreeBranch: nil, sessionMode: nil,
            projectId: nil
        ))

        Log.shared.info("Batch uploaded: \(images.count) images → memory \(memoryId.prefix(8)) (\(title))", source: "DropQueue")
    }
}

// MARK: - Notification

extension Notification.Name {
    static let showDropPrompt = Notification.Name("ai.purmemo.showDropPrompt")
}
