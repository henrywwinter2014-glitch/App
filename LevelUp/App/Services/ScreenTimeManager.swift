import Foundation
import FamilyControls
import DeviceActivity
import ManagedSettings
import Combine

/// Owns Family Controls authorization and the user's choice of which apps/categories
/// ("game apps") are gated behind earned game time. This is the "connects to screen time"
/// half of the app.
@MainActor
final class ScreenTimeManager: ObservableObject {
    static let shared = ScreenTimeManager()

    @Published var authorizationStatus: AuthorizationStatus = .notDetermined
    @Published var selection = FamilyActivitySelection() {
        didSet { persistSelection() }
    }

    private let center = AuthorizationCenter.shared
    private let activityCenter = DeviceActivityCenter()

    private init() {
        authorizationStatus = center.authorizationStatus
        loadSelection()
    }

    var hasSelectedApps: Bool {
        !selection.applicationTokens.isEmpty || !selection.categoryTokens.isEmpty
    }

    func requestAuthorization() async throws {
        try await center.requestAuthorization(for: .individual)
        authorizationStatus = center.authorizationStatus
    }

    /// Applies the shield to the selected apps/categories right now (the "locked" default
    /// state) and (re)starts the daily DeviceActivity schedule that lets the monitor
    /// extension reset things at midnight.
    func lockSelectedApps() {
        ShieldController.shared.shield(selection: selection)
        startDailySchedule()
    }

    /// Starts (or restarts) the daily monitoring window. The monitor extension gets an
    /// `intervalDidStart`/`intervalDidEnd` callback at these boundaries, which is what
    /// drives the midnight reset even if the app itself isn't running.
    func startDailySchedule() {
        let schedule = DeviceActivitySchedule(
            intervalStart: DateComponents(hour: 0, minute: 0),
            intervalEnd: DateComponents(hour: 23, minute: 59),
            repeats: true
        )
        do {
            try activityCenter.startMonitoring(ActivityName.daily, during: schedule)
        } catch {
            print("Failed to start DeviceActivity monitoring: \(error)")
        }
    }

    private func persistSelection() {
        guard let data = try? JSONEncoder().encode(selection) else { return }
        AppGroup.defaults.set(data, forKey: SharedKey.selectedAppsData)
    }

    private func loadSelection() {
        guard let data = AppGroup.defaults.data(forKey: SharedKey.selectedAppsData),
              let decoded = try? JSONDecoder().decode(FamilyActivitySelection.self, from: data) else { return }
        selection = decoded
    }
}
