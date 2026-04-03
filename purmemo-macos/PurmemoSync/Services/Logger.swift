import Foundation
import os.log

/// Persistent logger for PurmemoSync.
/// Writes to ~/purmemo sync/claude-code/purmemosync.log AND os_log (Console.app).
/// Survives crashes — log file is flushed on every write.
final class Log {
    static let shared = Log()

    private let osLog = OSLog(subsystem: "ai.purmemo.sync", category: "general")
    private let logFileURL: URL
    private let queue = DispatchQueue(label: "ai.purmemo.log", qos: .utility)
    private let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd HH:mm:ss.SSS"
        return f
    }()

    private init() {
        logFileURL = SessionStore.purmemoHome
            .appendingPathComponent("purmemosync.log")

        // Ensure parent dir exists
        try? FileManager.default.createDirectory(
            at: logFileURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )

        // Rotate if log exceeds 5MB
        if let attrs = try? FileManager.default.attributesOfItem(atPath: logFileURL.path),
           let size = attrs[.size] as? UInt64, size > 5_242_880 {
            let backupURL = logFileURL.deletingPathExtension().appendingPathExtension("old.log")
            try? FileManager.default.removeItem(at: backupURL)
            try? FileManager.default.moveItem(at: logFileURL, to: backupURL)
        }

        // Write startup marker
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "?"
        writeRaw("\n══════════════════════════════════════════════")
        writeRaw("PurmemoSync started — v\(version) (\(build)) — PID \(ProcessInfo.processInfo.processIdentifier)")
        writeRaw("══════════════════════════════════════════════")
    }

    // MARK: - Public API

    func info(_ message: String, source: String = "App") {
        log(level: "INFO", source: source, message: message)
        os_log(.info, log: osLog, "%{public}@: %{public}@", source, message)
    }

    func error(_ message: String, source: String = "App") {
        log(level: "ERROR", source: source, message: message)
        os_log(.error, log: osLog, "ERROR %{public}@: %{public}@", source, message)
    }

    func warn(_ message: String, source: String = "App") {
        log(level: "WARN", source: source, message: message)
        os_log(.default, log: osLog, "WARN %{public}@: %{public}@", source, message)
    }

    /// Log a crash or unexpected termination reason
    func crash(_ message: String, source: String = "App") {
        log(level: "CRASH", source: source, message: message)
        os_log(.fault, log: osLog, "CRASH %{public}@: %{public}@", source, message)
    }

    // MARK: - File Writing

    private func log(level: String, source: String, message: String) {
        let timestamp = dateFormatter.string(from: Date())
        let line = "[\(timestamp)] [\(level)] [\(source)] \(message)"
        writeRaw(line)
        #if DEBUG
        print(line)
        #endif
    }

    private func writeRaw(_ line: String) {
        queue.async { [self] in
            let data = (line + "\n").data(using: .utf8) ?? Data()

            // Create file if it doesn't exist
            if !FileManager.default.fileExists(atPath: logFileURL.path) {
                FileManager.default.createFile(atPath: logFileURL.path, contents: data)
                return
            }

            // Append to existing file
            if let handle = try? FileHandle(forWritingTo: logFileURL) {
                handle.seekToEndOfFile()
                handle.write(data)
                handle.closeFile()
            }
        }
    }
}
