import Foundation
import SwiftData

/// A record of one AI-scored outfit — either a full-outfit photo or an AI-picked
/// combination of cataloged WardrobeItems. Kept as history so the Outfit tab can show a
/// score trend the same way FitnessSnapshot does for fitness.
@Model
final class OutfitLog {
    var date: Date
    @Attribute(.externalStorage) var imageData: Data?
    var occasion: String
    var score: Int
    var feedback: String
    var suggestions: [String]

    init(
        date: Date = .now,
        imageData: Data? = nil,
        occasion: String,
        score: Int,
        feedback: String,
        suggestions: [String] = []
    ) {
        self.date = date
        self.imageData = imageData
        self.occasion = occasion
        self.score = score
        self.feedback = feedback
        self.suggestions = suggestions
    }
}
