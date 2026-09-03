import UIKit

/// Shared image prep so wardrobe photos and outfit photos don't balloon the SwiftData
/// store or the AI request payload — resized to a reasonable max dimension and
/// JPEG-compressed before they're ever persisted or sent to the API.
enum ImageUtilities {
    static func prepareForStorageAndUpload(_ image: UIImage, maxDimension: CGFloat = 1024, quality: CGFloat = 0.7) -> Data? {
        let resized = resize(image, maxDimension: maxDimension)
        return resized.jpegData(compressionQuality: quality)
    }

    private static func resize(_ image: UIImage, maxDimension: CGFloat) -> UIImage {
        let largestSide = max(image.size.width, image.size.height)
        guard largestSide > maxDimension else { return image }

        let scale = maxDimension / largestSide
        let newSize = CGSize(width: image.size.width * scale, height: image.size.height * scale)

        let renderer = UIGraphicsImageRenderer(size: newSize)
        return renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: newSize))
        }
    }
}
