import Foundation
import Capacitor
import Vision
import UIKit

/// Capacitor bridge for Apple's on-device Vision text recognizer.
/// Returns only structured OCR output to the existing PocketWise review flow.
@objc(PocketWiseNativeOCRPlugin)
public class PocketWiseNativeOCRPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PocketWiseNativeOCRPlugin"
    public let jsName = "PocketWiseNativeOCR"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "recognize", returnType: CAPPluginReturnPromise)
    ]

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": true, "engine": "Apple Vision"])
    }

    @objc func recognize(_ call: CAPPluginCall) {
        guard let dataURL = call.getString("imageDataUrl"),
              let comma = dataURL.firstIndex(of: ",") else {
            call.reject("A base64 image data URL is required.", "INVALID_IMAGE")
            return
        }
        let payload = String(dataURL[dataURL.index(after: comma)...])
        guard payload.count <= 24_000_000,
              let imageData = Data(base64Encoded: payload, options: .ignoreUnknownCharacters),
              let image = UIImage(data: imageData),
              let cgImage = image.cgImage else {
            call.reject("The image could not be decoded or exceeds the native OCR size limit.", "INVALID_IMAGE")
            return
        }

        let width = cgImage.width
        let height = cgImage.height
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = false // Preserve merchant IDs, references and bank abbreviations.
        request.minimumTextHeight = 0.003

        do {
            let supported = try request.supportedRecognitionLanguages()
            let preferred = ["en-US", "hi-IN"]
            let selected = preferred.filter { supported.contains($0) }
            request.recognitionLanguages = selected.isEmpty ? [supported.first ?? "en-US"] : selected
        } catch {
            request.recognitionLanguages = ["en-US"]
        }

        DispatchQueue.global(qos: .userInitiated).async {
            do {
                try VNImageRequestHandler(cgImage: cgImage, options: [:]).perform([request])
                let observations = request.results ?? []
                var items: [[String: Any]] = []
                var lines: [String] = []

                for observation in observations {
                    guard let candidate = observation.topCandidates(1).first else { continue }
                    let box = observation.boundingBox
                    // Vision uses a normalized lower-left origin. PocketWise expects top-left pixels.
                    let x = Double(box.minX) * Double(width)
                    let y = (1.0 - Double(box.maxY)) * Double(height)
                    let w = Double(box.width) * Double(width)
                    let h = Double(box.height) * Double(height)
                    guard w > 0, h > 0 else { continue }
                    items.append([
                        "text": candidate.string,
                        "confidence": Double(candidate.confidence),
                        "boundingBox": ["x": x, "y": y, "width": w, "height": h]
                    ])
                    lines.append(candidate.string)
                }

                guard !items.isEmpty else {
                    call.reject("Apple Vision found no readable text in the image.", "NO_TEXT")
                    return
                }
                call.resolve([
                    "engine": "Apple Vision",
                    "model": "VNRecognizeTextRequest",
                    "text": lines.joined(separator: "\n"),
                    "items": items,
                    "width": width,
                    "height": height
                ])
            } catch {
                call.reject("Apple Vision OCR failed: \(error.localizedDescription)", "VISION_FAILED")
            }
        }
    }
}
