import SwiftUI
import SwiftData
import Charts

struct FitnessView: View {
    @Query(sort: \FitnessSnapshot.date, order: .reverse) private var snapshots: [FitnessSnapshot]
    @Query private var insights: [FitnessInsight]
    @Environment(\.modelContext) private var context
    @ObservedObject private var settings = SettingsStore.shared

    @State private var isLoadingInsight = false
    @State private var insightError: String?

    private var today: FitnessSnapshot? { snapshots.first { Calendar.current.isDateInToday($0.date) } }
    private var recent: [FitnessSnapshot] { Array(snapshots.prefix(14)) }

    private var currentWeekStart: Date {
        Calendar.current.dateInterval(of: .weekOfYear, for: .now)?.start ?? Calendar.current.startOfDay(for: .now)
    }

    private var currentWeekInsight: FitnessInsight? {
        insights.first { Calendar.current.isDate($0.weekStart, inSameDayAs: currentWeekStart) }
    }

    private var thisWeeksSnapshots: [FitnessSnapshot] {
        snapshots.filter { $0.date >= currentWeekStart }
    }

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

                    weeklyInsightCard
                }
                .padding(.bottom, 32)
            }
            .navigationTitle("Fitness")
        }
    }

    private var weeklyInsightCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Label("AI Weekly Insight", systemImage: "sparkles")
                    .font(.headline)
                Spacer()
                Button {
                    refreshInsight()
                } label: {
                    if isLoadingInsight {
                        ProgressView()
                    } else {
                        Image(systemName: "arrow.clockwise")
                    }
                }
                .disabled(isLoadingInsight || !settings.isAIConfigured)
            }

            if !settings.isAIConfigured {
                Text("Add your API key in Settings to get an AI-written weekly summary.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            } else if let insight = currentWeekInsight {
                Text(insight.summary).font(.subheadline)
                Text("Generated \(insight.generatedAt.formatted(date: .abbreviated, time: .shortened))")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            } else if let insightError {
                Text(insightError).font(.footnote).foregroundStyle(.red)
            } else {
                Text("Tap refresh to get this week's AI summary.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal)
    }

    private func refreshInsight() {
        isLoadingInsight = true
        insightError = nil
        let weekStart = currentWeekStart
        let snapshotsThisWeek = thisWeeksSnapshots
        Task {
            defer { isLoadingInsight = false }
            do {
                let summary = try await FitnessInsightService.weeklySummary(for: snapshotsThisWeek)
                if let existing = currentWeekInsight {
                    existing.summary = summary
                    existing.generatedAt = .now
                } else {
                    context.insert(FitnessInsight(weekStart: weekStart, summary: summary))
                }
                try? context.save()
            } catch {
                insightError = error.localizedDescription
            }
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
