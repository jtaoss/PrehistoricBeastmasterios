import Foundation

var checks = 0
func check(_ condition: @autoclosure () -> Bool, _ message: String) {
    guard condition() else { fatalError(message) }
    checks += 1
}

check(ContentConfig().mode == .miniOnly, "A fresh install must start with the bundled game")

// The server controls which entries are visible in both build variants.
for requested in [ContentMode.miniOnly, .both, .onlineOnly] {
    check(ContentMode.fromServer(requested.rawValue) == requested, "Keep valid backend modes parseable")
    let config = ContentConfig(mode: requested, revision: Int64.max, updatedAt: "2099-01-01T00:00:00Z")
    let expected = requested
    check(config.mode == expected, "Remote mode parser must retain known values")
    check(config.mode.allowsOnlineGame == expected.allowsOnlineGame, "Parsed online-game capability stays consistent")
    check(config.mode.allowsMiniGame == expected.allowsMiniGame, "Parsed mini-game capability stays consistent")
    check(config.mode.javascriptValue == expected.javascriptValue, "Parsed mode stays serializable")
    check(config.revision == Int64.max, "Preserve revision handling")
}
check(ContentMode.fromServer("invalid") == .miniOnly, "Preserve invalid-mode fallback")

// Exercise the real cache reader in an isolated preferences suite, including
// an online mode left by an older build. Never touch player preferences.
let suite = "pbm-release-content-test-\(UUID().uuidString)"
let preferences = UserDefaults(suiteName: suite)!
defer { preferences.removePersistentDomain(forName: suite) }
let namespace = ShellConfig.isDebug ? "debug" : "release"
let otherNamespace = ShellConfig.isDebug ? "release" : "debug"
preferences.set("BOTH", forKey: "shell_content_mode_\(otherNamespace)")
preferences.set(777, forKey: "shell_content_revision_\(otherNamespace)")
preferences.set("BOTH", forKey: "shell_content_mode")
let manager = ContentConfigManager(store: preferences)
check(manager.cachedOrDefault().mode == .miniOnly, "Do not import the other environment or legacy cache")
let gameString = "https://safthwyk.antieh.com/stoneage_tw/entry.html?os=ios_wk&pf=xmwtwh5sqxssgp1&td_channelid=xmwtwh5sqxssgp1"
let game = IOSWebNavigationPolicy.validatedOnlineGameURL(gameString)!
func backendResponse(_ mode: String, url: String? = nil) -> JSONObject {
    let urlField = url.map { ",\"onlineGameURL\":\"\($0)\"" } ?? ""
    return try! JSONObject(json: """
        {"code":0,"data":{"appId":"1000151","packageName":"com.stone.primitive.saga",
        "channel":"xmwtwh5sqxssgp1","mode":"\(mode)","revision":11,"updatedAt":"now"\(urlField)}}
        """)
}
let validResponse = try ContentConfigManager.parseResponse(backendResponse("BOTH", url: gameString))
check(validResponse.mode == .both && validResponse.onlineGameURL == game && validResponse.revision == 11,
      "A valid backend response enables the configured game entry")
check((try? ContentConfigManager.parseResponse(backendResponse("ONLINE_ONLY"))) == nil,
      "An online-only response without a URL is rejected")
check((try? ContentConfigManager.parseResponse(backendResponse("BOTH", url: "https://evil.example/game"))) == nil,
      "An untrusted backend URL is rejected")
let miniResponse = try ContentConfigManager.parseResponse(backendResponse("MINI_ONLY"), lastOnlineGameURL: game)
check(miniResponse.mode == .miniOnly && miniResponse.onlineGameURL == game,
      "A mini-only response can retain the previous URL long enough to exit the remote page")
for raw in ["BOTH", "ONLINE_ONLY", "MINI_ONLY", "invalid"] {
    preferences.set(raw, forKey: "shell_content_mode_\(namespace)")
    preferences.set(999, forKey: "shell_content_revision_\(namespace)")
    let cached = manager.cachedOrDefault()
    check(cached.mode == .miniOnly, "An online mode without a backend URL must fall back to the mini-game")
    check(cached.revision == 999, "Reading the cache must retain its revision")
}
preferences.set(gameString, forKey: "shell_content_online_url_\(namespace)")
for raw in ["BOTH", "ONLINE_ONLY", "MINI_ONLY"] {
    preferences.set(raw, forKey: "shell_content_mode_\(namespace)")
    check(manager.cachedOrDefault().mode == ContentMode.fromServer(raw), "Validated cached URL restores backend mode")
    check(manager.cachedOrDefault().onlineGameURL == game, "Cached URL is preserved")
}
preferences.set("https://evil.example/game.html?os=ios_wk&pf=xmwtwh5sqxssgp1&td_channelid=xmwtwh5sqxssgp1", forKey: "shell_content_online_url_\(namespace)")
check(manager.cachedOrDefault().mode == .miniOnly, "An untrusted cached URL cannot enable the online game")
check(preferences.string(forKey: "shell_content_mode_\(otherNamespace)") == "BOTH", "Do not modify the other environment's cache")
check(preferences.integer(forKey: "shell_content_revision_\(otherNamespace)") == 777, "Do not modify the other environment's revision")

for invalid in [
    gameString.replacingOccurrences(of: "https:", with: "http:"),
    gameString.replacingOccurrences(of: "safthwyk.antieh.com", with: "evil.example"),
    gameString.replacingOccurrences(of: "os=ios_wk", with: "os=web"),
    gameString.replacingOccurrences(of: "os=ios_wk", with: "os=ios_wk&os=web"),
    gameString.replacingOccurrences(of: "pf=xmwtwh5sqxssgp1", with: "pf=other"),
    gameString + "#fragment",
    gameString.replacingOccurrences(of: "https://", with: "https://user@")
] {
    check(IOSWebNavigationPolicy.validatedOnlineGameURL(invalid) == nil,
          "Reject untrusted or malformed backend URL")
}
check(IOSWebNavigationPolicy.allowsInWebView(game, onlineGameURL: game, localGameDirectory: nil),
      "Keep the configured main-game destination available")
check(!IOSWebNavigationPolicy.allowsInWebView(URL(string: "https://example.com/untrusted")!, onlineGameURL: game, localGameDirectory: nil),
      "Removing the content cap must not widen navigation permissions")
check(!IOSWebNavigationPolicy.allowsInWebView(URL(string: gameString.replacingOccurrences(of: "os=ios_wk", with: "os=web"))!, onlineGameURL: game, localGameDirectory: nil),
      "The web-mode redirect must not replace the WK bridge game entry")
check(!IOSWebNavigationPolicy.allowsInWebView(URL(string: gameString.replacingOccurrences(of: "os=ios_wk", with: "os=ios_wk&os=web"))!, onlineGameURL: game, localGameDirectory: nil),
      "A duplicate web-mode parameter must not bypass the WK bridge requirement")
let local = URL(fileURLWithPath: "/isolated/game")
check(IOSWebNavigationPolicy.allowsInWebView(local.appendingPathComponent("index.html"), onlineGameURL: game, localGameDirectory: local),
      "Keep the bundled game available")
check(IOSWebNavigationPolicy.allowsExternal(URL(string: "https://d1udhm4c9vjzph.cloudfront.net/ios-legal/privacy-policy.html")!),
      "Keep existing legal links available")
check(!IOSWebNavigationPolicy.allowsExternal(URL(string: "https://safthwyk.antieh.com/")!),
      "Do not open the removed official website root")
check(!IOSWebNavigationPolicy.allowsExternal(URL(string: "https://safthwyk.antieh.com/admin")!),
      "Do not widen the official website allowlist beyond its configured path")
manager.destroy()
print("PASS backend-controlled game routing: \(checks) checks")
