import Foundation
import Security

enum KeychainKey: String {
    case accessToken  = "ai.purmemo.accessToken"
    case refreshToken = "ai.purmemo.refreshToken"
    case userEmail    = "ai.purmemo.userEmail"
}

struct KeychainService {

    /// Shared access group so the Share Extension can read tokens
    private static let accessGroup = "DC7489SG7F.ai.purmemo.shared"

    static func save(_ value: String, for key: KeychainKey) {
        guard let data = value.data(using: .utf8) else { return }
        let query: [CFString: Any] = [
            kSecClass:          kSecClassGenericPassword,
            kSecAttrAccount:    key.rawValue,
            kSecAttrAccessGroup: accessGroup,
            kSecValueData:      data
        ]
        SecItemDelete(query as CFDictionary)
        SecItemAdd(query as CFDictionary, nil)
    }

    static func load(_ key: KeychainKey) -> String? {
        let query: [CFString: Any] = [
            kSecClass:           kSecClassGenericPassword,
            kSecAttrAccount:     key.rawValue,
            kSecAttrAccessGroup: accessGroup,
            kSecReturnData:      true,
            kSecMatchLimit:      kSecMatchLimitOne
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess,
              let data = result as? Data,
              let string = String(data: data, encoding: .utf8)
        else { return nil }
        return string
    }

    static func delete(_ key: KeychainKey) {
        let query: [CFString: Any] = [
            kSecClass:           kSecClassGenericPassword,
            kSecAttrAccount:     key.rawValue,
            kSecAttrAccessGroup: accessGroup
        ]
        SecItemDelete(query as CFDictionary)
    }

    static func deleteAll() {
        delete(.accessToken)
        delete(.refreshToken)
        delete(.userEmail)
    }
}
