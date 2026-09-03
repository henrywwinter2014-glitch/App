import SwiftUI

struct SettingsView: View {
    @ObservedObject private var settings = SettingsStore.shared
    @State private var draftKey: String = ""
    @State private var showingKey = false
    @State private var saved = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Group {
                        if showingKey {
                            TextField("sk-ant-...", text: $draftKey)
                        } else {
                            SecureField("sk-ant-...", text: $draftKey)
                        }
                    }
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()

                    Button(showingKey ? "Hide" : "Show") { showingKey.toggle() }
                        .font(.footnote)

                    Button("Save Key") {
                        settings.apiKey = draftKey.trimmingCharacters(in: .whitespacesAndNewlines)
                        saved = true
                    }
                    .disabled(draftKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                    if settings.isAIConfigured {
                        Button("Remove Key", role: .destructive) {
                            settings.apiKey = ""
                            draftKey = ""
                        }
                    }
                } header: {
                    Text("Anthropic API Key")
                } footer: {
                    Text("Powers the AI Coach, chore suggestions, fitness insights, and outfit scorer. Stored in the Keychain on this device only, and sent directly to api.anthropic.com — LevelUp has no backend of its own. Usage is billed to your own Anthropic account. Get a key at console.anthropic.com.")
                }

                Section("Model") {
                    Picker("Model", selection: $settings.model) {
                        ForEach(AIModel.allCases) { model in
                            Text(model.displayName).tag(model)
                        }
                    }
                    .pickerStyle(.inline)
                }
            }
            .navigationTitle("Settings")
            .onAppear { draftKey = settings.apiKey }
            .alert("Saved", isPresented: $saved) {
                Button("OK", role: .cancel) {}
            }
        }
    }
}
