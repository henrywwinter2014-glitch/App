import Foundation
import SwiftData

enum PersistenceController {
    /// The main app's model container. Chores/points/fitness history live only in the main
    /// app's process — the extensions never touch SwiftData directly, they only read the
    /// small set of values the app mirrors into shared UserDefaults (see AppGroupConstants).
    static let schema = Schema([
        Chore.self,
        ChoreCompletion.self,
        FitnessSnapshot.self,
        PointsTransaction.self,
        WardrobeItem.self,
        OutfitLog.self
    ])

    static func makeContainer() -> ModelContainer {
        let configuration = ModelConfiguration(schema: schema, isStoredInMemoryOnly: false)
        do {
            return try ModelContainer(for: schema, configurations: [configuration])
        } catch {
            fatalError("Failed to create ModelContainer: \(error)")
        }
    }
}
