import SwiftUI
import SwiftData
import PhotosUI
import UIKit

struct OutfitView: View {
    private enum Segment: String, CaseIterable { case score = "Score Outfit", wardrobe = "Wardrobe" }
    @State private var segment: Segment = .score

    var body: some View {
        NavigationStack {
            VStack {
                Picker("", selection: $segment) {
                    ForEach(Segment.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)
                .padding(.top, 8)

                switch segment {
                case .score: ScoreOutfitTab()
                case .wardrobe: WardrobeTab()
                }
            }
            .navigationTitle("Outfits")
        }
    }
}

// MARK: - Score a photo

private struct ScoreOutfitTab: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \OutfitLog.date, order: .reverse) private var logs: [OutfitLog]
    @ObservedObject private var settings = SettingsStore.shared

    @State private var image: UIImage?
    @State private var photoPickerItem: PhotosPickerItem?
    @State private var showingCamera = false
    @State private var occasion = ""
    @State private var isScoring = false
    @State private var errorText: String?
    @State private var result: OutfitScoreResult?

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                if !settings.isAIConfigured {
                    Text("Add your API key in Settings to score outfits.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .padding()
                }

                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFit()
                        .frame(maxHeight: 300)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .padding(.horizontal)
                } else {
                    RoundedRectangle(cornerRadius: 16)
                        .fill(Color.gray.opacity(0.15))
                        .frame(height: 220)
                        .overlay(Text("No photo yet").foregroundStyle(.secondary))
                        .padding(.horizontal)
                }

                HStack {
                    PhotosPicker(selection: $photoPickerItem, matching: .images) {
                        Label("Choose Photo", systemImage: "photo.on.rectangle")
                    }
                    Spacer()
                    Button { showingCamera = true } label: {
                        Label("Camera", systemImage: "camera.fill")
                    }
                }
                .padding(.horizontal)

                TextField("Occasion (optional, e.g. \"job interview\")", text: $occasion)
                    .textFieldStyle(.roundedBorder)
                    .padding(.horizontal)

                Button {
                    scoreOutfit()
                } label: {
                    if isScoring {
                        ProgressView().frame(maxWidth: .infinity)
                    } else {
                        Text("Score This Outfit").frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(image == nil || isScoring || !settings.isAIConfigured)
                .padding(.horizontal)

                if let errorText {
                    Text(errorText).font(.footnote).foregroundStyle(.red).padding(.horizontal)
                }

                if let result {
                    VStack(spacing: 12) {
                        ScoreRingView(score: result.score, diameter: 110)
                        Text(result.feedback).font(.subheadline).multilineTextAlignment(.center)
                        ForEach(result.suggestions, id: \.self) { tip in
                            Label(tip, systemImage: "arrow.up.right.circle").font(.footnote)
                        }
                    }
                    .padding()
                    .frame(maxWidth: .infinity)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))
                    .padding(.horizontal)
                }

                if !logs.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("History").font(.headline).padding(.horizontal)
                        ForEach(logs.prefix(10)) { log in
                            HStack {
                                Text(log.date.formatted(date: .abbreviated, time: .omitted))
                                Spacer()
                                if !log.occasion.isEmpty {
                                    Text(log.occasion).font(.caption).foregroundStyle(.secondary)
                                }
                                PointsPill(points: log.score, systemImage: "tshirt.fill", tint: .pink)
                            }
                            .font(.subheadline)
                            .padding(.horizontal)
                        }
                    }
                }
            }
            .padding(.vertical)
        }
        .onChange(of: photoPickerItem) { _, newItem in
            Task {
                if let data = try? await newItem?.loadTransferable(type: Data.self), let uiImage = UIImage(data: data) {
                    image = uiImage
                    result = nil
                }
            }
        }
        .fullScreenCover(isPresented: $showingCamera) {
            CameraCaptureView { captured in image = captured; result = nil }
                .ignoresSafeArea()
        }
    }

    private func scoreOutfit() {
        guard let image, let data = ImageUtilities.prepareForStorageAndUpload(image) else { return }
        isScoring = true
        errorText = nil
        Task {
            defer { isScoring = false }
            do {
                let scoreResult = try await OutfitScorer.scorePhoto(imageData: data, occasion: occasion)
                result = scoreResult
                context.insert(OutfitLog(
                    imageData: data,
                    occasion: occasion,
                    score: scoreResult.score,
                    feedback: scoreResult.feedback,
                    suggestions: scoreResult.suggestions
                ))
                try? context.save()
            } catch {
                errorText = error.localizedDescription
            }
        }
    }
}

// MARK: - Wardrobe catalog + AI outfit maker

private struct WardrobeTab: View {
    @Query(sort: \WardrobeItem.createdAt, order: .reverse) private var items: [WardrobeItem]
    @Environment(\.modelContext) private var context
    @ObservedObject private var settings = SettingsStore.shared

    @State private var showingAddItem = false
    @State private var occasion = ""
    @State private var isSuggesting = false
    @State private var errorText: String?
    @State private var suggestion: OutfitCombinationResult?

    private let columns = [GridItem(.adaptive(minimum: 90), spacing: 10)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 10) {
                    Text("AI Outfit Maker").font(.headline)
                    Text("Picks the best combination from your catalog below.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    TextField("Occasion (e.g. \"weekend brunch\")", text: $occasion)
                        .textFieldStyle(.roundedBorder)
                    Button {
                        suggestOutfit()
                    } label: {
                        if isSuggesting {
                            ProgressView().frame(maxWidth: .infinity)
                        } else {
                            Text("Suggest an Outfit").frame(maxWidth: .infinity)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(items.isEmpty || isSuggesting || !settings.isAIConfigured)

                    if items.isEmpty {
                        Text("Add a few items to your wardrobe first.").font(.footnote).foregroundStyle(.secondary)
                    }
                    if let errorText {
                        Text(errorText).font(.footnote).foregroundStyle(.red)
                    }
                    if let suggestion {
                        VStack(alignment: .leading, spacing: 6) {
                            ForEach(suggestion.chosenItemNames, id: \.self) { name in
                                Label(name, systemImage: "checkmark.circle.fill").font(.subheadline)
                            }
                            Text(suggestion.reasoning).font(.footnote).foregroundStyle(.secondary)
                            PointsPill(points: suggestion.score, systemImage: "tshirt.fill", tint: .pink)
                        }
                        .padding(.top, 4)
                    }
                }
                .padding()
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))
                .padding(.horizontal)

                HStack {
                    Text("Catalog").font(.headline)
                    Spacer()
                    Button { showingAddItem = true } label: { Image(systemName: "plus.circle.fill") }
                }
                .padding(.horizontal)

                if items.isEmpty {
                    Text("No items yet. Add photos of your clothes to build your catalog.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal)
                } else {
                    LazyVGrid(columns: columns, spacing: 10) {
                        ForEach(items) { item in
                            VStack(spacing: 4) {
                                if let uiImage = UIImage(data: item.imageData) {
                                    Image(uiImage: uiImage)
                                        .resizable()
                                        .scaledToFill()
                                        .frame(width: 90, height: 90)
                                        .clipShape(RoundedRectangle(cornerRadius: 10))
                                }
                                Text(item.name).font(.caption2).lineLimit(1)
                            }
                            .contextMenu {
                                Button("Delete", role: .destructive) { delete(item) }
                            }
                        }
                    }
                    .padding(.horizontal)
                }
            }
            .padding(.vertical)
        }
        .sheet(isPresented: $showingAddItem) {
            AddWardrobeItemView()
        }
    }

    private func suggestOutfit() {
        isSuggesting = true
        errorText = nil
        Task {
            defer { isSuggesting = false }
            do {
                suggestion = try await OutfitScorer.suggestCombination(items: items, occasion: occasion)
            } catch {
                errorText = error.localizedDescription
            }
        }
    }

    private func delete(_ item: WardrobeItem) {
        context.delete(item)
        try? context.save()
    }
}
