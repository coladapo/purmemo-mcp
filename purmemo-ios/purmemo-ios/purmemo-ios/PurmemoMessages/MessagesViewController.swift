import UIKit
import Messages
import SwiftUI

class MessagesViewController: MSMessagesAppViewController {

    override func viewDidLoad() {
        super.viewDidLoad()
        presentMessageUI()
    }

    override func willBecomeActive(with conversation: MSConversation) {
        super.willBecomeActive(with: conversation)
        presentMessageUI()
    }

    override func willTransition(to presentationStyle: MSMessagesAppPresentationStyle) {
        super.willTransition(to: presentationStyle)
        presentMessageUI()
    }

    private func presentMessageUI() {
        // Remove any existing child
        for child in children {
            child.willMove(toParent: nil)
            child.view.removeFromSuperview()
            child.removeFromParent()
        }

        let isExpanded = presentationStyle == .expanded
        let messageView = MessageExtensionView(
            isExpanded: isExpanded,
            onExpand: { [weak self] in
                self?.requestPresentationStyle(.expanded)
            },
            onInsertMemory: { [weak self] memory in
                self?.insertMemoryMessage(memory)
            },
            onCollapse: { [weak self] in
                self?.requestPresentationStyle(.compact)
            }
        )

        let hostingController = UIHostingController(rootView: messageView)
        addChild(hostingController)
        hostingController.view.frame = view.bounds
        hostingController.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        hostingController.view.backgroundColor = .clear
        view.addSubview(hostingController.view)
        hostingController.didMove(toParent: self)
    }

    private func insertMemoryMessage(_ memory: RecallResult) {
        guard let conversation = activeConversation else { return }

        let layout = MSMessageTemplateLayout()
        layout.caption = memory.title ?? "Memory"
        layout.subcaption = String(memory.content.prefix(200))

        var trailing = "via pūrmemo"
        if let platform = memory.platform, !platform.isEmpty {
            trailing = "\(platform) · pūrmemo"
        }
        layout.trailingSubcaption = trailing

        let message = MSMessage()
        message.layout = layout
        message.summaryText = "\(memory.title ?? "Memory") — \(String(memory.content.prefix(80)))"

        // Deep link to memory in app
        var components = URLComponents()
        components.scheme = "purmemo"
        components.host = "memory"
        components.queryItems = [URLQueryItem(name: "id", value: memory.id)]
        message.url = components.url

        conversation.insert(message) { error in
            if error == nil {
                self.requestPresentationStyle(.compact)
            }
        }
    }
}
