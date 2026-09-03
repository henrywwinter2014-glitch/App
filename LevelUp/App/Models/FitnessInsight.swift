import Foundation
import SwiftData

/// A cached AI-written weekly summary, keyed by the Monday of the week it covers, so
/// FitnessView doesn't call the API every time it's opened — only when the user asks to
/// refresh, or a new week has started.
@Model
final class FitnessInsight {
    var weekStart: Date
    var summary: String
    var generatedAt: Date

    init(weekStart: Date, summary: String, generatedAt: Date = .now) {
        self.weekStart = weekStart
        self.summary = summary
        self.generatedAt = generatedAt
    }
}
