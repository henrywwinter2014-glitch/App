import SwiftUI
import SwiftData

/// Self-contained "what should I do right now" card. Caches one tip per calendar day in
/// UserDefaults so dropping this into both Dashboard and Game Time doesn't double the
/// network calls — both instances read/write the same cached value.
struct CoachTipCard: View {
    @Query private var chores: [Chore]
    @Query(sort: \PointsTransaction.createdAt, order: .reverse) private var transactions: [PointsTransaction]
    @Query(sort: \FitnessSnapshot.date, order: .reverse) private var snapshots: [FitnessSnapshot]
    @EnvironmentObject private var gameTimeBank: GameTimeBank
    @ObservedObject private var settings = SettingsStore.shared

    @AppStorage("coachTipDate") private var cachedDateString = ""
    @AppStorage("coachTipText") private var cachedText = ""
    @State private var isLoading = false
    @State private var errorText: String?

    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private var todayKey: String { Self.dayFormatter.string(from: .now) }
    private var hasFreshTip: Bool { cachedDateString == todayKey && !cachedText.isEmpty }

    var body: some View {
        if settings.isAIConfigured {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "sparkles")
                    .foregroundStyle(.indigo)
                if isLoading {
                    ProgressView()
                } else if hasFreshTip {
                    Text(cachedText).font(.subheadline)
                } else if let errorText {
                    Text(errorText).font(.footnote).foregroundStyle(.red)
                } else {
                    Text("Tap for a quick tip on what to do right now.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button {
                    fetchTip()
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .disabled(isLoading)
            }
            .padding()
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))
            .padding(.horizontal)
            .task {
                if !hasFreshTip { fetchTip() }
            }
        }
    }

    private func fetchTip() {
        isLoading = true
        errorText = nil
        let today = snapshots.first { Calendar.current.isDateInToday($0.date) }
        let statusContext = AIContextBuilder.todaySummary(
            chores: chores,
            pointsBalance: transactions.balance,
            fitnessScore: today?.score,
            isUnlocked: gameTimeBank.isUnlocked
        )
        Task {
            defer { isLoading = false }
            do {
                let tip = try await CoachTipService.tip(statusContext: statusContext)
                cachedText = tip
                cachedDateString = todayKey
            } catch {
                errorText = error.localizedDescription
            }
        }
    }
}
