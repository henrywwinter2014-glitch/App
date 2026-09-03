import Foundation
import SwiftData

/// A record of one outfit photo scored by the on-device Core ML model (see OutfitScorer).
/// Kept as history so the Outfits tab can show a score trend the same way FitnessSnapshot
/// does for fitness.
@Model
final class OutfitLog {
    var date: Date
    @Attribute(.externalStorage) var imageData: Data?
    var note: String
    var score: Int

    init(date: Date = .now, imageData: Data? = nil, note: String = "", score: Int) {
        self.date = date
        self.imageData = imageData
        self.note = note
        self.score = score
    }
}
