import AVFoundation
import UIKit
import WebKit

// Only the bundled mini-game may control these two fixed, local audio files.
// Keep the bridge's menu/game aliases, but use the current Emberwild assets.
final class LocalMusicPlayer: NSObject, WKScriptMessageHandlerWithReply {
    weak var webView: WKWebView?
    private var players: [String: AVAudioPlayer] = [:]
    private var interrupted = false
    private let files = ["menu": "assets/audio/warmth-of-a-primeval-dawn.mp3", "game": "assets/audio/hold-the-ridge.mp3"]

    override init() {
        super.init()
        NotificationCenter.default.addObserver(self, selector: #selector(suspend), name: UIApplication.willResignActiveNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(resume), name: UIApplication.didBecomeActiveNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(audioInterruption(_:)), name: AVAudioSession.interruptionNotification, object: nil)
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        pauseAll()
    }

    private func isLocal(_ url: URL?) -> Bool {
        guard let url, url.isFileURL, let expected = ShellConfig.localGameURL else { return false }
        return url.standardizedFileURL.path == expected.standardizedFileURL.path
    }

    // Preparing once before the HTML loads keeps decoders warm across screen changes.
    func prepare() {
        let started = CACurrentMediaTime()
        do {
            try AVAudioSession.sharedInstance().setCategory(.ambient, mode: .default, options: [.mixWithOthers])
            for key in files.keys { _ = try player(for: key) }
            #if DEBUG
            NSLog("[PBM-MUSIC] prepared both tracks in %.0f ms", (CACurrentMediaTime() - started) * 1000)
            #endif
        } catch {
            NSLog("[PBM-MUSIC] prepare failed: %@", error.localizedDescription)
        }
    }

    private func player(for key: String) throws -> AVAudioPlayer {
        if let player = players[key] { return player }
        guard let filename = files[key], let directory = ShellConfig.localGameDirectory else {
            throw NSError(domain: "LocalMusic", code: 1)
        }
        let player = try AVAudioPlayer(contentsOf: directory.appendingPathComponent(filename))
        player.numberOfLoops = -1
        player.volume = 0.4
        guard player.prepareToPlay() else { throw NSError(domain: "LocalMusic", code: 2) }
        players[key] = player
        return player
    }

    func pauseAll() {
        for player in players.values { player.pause() }
    }

    private func notifyPage(active: Bool) {
        guard isLocal(webView?.url) else { return }
        webView?.evaluateJavaScript("window.setShellAppActive?.(\(active ? "true" : "false"))", completionHandler: nil)
    }

    @objc private func suspend() {
        pauseAll() // Native stop is immediate, even when WebKit is suspended.
        notifyPage(active: false)
    }

    @objc private func resume() {
        guard UIApplication.shared.applicationState == .active, !interrupted else { return }
        notifyPage(active: true) // Also retries a first load that happened while inactive.
    }

    @objc private func audioInterruption(_ notification: Notification) {
        guard let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        interrupted = type == .began
        if interrupted { suspend() } else { resume() }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard message.frameInfo.isMainFrame, isLocal(message.frameInfo.request.url), isLocal(webView?.url),
              let body = message.body as? [String: Any], let action = body["action"] as? String,
              let key = body["track"] as? String, files[key] != nil else {
            replyHandler(nil, "Local music is available only to the bundled game.")
            return
        }
        do {
            let player = try player(for: key)
            switch action {
            case "play":
                guard UIApplication.shared.applicationState == .active, !interrupted else {
                    replyHandler(["error": "NotAllowedError"], nil)
                    return
                }
                let started = CACurrentMediaTime()
                for (otherKey, other) in players where otherKey != key { other.pause() }
                if let volume = body["volume"] as? Double, volume.isFinite {
                    player.volume = Float(min(1, max(0, volume)))
                }
                try AVAudioSession.sharedInstance().setActive(true)
                guard player.isPlaying || player.play() else { throw NSError(domain: "LocalMusic", code: 3) }
                #if DEBUG
                NSLog("[PBM-MUSIC] play %@ ready in %.0f ms", key, (CACurrentMediaTime() - started) * 1000)
                #endif
            case "pause":
                player.pause()
            case "seek":
                guard let position = body["position"] as? Double, position.isFinite else {
                    replyHandler(nil, "Invalid playback position.")
                    return
                }
                player.currentTime = min(player.duration, max(0, position))
            case "prepare":
                guard player.prepareToPlay() else { throw NSError(domain: "LocalMusic", code: 4) }
            default:
                replyHandler(nil, "Unknown music command.")
                return
            }
            replyHandler(["position": player.currentTime, "playing": player.isPlaying], nil)
        } catch {
            replyHandler(nil, "Unable to prepare or play the bundled music.")
        }
    }
}
