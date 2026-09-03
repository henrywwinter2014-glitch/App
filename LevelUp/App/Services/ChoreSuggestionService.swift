import Foundation

struct SuggestedChore: Codable, Identifiable {
    var id: String { title }
    let title: String
    let points: Int
    let icon: String
    let everyDay: Bool
}

/// Asks the AI for a starter list of chores instead of the user typing them all in by hand.
enum ChoreSuggestionService {
    private static let systemPrompt = """
    You generate household chore lists for a chore-tracking app. Respond with ONLY a JSON \
    array (no prose, no markdown fences) of 6-10 objects shaped exactly like: \
    {"title": string, "points": integer 5-30, "icon": string, "everyDay": boolean}. \
    "icon" must be one of exactly these SF Symbol names: checkmark.circle, bed.double.fill, \
    trash.fill, fork.knife, pawprint.fill, book.fill, washer.fill, leaf.fill, car.fill, \
    backpack.fill. Pick reasonable point values (harder/longer chores score higher). Set \
    "everyDay" true only for chores that genuinely happen daily (e.g. making your bed); \
    otherwise false.
    """

    static func suggestChores(context userContext: String) async throws -> [SuggestedChore] {
        let raw = try await AIClient.complete(
            system: systemPrompt,
            userText: userContext.isEmpty
                ? "Suggest a general starter chore list for a household."
                : "Suggest chores for: \(userContext)",
            maxTokens: 800
        )
        return try parse(raw)
    }

    private static func parse(_ raw: String) throws -> [SuggestedChore] {
        guard let start = raw.firstIndex(of: "["), let end = raw.lastIndex(of: "]"), start < end else {
            throw AIClient.AIClientError.badResponse("no JSON array found in reply")
        }
        let jsonSubstring = raw[start...end]
        let data = Data(jsonSubstring.utf8)
        return try JSONDecoder().decode([SuggestedChore].self, from: data)
    }
}
