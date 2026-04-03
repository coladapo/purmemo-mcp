import SwiftUI
import FileProvider
import ServiceManagement
import PurmemoShared

@main
struct PurmemoSyncApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        // Menu bar only — no window
        Settings {
            EmptyView()
        }
    }
}

// MARK: - App Delegate (NSStatusItem + NSPopover)

@MainActor
class AppDelegate: NSObject, NSApplicationDelegate, NSPopoverDelegate {
    private var statusItem: NSStatusItem!
    private var popover: NSPopover!
    private var eventMonitor: Any?

    let auth = AuthClient()

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Hide dock icon — menu bar only
        NSApp.setActivationPolicy(.accessory)

        // Install crash handlers — log to file before dying
        installCrashHandlers()

        let log = Log.shared // triggers startup marker in log file
        log.info("applicationDidFinishLaunching", source: "App")

        // Register as Login Item — launch automatically on boot so backups never stop
        registerLoginItem()

        // Start session sync — copy Claude Code files to our own store
        log.info("Starting full sync...", source: "App")
        SessionStore.shared.fullSync()
        SessionStore.shared.backupClaudeStores()
        SessionStore.shared.backupAllSources()
        CloudDownloadSync.shared.sync()
        SessionWatcher.shared.start()
        log.info("Sync started, watcher active, cloud download triggered", source: "App")

        // Register File Provider domain → appears under Locations in Finder
        registerFileProviderDomain()

        // Status bar item
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if let button = statusItem.button {
            // Use SF Symbol as placeholder; swap for ring asset later
            button.image = NSImage(systemSymbolName: "brain.head.profile", accessibilityDescription: "Purmemo")
            button.image?.size = NSSize(width: 18, height: 18)
            button.action = #selector(togglePopover)
            button.target = self
        }

        // Popover
        popover = NSPopover()
        popover.contentSize = NSSize(width: 380, height: 520)
        popover.behavior = .transient
        popover.animates = true
        popover.delegate = self

        let rootView = PopoverRootView(auth: auth)
        popover.contentViewController = NSHostingController(rootView: rootView)

        // Close popover on outside click
        eventMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] _ in
            self?.closePopover()
        }

        // Listen for sync requests from FinderSync extension
        DistributedNotificationCenter.default().addObserver(
            self,
            selector: #selector(handleSyncSessionNotification(_:)),
            name: .init("ai.purmemo.syncSession"),
            object: nil
        )
        DistributedNotificationCenter.default().addObserver(
            self,
            selector: #selector(handleSyncProjectNotification(_:)),
            name: .init("ai.purmemo.syncProject"),
            object: nil
        )

        // Listen for image drops — open popover to show prompt
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleShowDropPrompt),
            name: .showDropPrompt,
            object: nil
        )
    }

    @objc func handleShowDropPrompt() {
        // Open the popover so user can see the drop prompt.
        // Activate the app first so macOS allows the popover to appear
        // even if another app has focus (e.g. Finder after a drag-drop).
        NSApp.activate(ignoringOtherApps: true)

        guard let button = statusItem.button else { return }
        if !popover.isShown {
            // Small delay lets activation complete before showing the popover —
            // without this, macOS may suppress the popover if the app isn't yet frontmost.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in
                self?.popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
            }
        }
    }

    // MARK: - OAuth URL Handling

    /// Handle purmemo://oauth_callback?token=XXX&refresh_token=YYY&provider=google
    func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls {
            guard url.scheme == "purmemo",
                  url.host == "oauth_callback" else { continue }

            let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
            let params = components?.queryItems ?? []

            guard let token = params.first(where: { $0.name == "token" })?.value,
                  let refreshToken = params.first(where: { $0.name == "refresh_token" })?.value else {
                Log.shared.error("OAuth callback missing tokens", source: "OAuth")
                continue
            }

            let provider = params.first(where: { $0.name == "provider" })?.value ?? "unknown"
            Log.shared.info("OAuth callback received from \(provider)", source: "OAuth")

            Task {
                await auth.completeOAuth(accessToken: token, refreshToken: refreshToken)
                Log.shared.info("OAuth login complete — \(auth.userEmail)", source: "OAuth")
            }
        }
    }

    @objc func handleSyncSessionNotification(_ notification: Notification) {
        guard let sessionId = notification.object as? String else { return }
        CloudSync.shared.enableSync(sessionId: sessionId)
    }

    @objc func handleSyncProjectNotification(_ notification: Notification) {
        guard let projectName = notification.object as? String else { return }
        // Find all session IDs for this project from the scanner
        let store = SessionStore.shared
        // Sync using the store's manifest
        let sessionsDir = store.storeRoot.appendingPathComponent(projectName)
        if let files = try? FileManager.default.contentsOfDirectory(atPath: sessionsDir.path) {
            let sessionIds = files.filter { $0.hasSuffix(".jsonl") }.map { $0.replacingOccurrences(of: ".jsonl", with: "") }
            CloudSync.shared.enableProjectSync(project: projectName, sessionIds: sessionIds)
        }
    }

    @objc func togglePopover() {
        guard let button = statusItem.button else { return }
        if popover.isShown {
            closePopover()
        } else {
            popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
            NSApp.activate(ignoringOtherApps: true)
        }
    }

    func closePopover() {
        popover.performClose(nil)
    }

    /// Register as Login Item so PurmemoSync starts on boot — backups never stop
    private func registerLoginItem() {
        if #available(macOS 13.0, *) {
            let status = SMAppService.mainApp.status
            if status != .enabled {
                do {
                    try SMAppService.mainApp.register()
                    Log.shared.info("Registered as Login Item", source: "App")
                } catch {
                    Log.shared.error("Login Item registration failed: \(error)", source: "App")
                }
            } else {
                Log.shared.info("Already registered as Login Item", source: "App")
            }
        }
    }

    /// Register File Provider domain so purmemo appears under Locations in Finder sidebar
    private func registerFileProviderDomain() {
        let domainID = NSFileProviderDomainIdentifier("ai.purmemo.sessions")
        let domain = NSFileProviderDomain(identifier: domainID, displayName: "purmemo")

        NSFileProviderManager.add(domain) { error in
            if let error {
                Log.shared.warn("File Provider domain registration failed: \(error)", source: "FileProvider")
            } else {
                Log.shared.info("File Provider domain registered", source: "FileProvider")
            }
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        Log.shared.info("applicationWillTerminate — clean shutdown", source: "App")
        SessionWatcher.shared.stop()
        if let monitor = eventMonitor {
            NSEvent.removeMonitor(monitor)
        }
    }

    // MARK: - Crash Handlers

    /// Install signal handlers + NSException handler that write to log before crashing
    private func installCrashHandlers() {
        // Catch uncaught NSExceptions
        NSSetUncaughtExceptionHandler { exception in
            let name = exception.name.rawValue
            let reason = exception.reason ?? "unknown"
            let stack = exception.callStackSymbols.prefix(10).joined(separator: "\n  ")
            Log.shared.crash("Uncaught exception: \(name) — \(reason)\n  \(stack)", source: "Exception")
        }

        // Catch fatal signals
        let signals: [Int32] = [SIGABRT, SIGSEGV, SIGBUS, SIGFPE, SIGILL, SIGTRAP]
        for sig in signals {
            signal(sig) { sigNum in
                let name = ["SIGABRT","SIGSEGV","SIGBUS","SIGFPE","SIGILL","SIGTRAP"]
                let sigName = (0..<6).contains(Int(sigNum - 6)) ? name[Int(sigNum - 6)] : "SIG\(sigNum)"
                Log.shared.crash("Fatal signal: \(sigName) (\(sigNum))", source: "Signal")
                // Re-raise to get default behavior (crash report)
                signal(sigNum, SIG_DFL)
                raise(sigNum)
            }
        }
    }
}
