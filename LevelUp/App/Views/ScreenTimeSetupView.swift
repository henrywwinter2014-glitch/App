import SwiftUI
import FamilyControls

struct ScreenTimeSetupView: View {
    @EnvironmentObject private var screenTime: ScreenTimeManager
    @State private var showingPicker = false
    @State private var authError: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        Text("Authorization")
                        Spacer()
                        Text(statusLabel)
                            .foregroundStyle(statusColor)
                    }
                    if screenTime.authorizationStatus != .approved {
                        Button("Request Screen Time Access") {
                            Task {
                                do {
                                    try await screenTime.requestAuthorization()
                                    authError = nil
                                } catch {
                                    authError = error.localizedDescription
                                }
                            }
                        }
                    }
                    if let authError {
                        Text(authError).font(.footnote).foregroundStyle(.red)
                    }
                }

                Section("Gated apps & categories") {
                    Button {
                        showingPicker = true
                    } label: {
                        HStack {
                            Text("Choose Apps")
                            Spacer()
                            Text("\(screenTime.selection.applicationTokens.count) apps, \(screenTime.selection.categoryTokens.count) categories")
                                .foregroundStyle(.secondary)
                                .font(.footnote)
                        }
                    }
                    .disabled(screenTime.authorizationStatus != .approved)

                    Button("Lock Selected Apps Now") {
                        screenTime.lockSelectedApps()
                    }
                    .disabled(!screenTime.hasSelectedApps)
                }

                Section {
                    Text("These are the apps/categories that stay locked behind a shield until you redeem earned game time in the Game Time tab. Anything not selected here is never restricted.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Screen Time")
            .familyActivityPicker(isPresented: $showingPicker, selection: $screenTime.selection)
        }
    }

    private var statusLabel: String {
        switch screenTime.authorizationStatus {
        case .approved: "Approved"
        case .denied: "Denied"
        case .notDetermined: "Not requested"
        @unknown default: "Unknown"
        }
    }

    private var statusColor: Color {
        switch screenTime.authorizationStatus {
        case .approved: .green
        case .denied: .red
        default: .secondary
        }
    }
}
