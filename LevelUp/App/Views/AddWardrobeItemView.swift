import SwiftUI
import SwiftData
import PhotosUI
import UIKit

struct AddWardrobeItemView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context

    @State private var name = ""
    @State private var category: WardrobeCategory = .top
    @State private var colorDescription = ""
    @State private var image: UIImage?
    @State private var photoPickerItem: PhotosPickerItem?
    @State private var showingCamera = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    if let image {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFit()
                            .frame(maxHeight: 220)
                            .frame(maxWidth: .infinity)
                    }
                    HStack {
                        PhotosPicker(selection: $photoPickerItem, matching: .images) {
                            Label("Choose Photo", systemImage: "photo.on.rectangle")
                        }
                        Spacer()
                        Button {
                            showingCamera = true
                        } label: {
                            Label("Camera", systemImage: "camera.fill")
                        }
                    }
                }

                Section("Details") {
                    TextField("Name (e.g. \"Blue denim jacket\")", text: $name)
                    Picker("Category", selection: $category) {
                        ForEach(WardrobeCategory.allCases) { cat in
                            Label(cat.displayName, systemImage: cat.icon).tag(cat)
                        }
                    }
                    TextField("Color (e.g. \"navy blue\")", text: $colorDescription)
                }
            }
            .navigationTitle("New Item")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .disabled(image == nil || name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .onChange(of: photoPickerItem) { _, newItem in
                Task {
                    if let data = try? await newItem?.loadTransferable(type: Data.self), let uiImage = UIImage(data: data) {
                        image = uiImage
                    }
                }
            }
            .fullScreenCover(isPresented: $showingCamera) {
                CameraCaptureView { captured in image = captured }
                    .ignoresSafeArea()
            }
        }
    }

    private func save() {
        guard let image, let data = ImageUtilities.prepareForStorageAndUpload(image) else { return }
        let item = WardrobeItem(
            name: name.trimmingCharacters(in: .whitespaces),
            category: category,
            colorDescription: colorDescription.trimmingCharacters(in: .whitespaces),
            imageData: data
        )
        context.insert(item)
        try? context.save()
        dismiss()
    }
}
