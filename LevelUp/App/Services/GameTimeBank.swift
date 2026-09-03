import Foundation
import SwiftData
import FamilyControls

/// The economy that ties everything together: chores completed + today's fitness score earn
/// points, points convert to minutes, and redeeming minutes tells ShieldController to open
/// (and later re-close) the gate on the apps the user picked in Screen Time setup.
@MainActor
final class GameTimeBank: ObservableObject {
    static let shared = GameTimeBank()

    /// 1 point = 1 minute of game time. Tune this if points should feel more/less valuable.
    static let minutesPerPoint: Double = 1.0
    /// Extra minutes awarded for a perfect (100) fitness day; scales linearly below that.
    static let maxFitnessBonusMinutes: Double = 30

    @Published private(set) var earnedMinutesRemaining: Double = 0
    @Published private(set) var unlockExpiresAt: Date?

    private init() {
        refreshFromSharedState()
    }

    // MARK: - Earning

    /// Call when a chore is checked off. Records the transaction and credits minutes.
    func awardChoreCompletion(_ chore: Chore, in context: ModelContext) {
        let completion = ChoreCompletion(pointsAwarded: chore.points, chore: chore)
        context.insert(completion)
        recordPoints(chore.points, source: .chore, note: chore.title, in: context)
    }

    /// Call once per day when a fresh FitnessSnapshot is computed. Awards a proportional
    /// bonus in points (so it shows in the ledger like everything else) rather than minutes
    /// directly.
    func awardFitnessBonus(for snapshot: FitnessSnapshot, in context: ModelContext) {
        let bonusMinutes = Self.maxFitnessBonusMinutes * (Double(snapshot.score) / 100.0)
        let bonusPoints = Int(round(bonusMinutes / Self.minutesPerPoint))
        guard bonusPoints > 0 else { return }
        recordPoints(bonusPoints, source: .fitnessBonus, note: "Fitness score \(snapshot.score)", in: context)
    }

    private func recordPoints(_ amount: Int, source: PointsSource, note: String, in context: ModelContext) {
        context.insert(PointsTransaction(amount: amount, source: source, note: note))
        try? context.save()
    }

    // MARK: - Spending

    /// Redeems `minutes` of game time against the point balance, unshields the selected apps
    /// for that long, and schedules the automatic re-shield.
    func redeem(minutes: Double, balance: Int, selection: FamilyActivitySelection, in context: ModelContext) -> Bool {
        let cost = Int(ceil(minutes / Self.minutesPerPoint))
        guard cost <= balance, minutes > 0 else { return false }

        context.insert(PointsTransaction(amount: -cost, source: .gameTimeRedemption, note: "\(Int(minutes)) min unlocked"))
        try? context.save()

        ShieldController.unlock(minutes: minutes, selection: selection)
        refreshFromSharedState()
        return true
    }

    /// Locks early / voluntarily ends the current window.
    func lockNow(selection: FamilyActivitySelection) {
        ShieldController.relockNow(selection: selection)
        refreshFromSharedState()
    }

    /// Call on app foreground / dashboard appear to reconcile in-app @Published state with
    /// what's actually stored in the shared defaults (the source of truth the extensions use).
    func refreshFromSharedState() {
        unlockExpiresAt = AppGroup.defaults.object(forKey: SharedKey.unlockExpiresAt) as? Date
        if let expiresAt = unlockExpiresAt, expiresAt <= Date() {
            // Window elapsed while the app was backgrounded; the monitor extension should have
            // already reshielded, but clear our local flag either way.
            AppGroup.defaults.removeObject(forKey: SharedKey.unlockExpiresAt)
            unlockExpiresAt = nil
        }
    }

    var isUnlocked: Bool {
        guard let unlockExpiresAt else { return false }
        return unlockExpiresAt > Date()
    }
}

// MARK: - Balance helper

extension Array where Element == PointsTransaction {
    var balance: Int { reduce(0) { $0 + $1.amount } }
}
