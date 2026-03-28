import SwiftUI
import UIKit

@Observable
class ShareState {
    var isSaving = false
    var saveSuccess = false
    var errorMessage: String?
    var progress: String?  // "Uploading 3/10..."

    func onSuccess() {
        isSaving = false
        progress = nil
        saveSuccess = true
    }

    func onError(_ message: String) {
        isSaving = false
        progress = nil
        errorMessage = message
    }
}

struct ShareExtensionView: View {
    @State var text: String
    let url: String
    let images: [UIImage]
    let onSave: (String, Bool) -> Void  // (note, isPrivate)
    let onCancel: () -> Void
    var shareState: ShareState

    @State private var note: String = ""
    @State private var aiAnalysis: Bool = true
    @State private var ringRotation: Double = 0

    private static let ringImage: UIImage = {
        if let path = Bundle.main.path(forResource: "purmemo_ring", ofType: "png"),
           let img = UIImage(contentsOfFile: path) {
            return img
        }
        return UIImage(systemName: "circle.dotted") ?? UIImage()
    }()

    private static let logoImage: UIImage = {
        if let path = Bundle.main.path(forResource: "purfav3", ofType: "png"),
           let img = UIImage(contentsOfFile: path) {
            return img
        }
        return UIImage(systemName: "checkmark.circle.fill") ?? UIImage()
    }()

    var body: some View {
        ZStack {
            Color.black.opacity(0.85).ignoresSafeArea()
                .onTapGesture { onCancel() }

            VStack(spacing: 0) {
                // Image preview at the top
                if !images.isEmpty {
                    if images.count == 1, let image = images.first {
                        // Single image — full preview
                        Image(uiImage: image)
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .frame(maxHeight: 340)
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                            .overlay(
                                RoundedRectangle(cornerRadius: 16)
                                    .stroke(Color.white.opacity(0.1), lineWidth: 1)
                            )
                            .shadow(color: .black.opacity(0.5), radius: 20, y: 10)
                            .padding(.horizontal, 24)
                            .padding(.top, 60)
                    } else {
                        // Multi-image — horizontal scroll with count badge
                        VStack(spacing: 8) {
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 12) {
                                    ForEach(Array(images.enumerated()), id: \.offset) { index, image in
                                        Image(uiImage: image)
                                            .resizable()
                                            .aspectRatio(contentMode: .fill)
                                            .frame(width: 160, height: 200)
                                            .clipShape(RoundedRectangle(cornerRadius: 12))
                                            .overlay(
                                                RoundedRectangle(cornerRadius: 12)
                                                    .stroke(Color.white.opacity(0.1), lineWidth: 1)
                                            )
                                    }
                                }
                                .padding(.horizontal, 24)
                            }
                            .frame(height: 210)
                            .padding(.top, 60)

                            Text("\(images.count) images selected")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(Color(hex: "#E7FC44"))
                        }
                    }
                }

                Spacer()

                VStack(spacing: 16) {
                    // Header
                    HStack {
                        Text("Save to pūrmemo")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundColor(.white)
                        Spacer()
                        Button(action: onCancel) {
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: 24))
                                .foregroundColor(.white.opacity(0.3))
                        }
                    }

                    // URL preview
                    if !url.isEmpty {
                        HStack(spacing: 8) {
                            Image(systemName: "link")
                                .font(.system(size: 13))
                                .foregroundColor(Color(hex: "#E7FC44"))
                            Text(url)
                                .font(.system(size: 13))
                                .foregroundColor(.white.opacity(0.5))
                                .lineLimit(1)
                                .truncationMode(.middle)
                        }
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.white.opacity(0.06))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    }

                    // Shared text preview
                    if !text.isEmpty {
                        Text(text)
                            .font(.system(size: 14))
                            .foregroundColor(.white.opacity(0.6))
                            .lineLimit(4)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(12)
                            .background(Color.white.opacity(0.06))
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }

                    // Note input — text only (iOS blocks microphone in share extensions)
                    TextField("Add context (optional)…", text: $note, axis: .vertical)
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

                    // AI Analysis toggle — only shown when saving images
                    if !images.isEmpty {
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
                    }

                    // Error message
                    if let error = shareState.errorMessage {
                        Text(error)
                            .font(.system(size: 13))
                            .foregroundColor(.red.opacity(0.9))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 4)
                    }

                    // Auth status
                    if let email = KeychainService.load(.userEmail), !email.isEmpty {
                        HStack(spacing: 6) {
                            Circle()
                                .fill(Color(hex: "#E7FC44"))
                                .frame(width: 6, height: 6)
                            Text(email)
                                .font(.system(size: 12))
                                .foregroundColor(.white.opacity(0.35))
                        }
                    } else {
                        Text("Not signed in — open purmemo app first")
                            .font(.system(size: 12))
                            .foregroundColor(.red.opacity(0.7))
                    }

                    // Save button
                    Button {
                        shareState.errorMessage = nil
                        shareState.isSaving = true
                        let content = note.isEmpty ? text : note

                        if KeychainService.load(.accessToken) == nil {
                            shareState.onError("Not signed in. Open purmemo app and sign in first.")
                            return
                        }

                        onSave(content, !aiAnalysis)
                        withAnimation(.linear(duration: 1).repeatForever(autoreverses: false)) {
                            ringRotation = 360
                        }
                        DispatchQueue.main.asyncAfter(deadline: .now() + 120) {
                            if shareState.isSaving {
                                ringRotation = 0
                                shareState.onError("Save timed out. Check your connection.")
                            }
                        }
                    } label: {
                        Group {
                            if shareState.isSaving {
                                VStack(spacing: 4) {
                                    Image(uiImage: Self.ringImage)
                                        .resizable()
                                        .frame(width: 24, height: 24)
                                        .rotationEffect(.degrees(ringRotation))
                                    if let progress = shareState.progress {
                                        Text(progress)
                                            .font(.system(size: 11))
                                            .foregroundColor(.white.opacity(0.5))
                                    }
                                }
                            } else {
                                Text(images.count > 1 ? "Save \(images.count) Images" : "Save Memory")
                                    .font(.system(size: 16, weight: .semibold))
                                    .foregroundColor(.black)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 50)
                        .background(shareState.isSaving ? Color(hex: "#1a1a1a") : Color(hex: "#E7FC44"))
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                    }
                    .disabled(shareState.isSaving || shareState.saveSuccess)
                }
                .padding(20)
                .background(
                    Color(hex: "#111111")
                        .clipShape(RoundedRectangle(cornerRadius: 20))
                )
                .padding(.horizontal, 12)
                .padding(.bottom, 20)
            }

            // Success toast overlay
            if shareState.saveSuccess {
                VStack(spacing: 16) {
                    Image(uiImage: Self.logoImage)
                        .resizable()
                        .frame(width: 56, height: 56)
                    Text(images.count > 1 ? "\(images.count) images saved" : "Saved to pūrmemo")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(.white)
                }
                .padding(32)
                .background(
                    Color(hex: "#111111")
                        .clipShape(RoundedRectangle(cornerRadius: 20))
                )
                .shadow(color: .black.opacity(0.5), radius: 20)
                .transition(.scale.combined(with: .opacity))
            }
        }
        .preferredColorScheme(.dark)
        .animation(.easeInOut(duration: 0.3), value: shareState.isSaving)
        .animation(.easeInOut(duration: 0.3), value: shareState.saveSuccess)
        .animation(.easeInOut(duration: 0.2), value: note.isEmpty)
    }
}

// Color extension for the extension target
extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let r = Double((int >> 16) & 0xFF) / 255
        let g = Double((int >> 8) & 0xFF) / 255
        let b = Double(int & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }
}
