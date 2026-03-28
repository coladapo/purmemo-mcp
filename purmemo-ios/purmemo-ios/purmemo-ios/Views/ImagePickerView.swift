import SwiftUI
import PhotosUI
import Vision

struct ImagePickerView: View {
    var authService: AuthService
    @Environment(\.dismiss) private var dismiss

    @State private var selectedItems: [PhotosPickerItem] = []
    @State private var selectedImages: [UIImage] = []
    @State private var note: String = ""
    @State private var aiAnalysis: Bool = true
    @State private var isSaving = false
    @State private var progress: String?
    @State private var error: String?
    @State private var saveSuccess = false

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 0) {
                // Header
                HStack {
                    Text("Save Images")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundColor(.white)
                    Spacer()
                    Button(action: { dismiss() }) {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 28))
                            .foregroundColor(.white.opacity(0.3))
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)
                .padding(.bottom, 12)

                ScrollView {
                    VStack(spacing: 20) {
                        // Photo picker
                        PhotosPicker(
                            selection: $selectedItems,
                            matching: .images,
                            photoLibrary: .shared()
                        ) {
                            if selectedImages.isEmpty {
                                // Empty state — tap to select
                                VStack(spacing: 12) {
                                    Image(systemName: "photo.on.rectangle.angled")
                                        .font(.system(size: 40))
                                        .foregroundColor(Color(hex: "#E7FC44"))
                                    Text("Tap to select images")
                                        .font(.system(size: 16, weight: .medium))
                                        .foregroundColor(.white)
                                    Text("No limit — select as many as you need")
                                        .font(.system(size: 13))
                                        .foregroundColor(.white.opacity(0.4))
                                }
                                .frame(maxWidth: .infinity)
                                .frame(height: 200)
                                .background(Color(hex: "#1a1a1a"))
                                .clipShape(RoundedRectangle(cornerRadius: 16))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 16)
                                        .stroke(Color(hex: "#E7FC44").opacity(0.3), lineWidth: 1)
                                )
                            } else {
                                // Selected images preview
                                VStack(spacing: 8) {
                                    ScrollView(.horizontal, showsIndicators: false) {
                                        HStack(spacing: 8) {
                                            ForEach(Array(selectedImages.enumerated()), id: \.offset) { _, image in
                                                Image(uiImage: image)
                                                    .resizable()
                                                    .aspectRatio(contentMode: .fill)
                                                    .frame(width: 100, height: 120)
                                                    .clipShape(RoundedRectangle(cornerRadius: 10))
                                            }
                                        }
                                    }
                                    .frame(height: 120)

                                    HStack {
                                        Text("\(selectedImages.count) images selected")
                                            .font(.system(size: 14, weight: .medium))
                                            .foregroundColor(Color(hex: "#E7FC44"))
                                        Spacer()
                                        Text("Tap to change")
                                            .font(.system(size: 12))
                                            .foregroundColor(.white.opacity(0.3))
                                    }
                                }
                            }
                        }
                        .onChange(of: selectedItems) { _, newItems in
                            loadImages(from: newItems)
                        }

                        // Context input
                        TextField("Add context (optional)...", text: $note, axis: .vertical)
                            .font(.system(size: 15))
                            .foregroundColor(.white)
                            .lineLimit(2...6)
                            .padding(14)
                            .background(Color(hex: "#1a1a1a"))
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(Color.white.opacity(0.08), lineWidth: 1)
                            )

                        // AI Analysis toggle
                        HStack(spacing: 10) {
                            Image(systemName: aiAnalysis ? "sparkles" : "lock.fill")
                                .font(.system(size: 14))
                                .foregroundColor(aiAnalysis ? Color(hex: "#E7FC44") : .white.opacity(0.4))
                                .frame(width: 20)

                            VStack(alignment: .leading, spacing: 2) {
                                Text(aiAnalysis ? "AI Analysis" : "Private")
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundColor(.white)
                                Text(aiAnalysis ? "AI extracts text, tags & context" : "No AI processing — on-device only")
                                    .font(.system(size: 11))
                                    .foregroundColor(.white.opacity(0.4))
                            }

                            Spacer()

                            Toggle("", isOn: $aiAnalysis)
                                .labelsHidden()
                                .tint(Color(hex: "#E7FC44"))
                        }
                        .padding(12)
                        .background(aiAnalysis ? Color(hex: "#E7FC44").opacity(0.08) : Color.white.opacity(0.04))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(aiAnalysis ? Color(hex: "#E7FC44").opacity(0.2) : Color.clear, lineWidth: 1)
                        )

                        // Error
                        if let error {
                            Text(error)
                                .font(.system(size: 13))
                                .foregroundColor(.red.opacity(0.9))
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    .padding(.horizontal, 20)
                }

                // Save button
                Button(action: saveImages) {
                    Group {
                        if isSaving {
                            VStack(spacing: 4) {
                                ProgressView()
                                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                if let progress {
                                    Text(progress)
                                        .font(.system(size: 12))
                                        .foregroundColor(.white.opacity(0.5))
                                }
                            }
                        } else {
                            Text(selectedImages.isEmpty ? "Select Images" : "Save \(selectedImages.count) Images")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundColor(.black)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 54)
                    .background(isSaving ? Color(hex: "#1a1a1a") : Color(hex: "#E7FC44"))
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                .disabled(selectedImages.isEmpty || isSaving)
                .padding(.horizontal, 20)
                .padding(.bottom, 20)
                .padding(.top, 12)
            }

            // Success overlay
            if saveSuccess {
                VStack(spacing: 16) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 48))
                        .foregroundColor(Color(hex: "#E7FC44"))
                    Text("\(selectedImages.count) images saved")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(.white)
                }
                .padding(32)
                .background(Color(hex: "#111111").clipShape(RoundedRectangle(cornerRadius: 20)))
                .shadow(color: .black.opacity(0.5), radius: 20)
                .transition(.scale.combined(with: .opacity))
            }
        }
        .preferredColorScheme(.dark)
        .animation(.easeInOut(duration: 0.3), value: isSaving)
        .animation(.easeInOut(duration: 0.3), value: saveSuccess)
    }

    // MARK: - Load images from PHPicker

    private func loadImages(from items: [PhotosPickerItem]) {
        selectedImages = []
        for item in items {
            item.loadTransferable(type: Data.self) { result in
                if case .success(let data) = result, let data, let img = UIImage(data: data) {
                    DispatchQueue.main.async {
                        selectedImages.append(img)
                    }
                }
            }
        }
    }

    // MARK: - Save

    private func saveImages() {
        guard !selectedImages.isEmpty else { return }
        isSaving = true
        error = nil

        Task {
            do {
                let api = PurmemoAPI(authService: authService)
                let isPrivate = !aiAnalysis

                // Step 1: Create memory (no images)
                let formatter = ISO8601DateFormatter()
                let timestamp = formatter.string(from: Date())
                let content = note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    ? "[\(selectedImages.count) images captured at \(timestamp)]"
                    : note
                let title = note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    ? "\(selectedImages.count) Images"
                    : String(note.prefix(60))

                let memoryId = try await api.createMemory(
                    content: content,
                    title: title,
                    sourceType: "ios_image_picker"
                )

                // Step 2: Upload images one at a time
                for (i, image) in selectedImages.enumerated() {
                    await MainActor.run {
                        progress = "Uploading \(i + 1)/\(selectedImages.count)..."
                    }

                    // Synchronous processing
                    let (jpeg, ocrText) = autoreleasepool { () -> (Data?, String?) in
                        let maxWidth: CGFloat = 800
                        let scale = min(1.0, maxWidth / image.size.width)
                        let newSize = CGSize(width: image.size.width * scale, height: image.size.height * scale)
                        UIGraphicsBeginImageContextWithOptions(newSize, false, 1.0)
                        image.draw(in: CGRect(origin: .zero, size: newSize))
                        let resized = UIGraphicsGetImageFromCurrentImageContext()
                        UIGraphicsEndImageContext()
                        let compressed = (resized ?? image).jpegData(compressionQuality: 0.3)
                        let ocr = isPrivate ? performOnDeviceOCR(image) : nil
                        return (compressed, ocr)
                    }

                    guard let jpeg else { continue }

                    try await api.uploadImage(
                        memoryId: memoryId,
                        imageData: jpeg,
                        position: i,
                        isPrivate: isPrivate,
                        ocrText: ocrText
                    )
                }

                await MainActor.run {
                    isSaving = false
                    saveSuccess = true
                    let haptic = UINotificationFeedbackGenerator()
                    haptic.notificationOccurred(.success)
                }

                try? await Task.sleep(for: .seconds(1.5))
                await MainActor.run { dismiss() }

            } catch {
                await MainActor.run {
                    isSaving = false
                    self.error = error.localizedDescription
                }
            }
        }
    }

    // MARK: - On-device OCR

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
        let text = observations.compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
        return text.isEmpty ? nil : text
    }
}

