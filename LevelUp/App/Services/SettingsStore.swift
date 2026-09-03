import Foundation
import SwiftUI

enum AIModel: String, CaseIterable, Identifiable {
    case sonnet = "claude-sonnet-5"
    case opus = "claude-opus-5"
    case haiku = "claude-haiku-4-5-20251001"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .sonnet: "Sonnet (recommended)"
        case .opus: "Opus (highest quality, slower/pricier)"
        case .haiku: "Haiku (fastest/cheapest)"
        }
    }
}

/// User-configurable settings that aren't secrets. The API key itself lives in the Keychain
/// (see KeychainHelper) and is exposed here only as a computed pass-through so the rest of
/// the app has one place to look for "is AI configured".
@MainActor
final class SettingsStore: ObservableObject {
    static let shared = SettingsStore()

    private static let keychainAccount = "anthropicAPIKey"
    private static let modelKey = "aiModel"

    @Published var apiKey: String {
        didSet {
            if apiKey.isEmpty {
                KeychainHelper.delete(account: Self.keychainAccount)
            } else {
                KeychainHelper.set(apiKey, account: Self.keychainAccount)
            }
        }
    }

    @Published var model: AIModel {
        didSet { UserDefaults.standard.set(model.rawValue, forKey: Self.modelKey) }
    }

    var isAIConfigured: Bool { !apiKey.isEmpty }

    private init() {
        apiKey = KeychainHelper.get(account: Self.keychainAccount) ?? ""
        if let raw = UserDefaults.standard.string(forKey: Self.modelKey), let saved = AIModel(rawValue: raw) {
            model = saved
        } else {
            model = .sonnet
        }
    }
}
