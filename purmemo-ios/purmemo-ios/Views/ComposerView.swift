import SwiftUI
import Speech
import AVFoundation

struct ComposerView: View {
    @Binding var text: String
    let isLoading: Bool
    let onSend: () -> Void

    @State private var voiceService = VoiceService()
    @State private var isRecording = false

    private var hasText: Bool {
        !text.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        VStack(spacing: 0) {
            // Unified handle — morphs between grab bar and listening indicator
            morphingHandle
                .padding(.top, 8)
                .padding(.bottom, 6)

            HStack(alignment: .center, spacing: 12) {
                // Text field
                TextField("Save a thought or ask anything...", text: $text, axis: .vertical)
                    .font(.system(size: 16))
                    .foregroundColor(.white)
                    .lineLimit(1...5)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(Color(hex: "#1a1a1a"))
                    .clipShape(RoundedRectangle(cornerRadius: 22))
                    .overlay(
                        RoundedRectangle(cornerRadius: 22)
                            .stroke(isRecording ? Color(hex: "#E7FC44").opacity(0.4) : Color.white.opacity(0.08), lineWidth: 1)
                    )
                    .onSubmit { if !isLoading && hasText { onSend() } }
                    .submitLabel(.send)

                // Send or Mic button — fixed alignment
                if hasText || isLoading {
                    Button(action: onSend) {
                        Group {
                            if isLoading {
                                ProgressView()
                                    .progressViewStyle(CircularProgressViewStyle(tint: .black))
                                    .frame(width: 20, height: 20)
                            } else {
                                Image(systemName: "arrow.up")
                                    .font(.system(size: 16, weight: .semibold))
                                    .foregroundColor(.black)
                            }
                        }
                        .frame(width: 44, height: 44)
                        .background(Color(hex: "#E7FC44"))
                        .clipShape(Circle())
                    }
                    .disabled(!hasText || isLoading)
                } else {
                    // Mic button
                    Button {
                        if isRecording { stopRecording() } else { startRecording() }
                    } label: {
                        Image(systemName: isRecording ? "waveform" : "mic.fill")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(isRecording ? .black : .white.opacity(0.6))
                            .symbolEffect(.variableColor.iterative, isActive: isRecording)
                            .frame(width: 44, height: 44)
                            .background(isRecording ? Color(hex: "#E7FC44") : Color(hex: "#1a1a1a"))
                            .clipShape(Circle())
                            .overlay(
                                Circle()
                                    .stroke(isRecording ? Color.clear : Color.white.opacity(0.08), lineWidth: 1)
                            )
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 12)
        }
        .background(Color.black)
        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: isRecording)
        .animation(.easeInOut(duration: 0.2), value: hasText)
        .onChange(of: voiceService.transcript) { _, newValue in
            if !newValue.isEmpty {
                text = newValue
            }
        }
        .onChange(of: voiceService.isFinal) { _, isFinal in
            if isFinal && !text.trimmingCharacters(in: .whitespaces).isEmpty {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                    onSend()
                }
            }
        }
    }

    // MARK: - Morphing Handle

    /// Unified component: grab bar (rest) ↔ listening capsule (active)
    /// Animates width, color, and content with a spring transition
    private var morphingHandle: some View {
        HStack(spacing: 6) {
            if isRecording {
                Circle()
                    .fill(Color(hex: "#E7FC44"))
                    .frame(width: 6, height: 6)
                    .transition(.scale.combined(with: .opacity))

                Text("Listening")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(Color(hex: "#E7FC44"))
                    .transition(.opacity)
            }
        }
        .frame(height: 4)
        .padding(.horizontal, isRecording ? 14 : 0)
        .padding(.vertical, isRecording ? 6 : 0)
        .frame(width: isRecording ? nil : 36)
        .background(
            Capsule()
                .fill(isRecording ? Color(hex: "#E7FC44").opacity(0.12) : Color.white.opacity(0.12))
        )
        .clipShape(Capsule())
    }

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
}

// MARK: - Voice Service

@Observable
class VoiceService {
    var transcript: String = ""
    var isFinal: Bool = false
    var isAuthorized: Bool = false
    var isActive: Bool = false

    /// Accumulates finalized segments so pauses don't clear previous words
    private var finalizedText: String = ""

    private var audioEngine = AVAudioEngine()
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))

    func startListening() {
        transcript = ""
        finalizedText = ""
        isFinal = false
        isActive = true

        SFSpeechRecognizer.requestAuthorization { [weak self] status in
            guard status == .authorized else { return }
            DispatchQueue.main.async {
                self?.isAuthorized = true
                self?.beginRecognition()
            }
        }
    }

    func stopListening() {
        isActive = false
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionRequest = nil
        recognitionTask?.cancel()
        recognitionTask = nil
    }

    private func beginRecognition() {
        // Cancel any existing task
        recognitionTask?.cancel()
        recognitionTask = nil

        let audioSession = AVAudioSession.sharedInstance()
        do {
            try audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
            try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            return
        }

        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        guard let recognitionRequest else { return }
        recognitionRequest.shouldReportPartialResults = true

        // Use on-device recognition if available
        if speechRecognizer?.supportsOnDeviceRecognition == true {
            recognitionRequest.requiresOnDeviceRecognition = true
        }

        recognitionTask = speechRecognizer?.recognitionTask(with: recognitionRequest) { [weak self] result, error in
            guard let self else { return }
            if let result {
                DispatchQueue.main.async {
                    // Append to any previously finalized text
                    let newText = result.bestTranscription.formattedString
                    if self.finalizedText.isEmpty {
                        self.transcript = newText
                    } else {
                        self.transcript = self.finalizedText + " " + newText
                    }
                    if result.isFinal {
                        self.finalizedText = self.transcript
                    }
                    self.isFinal = result.isFinal
                }
            }
            if error != nil || result?.isFinal == true {
                self.audioEngine.stop()
                self.audioEngine.inputNode.removeTap(onBus: 0)
                self.recognitionRequest = nil
                self.recognitionTask = nil

                // If still actively recording, restart recognition for continuous listening
                if self.isActive {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                        self.beginRecognition()
                    }
                }
            }
        }

        let inputNode = audioEngine.inputNode

        // Remove any existing tap before installing a new one
        inputNode.removeTap(onBus: 0)

        let recordingFormat = inputNode.outputFormat(forBus: 0)

        // Guard against invalid audio format (e.g. simulator with no mic)
        guard recordingFormat.sampleRate > 0 && recordingFormat.channelCount > 0 else {
            self.recognitionRequest = nil
            self.recognitionTask = nil
            return
        }

        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
            recognitionRequest.append(buffer)
        }

        audioEngine.prepare()
        do {
            try audioEngine.start()
        } catch {
            stopListening()
        }
    }
}
