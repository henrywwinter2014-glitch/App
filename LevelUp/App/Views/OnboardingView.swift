import SwiftUI

struct OnboardingView: View {
    let onFinished: () -> Void

    @EnvironmentObject private var screenTime: ScreenTimeManager
    @State private var step = 0
    @State private var healthError: String?
    @State private var screenTimeError: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Spacer()

                Image(systemName: icon(for: step))
                    .font(.system(size: 64))
                    .foregroundStyle(.indigo)

                Text(title(for: step))
                    .font(.title.bold())
                    .multilineTextAlignment(.center)

                Text(subtitle(for: step))
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)

                if let error = step == 1 ? healthError : screenTimeError {
                    Text(error).font(.footnote).foregroundStyle(.red)
                }

                Spacer()

                Button(action: advance) {
                    Text(buttonTitle(for: step))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .padding(.horizontal)

                if step > 0 {
                    Button("Skip for now") { step += 1 }
                        .font(.footnote)
                }
            }
            .padding(.bottom, 32)
        }
    }

    private func icon(for step: Int) -> String {
        switch step {
        case 0: "bolt.heart.fill"
        case 1: "heart.text.square.fill"
        default: "hourglass.badge.plus"
        }
    }

    private func title(for step: Int) -> String {
        switch step {
        case 0: "Welcome to LevelUp"
        case 1: "Connect Health Data"
        default: "Connect Screen Time"
        }
    }

    private func subtitle(for step: Int) -> String {
        switch step {
        case 0: "Finish chores and hit your fitness goals to earn game time. Slack off, and your apps stay locked."
        case 1: "LevelUp reads your steps, exercise, stand time and sleep to calculate a daily Fitness Score. This is read-only — nothing is ever written back."
        default: "Choose which apps or categories (games, social, etc.) should be locked until you've earned time. You can change this any time in the Screen Time tab."
        }
    }

    private func buttonTitle(for step: Int) -> String {
        switch step {
        case 0: "Get Started"
        case 1: "Allow Health Access"
        default: "Choose Apps"
        }
    }

    private func advance() {
        switch step {
        case 0:
            step = 1
        case 1:
            Task {
                do {
                    try await HealthKitManager.shared.requestAuthorization()
                    healthError = nil
                    step = 2
                } catch {
                    healthError = "Couldn't get Health access: \(error.localizedDescription)"
                }
            }
        default:
            Task {
                do {
                    try await screenTime.requestAuthorization()
                    screenTimeError = nil
                    onFinished()
                } catch {
                    screenTimeError = "Couldn't get Screen Time access: \(error.localizedDescription)"
                }
            }
        }
    }
}
