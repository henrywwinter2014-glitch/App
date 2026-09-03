import Foundation
import ManagedSettings
import DeviceActivity

/// Everything the main app and its Device Activity / Shield extensions need to agree on.
/// Extensions run in separate processes, so this is the entire contract between them —
/// keep it small and stable.
enum AppGroup {
    static let identifier = "group.com.example.levelup"

    static var defaults: UserDefaults {
        guard let d = UserDefaults(suiteName: identifier) else {
            fatalError("App Group '\(identifier)' is not configured. Check the entitlements for every target.")
        }
        return d
    }
}

/// Keys into the shared UserDefaults suite. The main app writes these when the user redeems
/// game time or completes onboarding; the extensions only ever read them.
enum SharedKey {
    static let unlockExpiresAt = "unlockExpiresAt"          // Date? — when the current unlock window ends
    static let earnedMinutesToday = "earnedMinutesToday"     // Double — minutes earned but not yet redeemed
    static let dailyResetDate = "dailyResetDate"              // Date — last day the ledger was rolled over
    static let selectedAppsData = "selectedAppsData"          // Data — encoded FamilyActivitySelection
    static let onboardingComplete = "onboardingComplete"      // Bool
}

/// The single named ManagedSettingsStore shared by the app and the Shield extensions.
/// Using a *named* store means whichever process touches it (app, DeviceActivityMonitor,
/// ShieldConfiguration) is reading/writing the same underlying shield state.
extension ManagedSettingsStore.Name {
    static let levelUp = Self("levelUpStore")
}

/// Name for the DeviceActivity schedule so the app and the monitor extension refer to the
/// same activity by the same string. LevelUp reuses this single schedule name for both the
/// recurring daily monitoring window and one-shot redemption windows (see
/// `ShieldController.scheduleReshield`) — reshielding is driven entirely by schedule
/// start/end callbacks, not threshold events.
enum ActivityName {
    static let daily = DeviceActivityName("com.example.levelup.daily")
}
