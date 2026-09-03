import SwiftUI

struct RootView: View {
    @AppStorage(SharedKey.onboardingComplete, store: AppGroup.defaults) private var onboardingComplete = false

    var body: some View {
        if onboardingComplete {
            MainTabView()
        } else {
            OnboardingView(onFinished: { onboardingComplete = true })
        }
    }
}

struct MainTabView: View {
    var body: some View {
        TabView {
            DashboardView()
                .tabItem { Label("Today", systemImage: "house.fill") }

            ChoreListView()
                .tabItem { Label("Chores", systemImage: "checklist") }

            FitnessView()
                .tabItem { Label("Fitness", systemImage: "figure.run") }

            GameTimeView()
                .tabItem { Label("Game Time", systemImage: "gamecontroller.fill") }

            CoachChatView()
                .tabItem { Label("Coach", systemImage: "sparkles") }

            OutfitView()
                .tabItem { Label("Outfits", systemImage: "tshirt.fill") }

            ScreenTimeSetupView()
                .tabItem { Label("Screen Time", systemImage: "hourglass") }

            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape.fill") }
        }
    }
}
