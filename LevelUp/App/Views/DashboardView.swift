import SwiftUI
import SwiftData

struct DashboardView: View {
    @EnvironmentObject private var gameTimeBank: GameTimeBank
    @Query(sort: \PointsTransaction.createdAt, order: .reverse) private var transactions: [PointsTransaction]
    @Query private var chores: [Chore]
    @Query(sort: \FitnessSnapshot.date, order: .reverse) private var snapshots: [FitnessSnapshot]

    @Environment(\.modelContext) private var context
    @State private var isRefreshingHealth = false

    private var todaysChores: [Chore] {
        chores.filter { !$0.isArchived && $0.isDue() }
    }

    private var completedToday: Int {
        todaysChores.filter { $0.isCompleted() }.count
    }

    private var latestSnapshot: FitnessSnapshot? {
        snapshots.first { Calendar.current.isDateInToday($0.date) }
    }

    private var balance: Int { transactions.balance }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    HStack(spacing: 24) {
                        ScoreRingView(score: latestSnapshot?.score ?? 0)
                        VStack(alignment: .leading, spacing: 10) {
                            Label("\(completedToday)/\(todaysChores.count) chores done", systemImage: "checklist")
                                .font(.subheadline)
                            Label("\(balance) points banked", systemImage: "star.fill")
                                .font(.subheadline)
                            if gameTimeBank.isUnlocked, let expires = gameTimeBank.unlockExpiresAt {
                                Label("Unlocked until \(expires.formatted(date: .omitted, time: .shortened))", systemImage: "lock.open.fill")
                                    .font(.subheadline)
                                    .foregroundStyle(.green)
                            } else {
                                Label("Apps locked", systemImage: "lock.fill")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        Spacer()
                    }
                    .padding(.horizontal)

                    CoachTipCard()

                    if let snapshot = latestSnapshot, !snapshot.corrections.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Today's corrections").font(.headline)
                            ForEach(snapshot.corrections, id: \.self) { tip in
                                Label(tip, systemImage: "arrow.up.right.circle")
                                    .font(.subheadline)
                            }
                        }
                        .padding()
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))
                        .padding(.horizontal)
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text("Today's chores").font(.headline)
                            Spacer()
                            NavigationLink("See all") { ChoreListView() }
                                .font(.subheadline)
                        }
                        if todaysChores.isEmpty {
                            Text("No chores scheduled today. Add some in the Chores tab.")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(todaysChores.prefix(5)) { chore in
                                ChoreRow(chore: chore) {
                                    complete(chore)
                                }
                            }
                        }
                    }
                    .padding(.horizontal)
                }
                .padding(.vertical)
            }
            .navigationTitle("Today")
            .refreshable { await refreshHealth() }
            .task { await refreshHealth() }
        }
    }

    private func complete(_ chore: Chore) {
        guard !chore.isCompleted() else { return }
        gameTimeBank.awardChoreCompletion(chore, in: context)
    }

    private func refreshHealth() async {
        guard !isRefreshingHealth else { return }
        isRefreshingHealth = true
        defer { isRefreshingHealth = false }

        do {
            let metrics = try await HealthKitManager.shared.fetchTodayMetrics()
            let result = FitnessScorer.score(metrics)
            upsertSnapshot(metrics: metrics, result: result)
        } catch {
            print("Health refresh failed: \(error)")
        }
    }

    private func upsertSnapshot(metrics: DailyHealthMetrics, result: FitnessScoreResult) {
        let today = Calendar.current.startOfDay(for: .now)
        if let existing = snapshots.first(where: { Calendar.current.isDateInToday($0.date) }) {
            existing.score = result.score
            existing.steps = metrics.steps
            existing.exerciseMinutes = metrics.exerciseMinutes
            existing.activeEnergy = metrics.activeEnergy
            existing.standHours = metrics.standHours
            existing.sleepHours = metrics.sleepHours
            existing.corrections = result.corrections
        } else {
            let snapshot = FitnessSnapshot(
                date: today,
                score: result.score,
                steps: metrics.steps,
                exerciseMinutes: metrics.exerciseMinutes,
                activeEnergy: metrics.activeEnergy,
                standHours: metrics.standHours,
                sleepHours: metrics.sleepHours,
                corrections: result.corrections
            )
            context.insert(snapshot)
            gameTimeBank.awardFitnessBonus(for: snapshot, in: context)
        }
        try? context.save()
    }
}

private struct ChoreRow: View {
    let chore: Chore
    let onComplete: () -> Void

    var body: some View {
        HStack {
            Image(systemName: chore.icon)
                .foregroundStyle(.indigo)
            Text(chore.title)
            StreakBadge(streak: chore.currentStreak())
            Spacer()
            PointsPill(points: chore.points)
            Button {
                onComplete()
            } label: {
                Image(systemName: chore.isCompleted() ? "checkmark.circle.fill" : "circle")
                    .font(.title2)
                    .foregroundStyle(chore.isCompleted() ? .green : .secondary)
            }
            .disabled(chore.isCompleted())
            .buttonStyle(.plain)
        }
        .padding(.vertical, 4)
    }
}
