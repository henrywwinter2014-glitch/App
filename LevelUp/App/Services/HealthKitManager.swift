import Foundation
import HealthKit

/// Thin async wrapper around the HealthKit reads the fitness scorer needs. Read-only —
/// LevelUp never writes health data (HealthKit still requires the "share" usage string
/// to be present even for a read-only app, see Info.plist).
final class HealthKitManager {
    static let shared = HealthKitManager()

    private let store = HKHealthStore()

    private let readTypes: Set<HKObjectType> = {
        var types: Set<HKObjectType> = [
            HKQuantityType(.stepCount),
            HKQuantityType(.appleExerciseTime),
            HKQuantityType(.activeEnergyBurned),
            HKQuantityType(.appleStandTime)
        ]
        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            types.insert(sleep)
        }
        return types
    }()

    var isHealthDataAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    func requestAuthorization() async throws {
        guard isHealthDataAvailable else {
            throw HealthKitError.unavailable
        }
        try await store.requestAuthorization(toShare: [], read: readTypes)
    }

    /// Raw daily inputs for `FitnessScorer`. `sleepHours` reflects the previous night
    /// (the 6pm-yesterday -> noon-today window, which is the usual convention for "last night's sleep").
    func fetchTodayMetrics() async throws -> DailyHealthMetrics {
        async let steps = sumQuantity(.stepCount, unit: .count(), day: .now)
        async let exerciseMinutes = sumQuantity(.appleExerciseTime, unit: .minute(), day: .now)
        async let activeEnergy = sumQuantity(.activeEnergyBurned, unit: .kilocalorie(), day: .now)
        async let standHours = sumQuantity(.appleStandTime, unit: .minute(), day: .now)
        async let sleepHours = fetchSleepHours(for: .now)

        return try await DailyHealthMetrics(
            steps: steps,
            exerciseMinutes: exerciseMinutes,
            activeEnergy: activeEnergy,
            standHours: standHours / 60.0,
            sleepHours: sleepHours
        )
    }

    private func sumQuantity(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit, day: Date) async throws -> Double {
        let type = HKQuantityType(identifier)
        let (start, end) = Calendar.current.dayBounds(for: day)
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)

        return try await withCheckedThrowingContinuation { continuation in
            let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, result, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                let value = result?.sumQuantity()?.doubleValue(for: unit) ?? 0
                continuation.resume(returning: value)
            }
            store.execute(query)
        }
    }

    private func fetchSleepHours(for day: Date) async throws -> Double {
        guard let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else { return 0 }

        // "Last night" = noon yesterday through noon today.
        let cal = Calendar.current
        guard let noonToday = cal.date(bySettingHour: 12, minute: 0, second: 0, of: day),
              let noonYesterday = cal.date(byAdding: .day, value: -1, to: noonToday) else { return 0 }

        let predicate = HKQuery.predicateForSamples(withStart: noonYesterday, end: noonToday, options: .strictStartDate)

        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(sampleType: sleepType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                let asleepValues: Set<Int> = [
                    HKCategoryValueSleepAnalysis.asleepCore.rawValue,
                    HKCategoryValueSleepAnalysis.asleepDeep.rawValue,
                    HKCategoryValueSleepAnalysis.asleepREM.rawValue,
                    HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue
                ]
                let seconds = (samples as? [HKCategorySample] ?? [])
                    .filter { asleepValues.contains($0.value) }
                    .reduce(0.0) { $0 + $1.endDate.timeIntervalSince($1.startDate) }
                continuation.resume(returning: seconds / 3600.0)
            }
            store.execute(query)
        }
    }

    enum HealthKitError: Error {
        case unavailable
    }
}

struct DailyHealthMetrics {
    var steps: Double
    var exerciseMinutes: Double
    var activeEnergy: Double
    var standHours: Double
    var sleepHours: Double
}

private extension Calendar {
    func dayBounds(for date: Date) -> (Date, Date) {
        let start = startOfDay(for: date)
        let end = self.date(byAdding: .day, value: 1, to: start) ?? date
        return (start, end)
    }
}
