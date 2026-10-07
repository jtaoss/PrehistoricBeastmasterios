// Usage: swift scripts/extract-game-audio.swift input.mp4 output.m4a
// Copy the first audio track without recompressing it or changing the source file.
import AVFoundation
import Foundation
import Darwin

func extractAudio() async throws {
    guard CommandLine.arguments.count == 3 else {
        throw NSError(domain: "GameAudio", code: 1, userInfo: [NSLocalizedDescriptionKey: "Expected input video and output .m4a paths"])
    }
    let sourceURL = URL(fileURLWithPath: CommandLine.arguments[1])
    let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])
    guard !FileManager.default.fileExists(atPath: outputURL.path) else {
        throw NSError(domain: "GameAudio", code: 2, userInfo: [NSLocalizedDescriptionKey: "Output already exists; refusing to overwrite it"])
    }
    let source = AVURLAsset(url: sourceURL)
    guard let audio = try await source.loadTracks(withMediaType: .audio).first else {
        throw NSError(domain: "GameAudio", code: 3, userInfo: [NSLocalizedDescriptionKey: "No audio track found"])
    }
    let composition = AVMutableComposition()
    guard let track = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) else {
        throw NSError(domain: "GameAudio", code: 4, userInfo: [NSLocalizedDescriptionKey: "Could not create audio composition"])
    }
    let range = try await audio.load(.timeRange)
    try track.insertTimeRange(range, of: audio, at: .zero)
    guard let exporter = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetPassthrough) else {
        throw NSError(domain: "GameAudio", code: 5, userInfo: [NSLocalizedDescriptionKey: "Audio passthrough export unavailable"])
    }
    try await exporter.export(to: outputURL, as: .m4a)
    let result = AVURLAsset(url: outputURL)
    let audioCount = try await result.loadTracks(withMediaType: .audio).count
    let videoCount = try await result.loadTracks(withMediaType: .video).count
    let duration = try await result.load(.duration)
    guard audioCount == 1, videoCount == 0 else {
        throw NSError(domain: "GameAudio", code: 6, userInfo: [NSLocalizedDescriptionKey: "Unexpected exported track layout"])
    }
    print("Exported audio-only M4A: \(outputURL.path)")
    print("Tracks: \(audioCount) audio, \(videoCount) video; duration: \(CMTimeGetSeconds(duration)) seconds")
}

Task {
    do { try await extractAudio(); exit(0) }
    catch { fputs("Audio extraction failed: \(error.localizedDescription)\n", stderr); exit(1) }
}
dispatchMain()
