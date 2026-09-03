import Foundation
import SwiftData

/// A cached daily fitness score so the dashboard and game-time bank don't need to hit
/// HealthKit synchronously every time they're shown. Recomputed by FitnessScorer whenever
/// health data changes and upserted here, one row per calendar day.
@Model
final class FitnessSnapshot {
    var date: Date // start of day
    var score: Int // 0...100
    var steps: Double
    var exerciseMinutes: Double
    var activeEnergy: Double
    var standHours: Double
    var sleepHours: Double
    /// Human-readable corrective tips generated for this day, worst-performing component first.
    var corrections: [String]

    init(
        date: Date,
        score: Int,
        steps: Double,
        exerciseMinutes: Double,
        activeEnergy: Double,
        standHours: Double,
        sleepHours: Double,
        corrections: [String]
    ) {
        self.date = date
        self.score = score
        self.steps = steps
        self.exerciseMinutes = exerciseMinutes
        self.activeEnergy = activeEnergy
        self.standHours = standHours
        self.sleepHours = sleepHours
        self.corrections = corrections
    }
}
