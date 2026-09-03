import Foundation
import CoreML
import Vision
import UIKit

struct OutfitCheckResult {
    let score: Int // 0...100
}

enum OutfitCheckerError: LocalizedError {
    case modelNotInstalled
    case invalidImage
    case predictionFailed(String)

    var errorDescription: String? {
        switch self {
        case .modelNotInstalled:
            "No trained outfit model is installed yet. Train one with Create ML and add OutfitScorer.mlmodel to the app — see the README's \"Training the outfit checker\" section."
        case .invalidImage:
            "Couldn't read that photo."
        case .predictionFailed(let detail):
            "Scoring failed: \(detail)"
        }
    }
}

/// Runs a bundled, on-device Core ML model over an outfit photo — no network call, no
/// API key, no cost. There's no such model shipped in this repo (fashion-quality scoring
/// isn't a task with an off-the-shelf pretrained model, and it needs to reflect *your*
/// taste), so this loads whatever `OutfitScorer.mlmodel` you train yourself and drop into
/// `App/Resources/` — see the README for how to train one for free with Create ML.
///
/// Expects the model to have a single image input and a single scalar (Double/Int64, or a
/// 1-element MLMultiArray) output representing a 0...1 quality score — exactly what
/// Create ML's "Image Regressor" template produces. If your model's output shape differs,
/// adjust `extractScore(from:)` below.
enum OutfitScorer {
    private static let modelFilename = "OutfitScorer"

    private static let visionModel: VNCoreMLModel? = {
        guard let url = Bundle.main.url(forResource: modelFilename, withExtension: "mlmodelc") else {
            return nil
        }
        guard let mlModel = try? MLModel(contentsOf: url), let vnModel = try? VNCoreMLModel(for: mlModel) else {
            return nil
        }
        return vnModel
    }()

    static var isModelInstalled: Bool { visionModel != nil }

    static func score(image: UIImage) async throws -> OutfitCheckResult {
        guard let visionModel else { throw OutfitCheckerError.modelNotInstalled }
        guard let cgImage = image.cgImage else { throw OutfitCheckerError.invalidImage }

        return try await withCheckedThrowingContinuation { continuation in
            let request = VNCoreMLRequest(model: visionModel) { request, error in
                if let error {
                    continuation.resume(throwing: OutfitCheckerError.predictionFailed(error.localizedDescription))
                    return
                }
                guard let observation = request.results?.first as? VNCoreMLFeatureValueObservation,
                      let rawValue = extractScore(from: observation.featureValue) else {
                    continuation.resume(throwing: OutfitCheckerError.predictionFailed("unexpected model output — see extractScore(from:) in OutfitScorer.swift"))
                    return
                }
                let clamped = max(0.0, min(1.0, rawValue))
                continuation.resume(returning: OutfitCheckResult(score: Int(round(clamped * 100))))
            }
            request.imageCropAndScaleOption = .scaleFill

            let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
            do {
                try handler.perform([request])
            } catch {
                continuation.resume(throwing: OutfitCheckerError.predictionFailed(error.localizedDescription))
            }
        }
    }

    private static func extractScore(from featureValue: MLFeatureValue) -> Double? {
        switch featureValue.type {
        case .double:
            return featureValue.doubleValue
        case .int64:
            return Double(featureValue.int64Value)
        case .multiArray:
            guard let array = featureValue.multiArrayValue, array.count > 0 else { return nil }
            return array[0].doubleValue
        default:
            return nil
        }
    }
}
