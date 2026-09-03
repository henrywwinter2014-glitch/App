import SwiftUI
import SwiftData

struct CoachChatView: View {
    @Query(sort: \ChatMessage.createdAt) private var messages: [ChatMessage]
    @Query private var chores: [Chore]
    @Query(sort: \PointsTransaction.createdAt, order: .reverse) private var transactions: [PointsTransaction]
    @Query(sort: \FitnessSnapshot.date, order: .reverse) private var snapshots: [FitnessSnapshot]
    @Environment(\.modelContext) private var context
    @EnvironmentObject private var gameTimeBank: GameTimeBank
    @ObservedObject private var settings = SettingsStore.shared

    @State private var draft = ""
    @State private var isSending = false
    @State private var errorText: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if !settings.isAIConfigured {
                    NavigationLink {
                        SettingsView()
                    } label: {
                        Label("Add your API key in Settings to chat with your coach", systemImage: "key.fill")
                            .font(.footnote)
                            .padding(8)
                            .frame(maxWidth: .infinity)
                            .background(Color.orange.opacity(0.15))
                    }
                }

                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 12) {
                            if messages.isEmpty {
                                Text("Ask your coach anything — \"how am I doing today?\", \"motivate me\", \"what should I do first?\"")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                                    .padding()
                            }
                            ForEach(messages) { message in
                                bubble(for: message).id(message.persistentModelID)
                            }
                            if isSending {
                                HStack { ProgressView(); Text("Coach is thinking…").font(.footnote).foregroundStyle(.secondary) }
                                    .padding(.horizontal)
                            }
                        }
                        .padding(.vertical)
                    }
                    .onChange(of: messages.count) { _, _ in
                        if let last = messages.last {
                            withAnimation { proxy.scrollTo(last.persistentModelID, anchor: .bottom) }
                        }
                    }
                }

                if let errorText {
                    Text(errorText).font(.footnote).foregroundStyle(.red).padding(.horizontal)
                }

                HStack {
                    TextField("Message your coach", text: $draft, axis: .vertical)
                        .textFieldStyle(.roundedBorder)
                    Button {
                        send()
                    } label: {
                        Image(systemName: "arrow.up.circle.fill").font(.title)
                    }
                    .disabled(draft.trimmingCharacters(in: .whitespaces).isEmpty || isSending || !settings.isAIConfigured)
                }
                .padding()
            }
            .navigationTitle("Coach")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    NavigationLink { SettingsView() } label: { Image(systemName: "gearshape") }
                }
            }
        }
    }

    private func bubble(for message: ChatMessage) -> some View {
        HStack {
            if message.role == .user { Spacer(minLength: 40) }
            Text(message.text)
                .padding(10)
                .background(message.role == .user ? Color.indigo.opacity(0.85) : Color.gray.opacity(0.18), in: RoundedRectangle(cornerRadius: 14))
                .foregroundStyle(message.role == .user ? .white : .primary)
                .frame(maxWidth: 280, alignment: message.role == .user ? .trailing : .leading)
            if message.role == .assistant { Spacer(minLength: 40) }
        }
        .frame(maxWidth: .infinity, alignment: message.role == .user ? .trailing : .leading)
        .padding(.horizontal)
    }

    private func send() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        draft = ""
        errorText = nil

        // Capture prior turns *before* inserting the new message — @Query's `messages`
        // may not reflect the insert synchronously, so this avoids double-counting or
        // dropping the wrong turn.
        let priorHistory = messages.suffix(20).map { (role: $0.role.rawValue, text: $0.text) }

        context.insert(ChatMessage(role: .user, text: text))
        try? context.save()

        let today = Calendar.current.isDateInToday(snapshots.first?.date ?? .distantPast) ? snapshots.first : nil
        let statusContext = AIContextBuilder.todaySummary(
            chores: chores,
            pointsBalance: transactions.balance,
            fitnessScore: today?.score,
            isUnlocked: gameTimeBank.isUnlocked
        )

        isSending = true
        Task {
            defer { isSending = false }
            do {
                let reply = try await AIClient.complete(
                    system: AIContextBuilder.coachSystemPrompt + "\n\nCurrent status: " + statusContext,
                    history: priorHistory,
                    userText: text
                )
                context.insert(ChatMessage(role: .assistant, text: reply))
                try? context.save()
            } catch {
                errorText = error.localizedDescription
            }
        }
    }
}
