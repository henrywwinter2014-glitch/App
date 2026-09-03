import SwiftUI
import SwiftData
import Charts

struct FitnessView: View {
    @Query(sort: \FitnessSnapshot.date, order: .reverse) private var snapshots: [FitnessSnapshot]

    private var today: FitnessSnapshot? { snapshots.first { Calendar.current.isDateInToday($0.date) } }
    private var recent: [FitnessSnapshot] { Array(snapshots.prefix(14)) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    ScoreRingView(score: today?.score ?? 0, diameter: 160)
                        .padding(.top)

                    if let today {
                        metricsGrid(today)
                    }

                    if recent.count > 1 {
                        VStack(alignment: .leading) {
                            Text("Last 14 days").font(.headline)
                            Chart(recent.reversed()) { snapshot in
                                LineMark(
                                    x: .value("Day", snapshot.date, unit: .day),
                                    y: .value("Score", snapshot.score)
                                )
                                .interpolationMethod(.catmullRom)
                                PointMark(
                                    x: .value("Day", snapshot.date, unit: .day),
                                    y: .value("Score", snapshot.score)
                                )
                            }
                            .frame(height: 160)
                        }
                        .padding(.horizontal)
                    }

                    if let today, !today.corrections.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Corrections").font(.headline)
                            ForEach(today.corrections, id: \.self) { tip in
                                Label(tip, systemImage: "arrow.up.right.circle")
                                    .font(.subheadline)
                            }
                        }
                        .padding()
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))
                        .padding(.horizontal)
                    } else if today != nil {
                        Text("Great day — no corrections needed!")
                            .font(.subheadline)
                            .foregroundStyle(.green)
                    }
                }
                .padding(.bottom, 32)
            }
            .navigationTitle("Fitness")
        }
    }

    private func metricsGrid(_ snapshot: FitnessSnapshot) -> some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            metricTile("Steps", value: "\(Int(snapshot.steps))", icon: "figure.walk")
            metricTile("Exercise", value: "\(Int(snapshot.exerciseMinutes)) min", icon: "flame.fill")
            metricTile("Active Energy", value: "\(Int(snapshot.activeEnergy)) kcal", icon: "bolt.fill")
            metricTile("Stand Time", value: String(format: "%.1f hr", snapshot.standHours), icon: "figure.stand")
            metricTile("Sleep", value: String(format: "%.1f hr", snapshot.sleepHours), icon: "bed.double.fill")
        }
        .padding(.horizontal)
    }

    private func metricTile(_ title: String, value: String, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Label(title, systemImage: icon)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.title3.bold())
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14))
    }
}
