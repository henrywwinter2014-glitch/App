import Foundation
import FamilyControls
import ManagedSettings
import DeviceActivity

/// Applies and removes the actual Screen Time shield. This is the enforcement layer:
/// GameTimeBank decides *whether* the user is allowed through; ShieldController is the
/// only thing that touches ManagedSettingsStore to make that real.
enum ShieldController {
    static let store = ManagedSettingsStore(named: .levelUp)
    private static let activityCenter = DeviceActivityCenter()

    /// Re-locks the selected apps/categories. Safe to call even if already shielded.
    static func shield(selection: FamilyActivitySelection) {
        store.shield.applications = selection.applicationTokens.isEmpty ? nil : selection.applicationTokens
        store.shield.applicationCategories = selection.categoryTokens.isEmpty
            ? nil
            : .specific(selection.categoryTokens)
        store.shield.webDomainCategories = nil
    }

    /// Removes the shield entirely — used while an earned game-time window is active.
    static func unshield() {
        store.shield.applications = nil
        store.shield.applicationCategories = nil
    }

    /// Opens an earned game-time window for `minutes`, and schedules a DeviceActivity event
    /// so the monitor extension reapplies the shield the instant that window elapses — even
    /// if the app is closed or the phone is asleep.
    static func unlock(minutes: Double, selection: FamilyActivitySelection) {
        let expiresAt = Date().addingTimeInterval(minutes * 60)
        AppGroup.defaults.set(expiresAt, forKey: SharedKey.unlockExpiresAt)

        unshield()
        scheduleReshield(at: expiresAt, selection: selection)
    }

    /// Ends the current unlock window immediately (e.g. the user chooses to lock early,
    /// or the app detects the window already elapsed on launch).
    static func relockNow(selection: FamilyActivitySelection) {
        AppGroup.defaults.removeObject(forKey: SharedKey.unlockExpiresAt)
        shield(selection: selection)
    }

    /// True if there's an active, unexpired unlock window.
    static var isUnlocked: Bool {
        guard let expiresAt = AppGroup.defaults.object(forKey: SharedKey.unlockExpiresAt) as? Date else {
            return false
        }
        return expiresAt > Date()
    }

    static var unlockExpiresAt: Date? {
        AppGroup.defaults.object(forKey: SharedKey.unlockExpiresAt) as? Date
    }

    /// Schedules a short monitoring window ending exactly at `date`; the monitor extension's
    /// `intervalDidEnd(for: ActivityName.daily)` isn't precise enough for this (it only fires
    /// at the daily boundary), so we use a dedicated one-shot activity name per redemption.
    private static func scheduleReshield(at date: Date, selection: FamilyActivitySelection) {
        let now = Date()
        let cal = Calendar.current
        let startComponents = cal.dateComponents([.hour, .minute, .second], from: now)
        let endComponents = cal.dateComponents([.hour, .minute, .second], from: date)

        let schedule = DeviceActivitySchedule(
            intervalStart: startComponents,
            intervalEnd: endComponents,
            repeats: false
        )

        do {
            try activityCenter.startMonitoring(ActivityName.daily, during: schedule)
        } catch {
            print("Failed to schedule reshield: \(error)")
        }
    }
}
