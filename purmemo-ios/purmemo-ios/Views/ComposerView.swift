import SwiftUI
import Speech
import AVFoundation

struct ComposerView: View {
    @Binding var text: String
    let isLoading: Bool
    let onSend: () -> Void

    @State private var voiceService = VoiceService()
    @State private var isRecording = false
    @State private var micPulse = false

    private var hasText: Bool {
        !text.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: 12) {
            // Text field
            ZStack(alignment: .leading) {
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
            }

            // Send or Mic button
            if hasText || isLoading {
                // Send button
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
                .transition(.scale.combined(with: .opacity))
            } else {
                // Mic button — hold to record
                micButton
                    .transition(.scale.combined(with: .opacity))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color.black)
        .animation(.easeInOut(duration: 0.2), value: hasText)
        .animation(.easeInOut(duration: 0.2), value: isRecording)
        .overlay(alignment: .top) {
            if isRecording {
                Text("Listening...")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Color(hex: "#E7FC44"))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 4)
                    .background(Color(hex: "#E7FC44").opacity(0.1))
                    .clipShape(Capsule())
                    .offset(y: -24)
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
        }
        .onChange(of: voiceService.transcript) { _, newValue in
            if !newValue.isEmpty {
                text = newValue
            }
        }
        .onChange(of: voiceService.isFinal) { _, isFinal in
            if isFinal && !text.trimmingCharacters(in: .whitespaces).isEmpty {
                // Auto-send after final transcription
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                    onSend()
                }
            }
        }
    }

    private var micButton: some View {
        ZStack {
            // Pulsing ring when recording
            if isRecording {
                Circle()
                    .stroke(Color(hex: "#E7FC44").opacity(0.3), lineWidth: 2)
                    .frame(width: 56, height: 56)
                    .scaleEffect(micPulse ? 1.3 : 1.0)
                    .opacity(micPulse ? 0 : 0.6)
                    .animation(.easeInOut(duration: 1.0).repeatForever(autoreverses: false), value: micPulse)
                    .onAppear { micPulse = true }
                    .onDisappear { micPulse = false }
            }

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
                .scaleEffect(isRecording ? 1.1 : 1.0)
        }
        .onTapGesture {
            if isRecording {
                stopRecording()
            } else {
                startRecording()
            }
        }
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

    private var audioEngine = AVAudioEngine()
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))

    func startListening() {
        transcript = ""
        isFinal = false

        SFSpeechRecognizer.requestAuthorization { [weak self] status in
            guard status == .authorized else { return }
            DispatchQueue.main.async {
                self?.isAuthorized = true
                self?.beginRecognition()
            }
        }
    }

    func stopListening() {
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
                    self.transcript = result.bestTranscription.formattedString
                    self.isFinal = result.isFinal
                }
            }
            if error != nil || result?.isFinal == true {
                self.audioEngine.stop()
                self.audioEngine.inputNode.removeTap(onBus: 0)
                self.recognitionRequest = nil
                self.recognitionTask = nil
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
