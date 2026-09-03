import Foundation

/// Thin wrapper around Anthropic's Messages API. Every AI-powered feature in the app
/// (coach chat, chore suggestions, fitness insights, game-time tips, outfit scoring) goes
/// through this one call site. Uses the user's own API key from SettingsStore/Keychain —
/// there is no backend, requests go straight from this device to api.anthropic.com.
enum AIClient {
    struct ImageAttachment {
        let base64: String
        let mediaType: String // e.g. "image/jpeg"
    }

    enum AIClientError: LocalizedError {
        case missingAPIKey
        case badResponse(String)
        case http(Int, String)

        var errorDescription: String? {
            switch self {
            case .missingAPIKey:
                "Add your Anthropic API key in Settings first."
            case .badResponse(let detail):
                "Unexpected response from AI: \(detail)"
            case .http(let code, let detail):
                "AI request failed (\(code)): \(detail)"
            }
        }
    }

    private static let endpoint = URL(string: "https://api.anthropic.com/v1/messages")!
    private static let apiVersion = "2023-06-01"

    /// Sends a single-turn or multi-turn request and returns the concatenated text of the
    /// reply. `history` is prior turns (role: "user"/"assistant"); `images` attach to the
    /// final user turn only (used by the outfit scorer).
    ///
    /// Marked `@MainActor` only because it reads `SettingsStore.shared` (itself
    /// MainActor-isolated) up front — the actual network round trip is still async and
    /// doesn't block the UI.
    @MainActor
    static func complete(
        system: String,
        history: [(role: String, text: String)] = [],
        userText: String,
        images: [ImageAttachment] = [],
        maxTokens: Int = 1024
    ) async throws -> String {
        guard !SettingsStore.shared.apiKey.isEmpty else { throw AIClientError.missingAPIKey }
        let apiKey = SettingsStore.shared.apiKey
        let model = SettingsStore.shared.model.rawValue

        var messages: [[String: Any]] = history.map { ["role": $0.role, "content": $0.text] }

        var finalContent: [[String: Any]] = images.map {
            ["type": "image", "source": ["type": "base64", "media_type": $0.mediaType, "data": $0.base64]]
        }
        finalContent.append(["type": "text", "text": userText])
        messages.append(["role": "user", "content": finalContent])

        let body: [String: Any] = [
            "model": model,
            "max_tokens": maxTokens,
            "system": system,
            "messages": messages
        ]

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue(apiVersion, forHTTPHeaderField: "anthropic-version")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let http = response as? HTTPURLResponse else {
            throw AIClientError.badResponse("no HTTP response")
        }
        guard (200...299).contains(http.statusCode) else {
            let detail = String(data: data, encoding: .utf8) ?? "unknown error"
            throw AIClientError.http(http.statusCode, detail)
        }

        guard
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
            let content = json["content"] as? [[String: Any]]
        else {
            throw AIClientError.badResponse("missing content array")
        }

        let text = content
            .compactMap { $0["text"] as? String }
            .joined(separator: "\n")

        guard !text.isEmpty else {
            throw AIClientError.badResponse("empty text content")
        }
        return text
    }
}
