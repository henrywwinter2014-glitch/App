import SwiftUI
import SwiftData

struct GameTimeView: View {
    @EnvironmentObject private var gameTimeBank: GameTimeBank
    @EnvironmentObject private var screenTime: ScreenTimeManager
    @Query(sort: \PointsTransaction.createdAt, order: .reverse) private var transactions: [PointsTransaction]
    @Environment(\.modelContext) private var context

    @State private var minutesToRedeem: Double = 15
    @State private var redeemMessage: String?

    private var balance: Int { transactions.balance }
    private var maxRedeemableMinutes: Double { Double(balance) * GameTimeBank.minutesPerPoint }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    VStack(spacing: 8) {
                        Text("\(balance)")
                            .font(.system(size: 56, weight: .bold, design: .rounded))
                        Text("points banked")
                            .foregroundStyle(.secondary)
                    }
                    .padding(.top)

                    CoachTipCard()

                    if gameTimeBank.isUnlocked, let expires = gameTimeBank.unlockExpiresAt {
                        VStack(spacing: 8) {
                            Label("Unlocked", systemImage: "lock.open.fill")
                                .font(.headline)
                                .foregroundStyle(.green)
                            Text("Until \(expires.formatted(date: .omitted, time: .shortened))")
                                .foregroundStyle(.secondary)
                            Button("Lock Now", role: .destructive) {
                                gameTimeBank.lockNow(selection: screenTime.selection)
                            }
                        }
                        .padding()
                        .frame(maxWidth: .infinity)
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))
                        .padding(.horizontal)
                    } else {
                        redeemCard
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Recent activity").font(.headline)
                        ForEach(transactions.prefix(10)) { tx in
                            HStack {
                                Image(systemName: icon(for: tx.source))
                                    .foregroundStyle(tx.amount >= 0 ? .green : .red)
                                VStack(alignment: .leading) {
                                    Text(label(for: tx.source))
                                    if !tx.note.isEmpty {
                                        Text(tx.note).font(.caption).foregroundStyle(.secondary)
                                    }
                                }
                                Spacer()
                                Text(tx.amount >= 0 ? "+\(tx.amount)" : "\(tx.amount)")
                                    .foregroundStyle(tx.amount >= 0 ? .green : .red)
                                    .fontWeight(.semibold)
                            }
                            .font(.subheadline)
                        }
                    }
                    .padding(.horizontal)
                }
                .padding(.bottom, 32)
            }
            .navigationTitle("Game Time")
        }
    }

    private var redeemCard: some View {
        VStack(spacing: 16) {
            Text("Redeem Game Time").font(.headline)

            if !screenTime.hasSelectedApps {
                Text("Pick which apps to gate in the Screen Time tab first.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            } else if balance <= 0 {
                Text("Complete chores or boost your fitness score to earn points.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            } else {
                Stepper(
                    "\(Int(minutesToRedeem)) minutes (\(Int(ceil(minutesToRedeem / GameTimeBank.minutesPerPoint))) pts)",
                    value: $minutesToRedeem,
                    in: 5...max(5, maxRedeemableMinutes),
                    step: 5
                )
                Button {
                    redeem()
                } label: {
                    Text("Unlock \(Int(minutesToRedeem)) min")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(minutesToRedeem > maxRedeemableMinutes)
            }

            if let redeemMessage {
                Text(redeemMessage).font(.footnote).foregroundStyle(.red)
            }
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal)
    }

    private func redeem() {
        let success = gameTimeBank.redeem(
            minutes: minutesToRedeem,
            balance: balance,
            selection: screenTime.selection,
            in: context
        )
        redeemMessage = success ? nil : "Not enough points for that."
    }

    private func icon(for source: PointsSource) -> String {
        switch source {
        case .chore: "checkmark.circle.fill"
        case .fitnessBonus: "figure.run"
        case .gameTimeRedemption: "gamecontroller.fill"
        case .manualAdjustment: "slider.horizontal.3"
        }
    }

    private func label(for source: PointsSource) -> String {
        switch source {
        case .chore: "Chore completed"
        case .fitnessBonus: "Fitness bonus"
        case .gameTimeRedemption: "Game time redeemed"
        case .manualAdjustment: "Adjustment"
        }
    }
}
