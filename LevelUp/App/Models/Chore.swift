import Foundation
import SwiftData

enum Weekday: Int, Codable, CaseIterable, Identifiable {
    case sunday = 1, monday, tuesday, wednesday, thursday, friday, saturday
    var id: Int { rawValue }

    var shortLabel: String {
        switch self {
        case .sunday: "Su"
        case .monday: "Mo"
        case .tuesday: "Tu"
        case .wednesday: "We"
        case .thursday: "Th"
        case .friday: "Fr"
        case .saturday: "Sa"
        }
    }
}

@Model
final class Chore {
    var title: String
    var points: Int
    var icon: String // SF Symbol name
    /// Days of the week this chore is due. Empty means "every day".
    var scheduledDays: [Weekday]
    var createdAt: Date
    var isArchived: Bool

    @Relationship(deleteRule: .cascade, inverse: \ChoreCompletion.chore)
    var completions: [ChoreCompletion] = []

    init(
        title: String,
        points: Int = 10,
        icon: String = "checkmark.circle",
        scheduledDays: [Weekday] = [],
        createdAt: Date = .now,
        isArchived: Bool = false
    ) {
        self.title = title
        self.points = points
        self.icon = icon
        self.scheduledDays = scheduledDays
        self.createdAt = createdAt
        self.isArchived = isArchived
    }

    func isDue(on date: Date = .now) -> Bool {
        guard !scheduledDays.isEmpty else { return true }
        let weekday = Calendar.current.component(.weekday, from: date)
        return scheduledDays.contains { $0.rawValue == weekday }
    }

    func isCompleted(on date: Date = .now) -> Bool {
        let cal = Calendar.current
        return completions.contains { cal.isDate($0.completedAt, inSameDayAs: date) }
    }

    /// Consecutive days (ending yesterday or today) this chore has been completed on days it was due.
    func currentStreak(referenceDate: Date = .now) -> Int {
        let cal = Calendar.current
        var streak = 0
        var day = cal.startOfDay(for: referenceDate)

        // If today is due and not yet done, streak counting starts from yesterday.
        if isDue(on: day) && !isCompleted(on: day) {
            guard let yesterday = cal.date(byAdding: .day, value: -1, to: day) else { return 0 }
            day = yesterday
        }

        while true {
            if isDue(on: day) {
                if isCompleted(on: day) {
                    streak += 1
                } else {
                    break
                }
            }
            guard let previous = cal.date(byAdding: .day, value: -1, to: day) else { break }
            // Safety valve: don't walk back further than a year.
            if cal.dateComponents([.day], from: previous, to: referenceDate).day ?? 0 > 365 { break }
            day = previous
        }
        return streak
    }
}

@Model
final class ChoreCompletion {
    var completedAt: Date
    var pointsAwarded: Int
    var chore: Chore?

    init(completedAt: Date = .now, pointsAwarded: Int, chore: Chore? = nil) {
        self.completedAt = completedAt
        self.pointsAwarded = pointsAwarded
        self.chore = chore
    }
}
