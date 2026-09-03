import Foundation

/// Turns a week of FitnessSnapshot history into a short natural-language summary — the AI
/// counterpart to FitnessScorer's rule-based, per-day "corrections". This looks at trends
/// across days rather than just today.
enum FitnessInsightService {
    private static let systemPrompt = """
    You are a supportive (not preachy) fitness summarizer inside a habit-tracking app. \
    Given a week of daily fitness scores and their components, write a short summary: \
    1-2 sentences on the overall trend, then 1-2 sentences of specific, encouraging advice \
    for next week. Plain text only, no markdown, no headers, 3-4 sentences total. You are \
    not a medical professional — keep advice general.
    """

    static func weeklySummary(for snapshots: [FitnessSnapshot]) async throws -> String {
        guard !snapshots.isEmpty else {
            return "Not enough data yet this week — log a few more days to get an AI summary."
        }
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE"

        let lines = snapshots
            .sorted { $0.date < $1.date }
            .map { snap in
                "\(formatter.string(from: snap.date)): score \(snap.score), " +
                "steps \(Int(snap.steps)), exercise \(Int(snap.exerciseMinutes))min, " +
                "active energy \(Int(snap.activeEnergy))kcal, stand \(String(format: "%.1f", snap.standHours))hr, " +
                "sleep \(String(format: "%.1f", snap.sleepHours))hr"
            }
            .joined(separator: "\n")

        return try await AIClient.complete(
            system: systemPrompt,
            userText: "This week's daily fitness data:\n\(lines)",
            maxTokens: 300
        )
    }
}
