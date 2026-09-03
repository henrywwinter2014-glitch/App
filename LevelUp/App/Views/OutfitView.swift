import SwiftUI
import SwiftData
import PhotosUI
import UIKit

struct OutfitView: View {
    private enum Segment: String, CaseIterable { case check = "Check Outfit", wardrobe = "Wardrobe" }
    @State private var segment: Segment = .check

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
                case .check: CheckOutfitTab()
                case .wardrobe: WardrobeTab()
                }
            }
            .navigationTitle("Outfits")
        }
    }
}

// MARK: - Check a photo

private struct CheckOutfitTab: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \OutfitLog.date, order: .reverse) private var logs: [OutfitLog]

    @State private var image: UIImage?
    @State private var photoPickerItem: PhotosPickerItem?
    @State private var showingCamera = false
    @State private var note = ""
    @State private var isScoring = false
    @State private var errorText: String?
    @State private var result: OutfitCheckResult?

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                if !OutfitScorer.isModelInstalled {
                    VStack(alignment: .leading, spacing: 4) {
                        Label("No trained model installed", systemImage: "exclamationmark.triangle.fill")
                            .font(.subheadline.bold())
                        Text("Train one for free with Create ML and drop it into App/Resources/OutfitScorer.mlmodel — see the README's \"Training the outfit checker\" section.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.orange.opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
                    .padding(.horizontal)
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

                TextField("Note (optional, e.g. \"job interview\")", text: $note)
                    .textFieldStyle(.roundedBorder)
                    .padding(.horizontal)

                Button {
                    checkOutfit()
                } label: {
                    if isScoring {
                        ProgressView().frame(maxWidth: .infinity)
                    } else {
                        Text("Check This Outfit").frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(image == nil || isScoring || !OutfitScorer.isModelInstalled)
                .padding(.horizontal)

                if let errorText {
                    Text(errorText).font(.footnote).foregroundStyle(.red).padding(.horizontal)
                }

                if let result {
                    VStack(spacing: 8) {
                        ScoreRingView(score: result.score, diameter: 110)
                        Text(summary(for: result.score))
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
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
                                if !log.note.isEmpty {
                                    Text(log.note).font(.caption).foregroundStyle(.secondary)
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

    private func summary(for score: Int) -> String {
        switch score {
        case 80...: "Looking great!"
        case 60..<80: "Solid outfit."
        case 40..<60: "Could use some tweaks."
        default: "Might be worth a rethink."
        }
    }

    private func checkOutfit() {
        guard let image, let data = ImageUtilities.prepareForStorageAndUpload(image) else { return }
        isScoring = true
        errorText = nil
        Task {
            defer { isScoring = false }
            do {
                let checkResult = try await OutfitScorer.score(image: image)
                result = checkResult
                context.insert(OutfitLog(imageData: data, note: note, score: checkResult.score))
                try? context.save()
            } catch {
                errorText = error.localizedDescription
            }
        }
    }
}

// MARK: - Wardrobe catalog

private struct WardrobeTab: View {
    @Query(sort: \WardrobeItem.createdAt, order: .reverse) private var items: [WardrobeItem]
    @Environment(\.modelContext) private var context
    @State private var showingAddItem = false

    private let columns = [GridItem(.adaptive(minimum: 90), spacing: 10)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text("Catalog").font(.headline)
                    Spacer()
                    Button { showingAddItem = true } label: { Image(systemName: "plus.circle.fill") }
                }
                .padding(.horizontal)
                .padding(.top, 8)

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

    private func delete(_ item: WardrobeItem) {
        context.delete(item)
        try? context.save()
    }
}
