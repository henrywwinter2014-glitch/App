import Foundation

/// Builds the compact "here's where things stand" text block that grounds every AI feature
/// (coach chat, coach tip, fitness insights) in the user's actual current state, so replies
/// aren't generic. Kept in one place so all features describe the app state the same way.
enum AIContextBuilder {
    static func todaySummary(
        chores: [Chore],
        pointsBalance: Int,
        fitnessScore: Int?,
        isUnlocked: Bool
    ) -> String {
        let due = chores.filter { !$0.isArchived && $0.isDue() }
        let completed = due.filter { $0.isCompleted() }
        let remaining = due.filter { !$0.isCompleted() }

        var lines: [String] = []
        lines.append("Chores today: \(completed.count)/\(due.count) done.")
        if !remaining.isEmpty {
            lines.append("Still to do: " + remaining.map(\.title).joined(separator: ", ") + ".")
        }
        lines.append("Points balance: \(pointsBalance).")
        if let fitnessScore {
            lines.append("Today's fitness score: \(fitnessScore)/100.")
        } else {
            lines.append("No fitness data recorded yet today.")
        }
        lines.append(isUnlocked ? "Game time is currently unlocked." : "Apps are currently locked.")
        return lines.joined(separator: " ")
    }

    static let coachSystemPrompt = """
    You are the in-app coach for LevelUp, an app that gates a person's game/social apps \
    behind finishing chores and hitting a daily fitness score. Be warm, encouraging, and \
    concise (2-4 sentences unless asked for more detail). Use the "current status" context \
    you're given to make replies specific, not generic. Never suggest bypassing or disabling \
    the app's restrictions. You're not a medical or fitness professional — keep fitness \
    advice general and encourage seeing a doctor or coach for anything specific.
    """
}
