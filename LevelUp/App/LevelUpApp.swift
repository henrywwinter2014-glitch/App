import SwiftUI
import SwiftData

@main
struct LevelUpApp: App {
    let container = PersistenceController.makeContainer()
    @StateObject private var screenTime = ScreenTimeManager.shared
    @StateObject private var gameTimeBank = GameTimeBank.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(screenTime)
                .environmentObject(gameTimeBank)
        }
        .modelContainer(container)
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .active {
                gameTimeBank.refreshFromSharedState()
            }
        }
    }
}
