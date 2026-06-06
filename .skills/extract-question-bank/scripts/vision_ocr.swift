import Foundation
import Vision
import AppKit

if CommandLine.arguments.count != 2 {
    fputs("usage: vision_ocr.swift <image>\n", stderr)
    exit(2)
}

let url = URL(fileURLWithPath: CommandLine.arguments[1])
guard
    let image = NSImage(contentsOf: url),
    let tiff = image.tiffRepresentation,
    let bitmap = NSBitmapImageRep(data: tiff),
    let cgImage = bitmap.cgImage
else {
    fputs("cannot load image\n", stderr)
    exit(1)
}

let request = VNRecognizeTextRequest { request, error in
    if let error {
        fputs("\(error)\n", stderr)
        exit(1)
    }

    let observations = (request.results as? [VNRecognizedTextObservation]) ?? []
    let lines = observations.compactMap { $0.topCandidates(1).first?.string }
    print(lines.joined(separator: "\n"))
}

request.recognitionLevel = .accurate
request.recognitionLanguages = ["ko-KR", "en-US"]
request.usesLanguageCorrection = true

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
try handler.perform([request])
