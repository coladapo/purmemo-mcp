import SwiftUI
import Speech
import AVFoundation

struct ScreenshotCaptureView: View {
    var authService: AuthService
    var screenshotManager: ScreenshotManager

    @State private var contextText = ""
    @State private var isSaving = false
    @State private var isRecording = false
    @State private var showSuccess = false
    @State private var voiceService = VoiceService()
    @Environment(\.dismiss) private var dismiss

    private var hasContext: Bool {
        !contextText.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                ScrollView {
                    VStack(spacing: 16) {
                        screenshotPreview
                        contextInput
                        saveButton
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 16)
                }
            }
        }
        .preferredColorScheme(.dark)
        .animation(.easeInOut(duration: 0.2), value: isRecording)
        .animation(.easeInOut(duration: 0.2), value: contextText.isEmpty)
        .onChange(of: voiceService.transcript) { _, newValue in
            if !newValue.isEmpty {
                contextText = newValue
            }
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Save Screenshot")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(.white)
                Text("Add context to remember why")
                    .font(.system(size: 13))
                    .foregroundColor(.white.opacity(0.4))
            }

            Spacer()

            Button {
                screenshotManager.clear()
                dismiss()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 24))
                    .foregroundColor(.white.opacity(0.3))
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
        .background(Color.black)
        .overlay(
            Rectangle()
                .frame(height: 0.5)
                .foregroundColor(.white.opacity(0.08)),
            alignment: .bottom
        )
    }

    // MARK: - Screenshot Preview

    private var screenshotPreview: some View {
        Group {
            if let image = screenshotManager.pendingImage {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(maxHeight: 300)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(Color.white.opacity(0.08), lineWidth: 1)
                    )
            } else {
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color(hex: "#1a1a1a"))
                    .frame(height: 200)
                    .overlay(
                        VStack(spacing: 8) {
                            Image(systemName: "photo")
                                .font(.system(size: 32))
                                .foregroundColor(.white.opacity(0.2))
                            Text("No screenshot")
                                .font(.system(size: 13))
                                .foregroundColor(.white.opacity(0.3))
                        }
                    )
            }
        }
    }

    // MARK: - Context Input

    private var contextInput: some View {
        Group {
            if contextText.isEmpty && !isRecording {
                // Empty state — tap to record or type
                VStack(spacing: 10) {
                    Button {
                        startRecording()
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: "mic.fill")
                                .font(.system(size: 15, weight: .medium))
                                .foregroundColor(Color(hex: "#E7FC44"))
                            Text("Tap to add a voice note...")
                                .font(.system(size: 15))
                                .foregroundColor(.white.opacity(0.35))
                            Spacer()
                        }
                        .padding(14)
                        .background(Color(hex: "#1a1a1a"))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(Color.white.opacity(0.08), lineWidth: 1)
                        )
                    }

                    Text("or type below")
                        .font(.system(size: 12))
                        .foregroundColor(.white.opacity(0.2))

                    TextField("What's this screenshot about?", text: $contextText, axis: .vertical)
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
                }
            } else if isRecording {
                // Recording state
                Button {
                    stopRecording()
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "waveform")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundColor(.black)
                            .symbolEffect(.variableColor.iterative, isActive: true)
                        Text(voiceService.transcript.isEmpty ? "Listening..." : voiceService.transcript)
                            .font(.system(size: 15))
                            .foregroundColor(voiceService.transcript.isEmpty ? .black.opacity(0.5) : .black)
                            .lineLimit(3)
                            .multilineTextAlignment(.leading)
                        Spacer()
                        Text("Tap to stop")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(.black.opacity(0.5))
                    }
                    .padding(14)
                    .background(Color(hex: "#E7FC44"))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            } else {
                // Filled state — editable text with clear button
                HStack(alignment: .top) {
                    TextField("What's this screenshot about?", text: $contextText, axis: .vertical)
                        .font(.system(size: 15))
                        .foregroundColor(.white)
                        .lineLimit(2...8)
                    Button {
                        contextText = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 16))
                            .foregroundColor(.white.opacity(0.2))
                    }
                }
                .padding(14)
                .background(Color(hex: "#1a1a1a"))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.white.opacity(0.08), lineWidth: 1)
                )
            }
        }
    }

    // MARK: - Save Button

    private var saveButton: some View {
        Button {
            Task { await saveScreenshot() }
        } label: {
            Group {
                if isSaving {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .black))
                } else if showSuccess {
                    HStack(spacing: 6) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 14))
                        Text("Saved!")
                    }
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.black)
                } else {
                    Text("Save to pūrmemo")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.black)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .background(hasContext ? Color(hex: "#E7FC44") : Color(hex: "#E7FC44").opacity(0.3))
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
        .disabled(!hasContext || isSaving || showSuccess)
    }

    // MARK: - Actions

    private func startRecording() {
        let haptic = UIImpactFeedbackGenerator(style: .medium)
        haptic.impactOccurred()
        isRecording = true
        voiceService.startListening()
    }

    private func stopRecording() {
        let haptic = UIImpactFeedbackGenerator(style: .light)
        haptic.impactOccurred()
        isRecording = false
        voiceService.stopListening()
    }

    private func saveScreenshot() async {
        guard let imageData = screenshotManager.pendingScreenshotData else { return }
        let context = contextText.trimmingCharacters(in: .whitespaces)
        guard !context.isEmpty else { return }

        isSaving = true

        do {
            let api = PurmemoAPI(authService: authService)
            _ = try await api.saveScreenshotMemory(imageData: imageData, context: context)

            let haptic = UINotificationFeedbackGenerator()
            haptic.notificationOccurred(.success)

            showSuccess = true
            try? await Task.sleep(for: .seconds(1.5))

            screenshotManager.clear()
            dismiss()
        } catch {
            isSaving = false
        }
    }
}
