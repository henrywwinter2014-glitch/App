import Foundation
import SwiftData

enum PointsSource: String, Codable {
    case chore
    case fitnessBonus
    case gameTimeRedemption
    case manualAdjustment
}

/// A single ledger entry. Positive amount = earned, negative = spent (redeemed for game time).
/// The running balance is always `sum(amount)`, never stored separately, so it can't drift.
@Model
final class PointsTransaction {
    var amount: Int
    var source: PointsSource
    var note: String
    var createdAt: Date

    init(amount: Int, source: PointsSource, note: String = "", createdAt: Date = .now) {
        self.amount = amount
        self.source = source
        self.note = note
        self.createdAt = createdAt
    }
}
