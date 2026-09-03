import SwiftUI
import SwiftData

struct SuggestChoresView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context
    @ObservedObject private var settings = SettingsStore.shared

    @State private var prompt = ""
    @State private var suggestions: [SuggestedChore] = []
    @State private var selected: Set<String> = []
    @State private var isLoading = false
    @State private var errorText: String?

    var body: some View {
        NavigationStack {
            Form {
                if !settings.isAIConfigured {
                    Section {
                        Text("Add your API key in Settings first.").foregroundStyle(.secondary)
                    }
                } else {
                    Section("Optional context") {
                        TextField("e.g. \"two kids, ages 8 and 12\"", text: $prompt, axis: .vertical)
                        Button {
                            fetchSuggestions()
                        } label: {
                            if isLoading {
                                ProgressView()
                            } else {
                                Text(suggestions.isEmpty ? "Get Suggestions" : "Regenerate")
                            }
                        }
                        .disabled(isLoading)
                    }

                    if let errorText {
                        Section { Text(errorText).foregroundStyle(.red).font(.footnote) }
                    }

                    if !suggestions.isEmpty {
                        Section("Pick what to add") {
                            ForEach(suggestions) { suggestion in
                                Button {
                                    toggle(suggestion)
                                } label: {
                                    HStack {
                                        Image(systemName: suggestion.icon).foregroundStyle(.indigo)
                                        VStack(alignment: .leading) {
                                            Text(suggestion.title).foregroundStyle(.primary)
                                            Text(suggestion.everyDay ? "Every day" : "Flexible schedule")
                                                .font(.caption).foregroundStyle(.secondary)
                                        }
                                        Spacer()
                                        PointsPill(points: suggestion.points)
                                        Image(systemName: selected.contains(suggestion.id) ? "checkmark.circle.fill" : "circle")
                                            .foregroundStyle(selected.contains(suggestion.id) ? .green : .secondary)
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Suggest Chores")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add \(selected.count)") { addSelected() }
                        .disabled(selected.isEmpty)
                }
            }
        }
    }

    private func toggle(_ suggestion: SuggestedChore) {
        if selected.contains(suggestion.id) {
            selected.remove(suggestion.id)
        } else {
            selected.insert(suggestion.id)
        }
    }

    private func fetchSuggestions() {
        isLoading = true
        errorText = nil
        Task {
            defer { isLoading = false }
            do {
                let results = try await ChoreSuggestionService.suggestChores(context: prompt)
                suggestions = results
                selected = Set(results.map(\.id))
            } catch {
                errorText = error.localizedDescription
            }
        }
    }

    private func addSelected() {
        for suggestion in suggestions where selected.contains(suggestion.id) {
            // Chore only models "every day" vs. "specific weekdays", and the AI doesn't pick
            // specific days — everything lands as "every day" (empty = daily in Chore.isDue)
            // and can be narrowed down manually afterward if desired.
            let chore = Chore(
                title: suggestion.title,
                points: suggestion.points,
                icon: suggestion.icon,
                scheduledDays: []
            )
            context.insert(chore)
        }
        try? context.save()
        dismiss()
    }
}
