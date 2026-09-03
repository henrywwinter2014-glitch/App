import Foundation

struct OutfitScoreResult: Codable {
    let score: Int
    let feedback: String
    let suggestions: [String]
}

struct OutfitCombinationResult: Codable {
    let chosenItemNames: [String]
    let reasoning: String
    let score: Int
}

/// The "outfit maker and scorer" AI feature: score a photo of a full outfit, or have the
/// AI pick the best combination out of cataloged WardrobeItems for a given occasion.
enum OutfitScorer {
    private static let scoreSystemPrompt = """
    You are a fashion outfit scorer inside a motivation app. Respond with ONLY JSON (no \
    markdown fences, no prose) shaped exactly like: {"score": integer 0-100, "feedback": \
    "1-2 sentence overall assessment", "suggestions": ["short improvement tip", ...]} with \
    0-3 suggestions. Be encouraging but honest — consider color coordination, fit, and \
    whether the outfit suits the stated occasion (if any).
    """

    static func scorePhoto(imageData: Data, occasion: String) async throws -> OutfitScoreResult {
        let attachment = AIClient.ImageAttachment(base64: imageData.base64EncodedString(), mediaType: "image/jpeg")
        let userText = occasion.isEmpty ? "Score this outfit." : "Score this outfit for this occasion: \(occasion)."

        let raw = try await AIClient.complete(
            system: scoreSystemPrompt,
            userText: userText,
            images: [attachment],
            maxTokens: 400
        )
        return try parse(raw, as: OutfitScoreResult.self, opening: "{", closing: "}")
    }

    private static let combineSystemPrompt = """
    You help pick outfit combinations from a wardrobe catalog for a motivation app. You'll \
    be given several clothing item photos, in the same order as a numbered list of their \
    name/category/color in the message text. Respond with ONLY JSON (no markdown fences, no \
    prose) shaped exactly like: {"chosenItemNames": [string, ...], "reasoning": "1-2 \
    sentences", "score": integer 0-100} — choose the item names (copied exactly from the \
    list) that form the best coherent outfit for the requested occasion, typically 2-4 items.
    """

    /// Sends up to the first 12 wardrobe items' photos in one request — keep the catalog
    /// reasonably sized, or this call gets slow/expensive and may hit the model's per-request
    /// image limit.
    static func suggestCombination(items: [WardrobeItem], occasion: String) async throws -> OutfitCombinationResult {
        guard !items.isEmpty else {
            throw AIClient.AIClientError.badResponse("no wardrobe items to choose from")
        }
        let capped = Array(items.prefix(12))
        let attachments = capped.map {
            AIClient.ImageAttachment(base64: $0.imageData.base64EncodedString(), mediaType: "image/jpeg")
        }
        let catalog = capped.enumerated()
            .map { index, item in "\(index + 1). \(item.name) — \(item.category.displayName), \(item.colorDescription)" }
            .joined(separator: "\n")
        let userText = """
        Wardrobe items (photos attached in this order):
        \(catalog)

        Occasion: \(occasion.isEmpty ? "everyday casual" : occasion)
        """

        let raw = try await AIClient.complete(
            system: combineSystemPrompt,
            userText: userText,
            images: attachments,
            maxTokens: 400
        )
        return try parse(raw, as: OutfitCombinationResult.self, opening: "{", closing: "}")
    }

    private static func parse<T: Decodable>(_ raw: String, as type: T.Type, opening: Character, closing: Character) throws -> T {
        guard let start = raw.firstIndex(of: opening), let end = raw.lastIndex(of: closing), start < end else {
            throw AIClient.AIClientError.badResponse("no JSON object found in reply")
        }
        let data = Data(raw[start...end].utf8)
        return try JSONDecoder().decode(T.self, from: data)
    }
}
