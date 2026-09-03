import Foundation

/// A single short, actionable recommendation about *right now* — e.g. whether to redeem
/// game time yet or knock out one more chore first. Callers are responsible for caching
/// (see GameTimeView/DashboardView, which cache one tip per calendar day in UserDefaults)
/// since this hits the network each time it's called.
enum CoachTipService {
    private static let systemPrompt = """
    You give one-line, real-time recommendations inside a chores/fitness/game-time app. \
    Given the current status, respond with ONE short sentence (max ~20 words) telling the \
    user what to do right now — e.g. redeem game time, finish one more chore first, or go \
    for a quick walk to close out their fitness score. Be direct and specific to the status \
    given. No preamble, no quotes, just the sentence.
    """

    static func tip(statusContext: String) async throws -> String {
        try await AIClient.complete(system: systemPrompt, userText: statusContext, maxTokens: 100)
    }
}
