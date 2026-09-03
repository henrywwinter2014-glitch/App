import Foundation
import SwiftData

enum WardrobeCategory: String, Codable, CaseIterable, Identifiable {
    case top, bottom, dress, outerwear, shoes, accessory

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .top: "Top"
        case .bottom: "Bottom"
        case .dress: "Dress"
        case .outerwear: "Outerwear"
        case .shoes: "Shoes"
        case .accessory: "Accessory"
        }
    }

    /// SF Symbol names chosen for confidence they exist across iOS 15-17, not perfect
    /// thematic accuracy (SF Symbols has very few literal clothing icons) — check in
    /// Xcode's SF Symbols app and swap any that render blank on your SDK.
    var icon: String {
        switch self {
        case .top: "tshirt.fill"
        case .bottom: "tshirt.fill"
        case .dress: "tshirt.fill"
        case .outerwear: "person.fill"
        case .shoes: "shoeprints.fill"
        case .accessory: "bag.fill"
        }
    }
}

/// A single cataloged piece of clothing. The AI Outfit Maker picks combinations of these
/// (see OutfitScorer.suggestCombination) rather than requiring a full outfit photo every
/// time.
@Model
final class WardrobeItem {
    var name: String
    var category: WardrobeCategory
    var colorDescription: String
    @Attribute(.externalStorage) var imageData: Data
    var createdAt: Date

    init(
        name: String,
        category: WardrobeCategory,
        colorDescription: String,
        imageData: Data,
        createdAt: Date = .now
    ) {
        self.name = name
        self.category = category
        self.colorDescription = colorDescription
        self.imageData = imageData
        self.createdAt = createdAt
    }
}
