import SwiftUI
import SwiftData

struct ChoreListView: View {
    @Query(sort: \Chore.createdAt) private var chores: [Chore]
    @Environment(\.modelContext) private var context
    @EnvironmentObject private var gameTimeBank: GameTimeBank
    @State private var showingAddChore = false

    private var active: [Chore] { chores.filter { !$0.isArchived } }

    var body: some View {
        NavigationStack {
            List {
                Section("Due today") {
                    let due = active.filter { $0.isDue() }
                    if due.isEmpty {
                        Text("Nothing due today.").foregroundStyle(.secondary)
                    }
                    ForEach(due) { chore in
                        choreRow(chore)
                    }
                }

                Section("All chores") {
                    ForEach(active) { chore in
                        choreRow(chore, showsSchedule: true)
                    }
                    .onDelete(perform: archive)
                }
            }
            .navigationTitle("Chores")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showingAddChore = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingAddChore) {
                AddChoreView()
            }
        }
    }

    @ViewBuilder
    private func choreRow(_ chore: Chore, showsSchedule: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Image(systemName: chore.icon).foregroundStyle(.indigo)
                Text(chore.title)
                StreakBadge(streak: chore.currentStreak())
                Spacer()
                PointsPill(points: chore.points)
                Button {
                    toggle(chore)
                } label: {
                    Image(systemName: chore.isCompleted() ? "checkmark.circle.fill" : "circle")
                        .font(.title2)
                        .foregroundStyle(chore.isCompleted() ? .green : .secondary)
                }
                .buttonStyle(.plain)
            }
            if showsSchedule {
                Text(scheduleLabel(chore))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }

    private func scheduleLabel(_ chore: Chore) -> String {
        chore.scheduledDays.isEmpty
            ? "Every day"
            : chore.scheduledDays.sorted { $0.rawValue < $1.rawValue }.map(\.shortLabel).joined(separator: " ")
    }

    private func toggle(_ chore: Chore) {
        if chore.isCompleted() {
            // Remove today's completion (undo).
            if let completion = chore.completions.first(where: { Calendar.current.isDateInToday($0.completedAt) }) {
                context.delete(completion)
                try? context.save()
            }
        } else {
            gameTimeBank.awardChoreCompletion(chore, in: context)
        }
    }

    private func archive(at offsets: IndexSet) {
        for index in offsets {
            active[index].isArchived = true
        }
        try? context.save()
    }
}

struct AddChoreView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context

    @State private var title = ""
    @State private var points = 10
    @State private var icon = "checkmark.circle"
    @State private var selectedDays: Set<Weekday> = []

    private let icons = ["checkmark.circle", "bed.double.fill", "trash.fill", "fork.knife", "pawprint.fill", "book.fill", "washer.fill", "leaf.fill", "car.fill", "backpack.fill"]

    var body: some View {
        NavigationStack {
            Form {
                Section("Chore") {
                    TextField("Title", text: $title)
                    Stepper("Points: \(points)", value: $points, in: 1...100, step: 5)
                }

                Section("Icon") {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack {
                            ForEach(icons, id: \.self) { name in
                                Button {
                                    icon = name
                                } label: {
                                    Image(systemName: name)
                                        .font(.title2)
                                        .padding(10)
                                        .background(icon == name ? Color.indigo.opacity(0.2) : Color.clear, in: Circle())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }

                Section("Schedule") {
                    HStack {
                        ForEach(Weekday.allCases) { day in
                            Button {
                                if selectedDays.contains(day) {
                                    selectedDays.remove(day)
                                } else {
                                    selectedDays.insert(day)
                                }
                            } label: {
                                Text(day.shortLabel)
                                    .font(.caption.bold())
                                    .frame(width: 32, height: 32)
                                    .background(selectedDays.contains(day) ? Color.indigo : Color.gray.opacity(0.2), in: Circle())
                                    .foregroundStyle(selectedDays.contains(day) ? .white : .primary)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    Text(selectedDays.isEmpty ? "Every day" : "Selected days only")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("New Chore")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    private func save() {
        let chore = Chore(
            title: title.trimmingCharacters(in: .whitespaces),
            points: points,
            icon: icon,
            scheduledDays: Array(selectedDays)
        )
        context.insert(chore)
        try? context.save()
        dismiss()
    }
}
