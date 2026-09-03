import DeviceActivity
import ManagedSettings
import FamilyControls
import Foundation

/// Runs in its own process, invoked by the system at the schedule boundaries LevelUp
/// registers via `DeviceActivityCenter.startMonitoring` (ScreenTimeManager/ShieldController).
/// It has no UI and no access to the main app's SwiftData store — everything it needs to
/// decide "should apps be shielded right now" comes from the shared App Group defaults.
class DeviceActivityMonitorExtension: DeviceActivityMonitor {

    override func intervalDidStart(for activity: DeviceActivityName) {
        super.intervalDidStart(for: activity)
        reshieldIfWindowElapsed()
    }

    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)
        // Daily boundary (or a redemption window) ended — always safe to reshield, and this
        // is also where a fresh day's monitoring schedule effectively resets.
        reshield()
        AppGroup.defaults.removeObject(forKey: SharedKey.unlockExpiresAt)
    }

    /// On interval start, double-check whether an unlock window that was supposed to have
    /// already ended is still sitting in shared defaults (e.g. the device was off when the
    /// prior interval's `intervalDidEnd` should have fired) and correct it.
    private func reshieldIfWindowElapsed() {
        if let expiresAt = AppGroup.defaults.object(forKey: SharedKey.unlockExpiresAt) as? Date, expiresAt <= Date() {
            reshield()
            AppGroup.defaults.removeObject(forKey: SharedKey.unlockExpiresAt)
        } else if AppGroup.defaults.object(forKey: SharedKey.unlockExpiresAt) == nil {
            reshield()
        }
    }

    private func reshield() {
        guard let data = AppGroup.defaults.data(forKey: SharedKey.selectedAppsData),
              let selection = try? JSONDecoder().decode(FamilyActivitySelection.self, from: data) else {
            return
        }
        ShieldController.shield(selection: selection)
    }
}
