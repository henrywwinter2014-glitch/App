import Foundation

/// One weighted component of the fitness score (e.g. steps toward a daily target).
struct ScoreComponent {
    let name: String
    let rawValue: Double
    let target: Double
    let maxPoints: Double
    let unit: String

    /// 0...1
    var completion: Double { min(rawValue / target, 1.0) }
    var points: Double { completion * maxPoints }
    /// How far short of the target this component is, as a fraction. 0 = met or exceeded target.
    var shortfall: Double { max(0, 1.0 - completion) }
}

struct FitnessScoreResult {
    let score: Int // 0...100, rounded
    let components: [ScoreComponent]
    /// Actionable, specific corrections ordered by which component is holding the score back most.
    let corrections: [String]
}

/// Turns raw HealthKit numbers into a 0-100 daily score, plus plain-language corrections —
/// this is the "fit scorer and corrected" half of the app. Targets are deliberately modest
/// defaults (not clinical guidance); tune them in Settings later if you want them configurable.
enum FitnessScorer {
    static func score(_ metrics: DailyHealthMetrics) -> FitnessScoreResult {
        let components = [
            ScoreComponent(name: "Steps", rawValue: metrics.steps, target: 8_000, maxPoints: 30, unit: "steps"),
            ScoreComponent(name: "Exercise", rawValue: metrics.exerciseMinutes, target: 30, maxPoints: 25, unit: "min"),
            ScoreComponent(name: "Active Energy", rawValue: metrics.activeEnergy, target: 400, maxPoints: 20, unit: "kcal"),
            ScoreComponent(name: "Stand Time", rawValue: metrics.standHours, target: 10, maxPoints: 10, unit: "hr"),
            sleepComponent(hours: metrics.sleepHours)
        ]

        let total = components.reduce(0) { $0 + $1.points }
        let score = Int(round(total))
        let corrections = buildCorrections(components, sleepHours: metrics.sleepHours)

        return FitnessScoreResult(score: score, components: components, corrections: corrections)
    }

    /// Sleep is scored on closeness to an 8h target in both directions, not a simple minimum,
    /// since oversleeping isn't "better". `rawValue`/`target` here are a 0...15 proxy for the
    /// completion fraction so it plugs into the same ScoreComponent math as the other rows —
    /// the actual hours are passed separately into `buildCorrections` for messaging.
    private static func sleepComponent(hours: Double) -> ScoreComponent {
        let target = 8.0
        let deviation = abs(hours - target)
        let completion = max(0, 1 - deviation / target)
        return ScoreComponent(name: "Sleep", rawValue: completion * 15, target: 15, maxPoints: 15, unit: "hr")
    }

    private static func buildCorrections(_ components: [ScoreComponent], sleepHours: Double) -> [String] {
        let worst = components
            .filter { $0.shortfall > 0.15 } // ignore near-misses
            .sorted { $0.shortfall * $0.maxPoints > $1.shortfall * $1.maxPoints } // biggest lost-points first
            .prefix(3)

        return worst.map { component in
            switch component.name {
            case "Steps":
                let remaining = max(0, Int(component.target - component.rawValue))
                return "You're \(remaining) steps short of your goal — a 15-20 min walk closes most of that gap."
            case "Exercise":
                let remaining = max(0, Int(component.target - component.rawValue))
                return "Get \(remaining) more minutes of exercise in — even a brisk walk or a bike ride counts."
            case "Active Energy":
                let remaining = max(0, Int(component.target - component.rawValue))
                return "Burn \(remaining) more active kcal — a quick workout or a few flights of stairs will do it."
            case "Stand Time":
                return "You've been sitting a lot — stand up and move for a few minutes each hour."
            case "Sleep":
                return sleepHours < 8.0
                    ? "You're running short on sleep — try to get closer to 8 hours tonight."
                    : "You slept longer than usual — a consistent 8-hour schedule tends to score best."
            default:
                return "Keep working on \(component.name.lowercased())."
            }
        }
    }
}
