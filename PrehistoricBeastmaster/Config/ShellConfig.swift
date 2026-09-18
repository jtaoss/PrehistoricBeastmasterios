import Foundation

enum ShellConfig {
    static var backendAppId: String { info("ShellBackendAppId", "1000151") }
    static var channel: String { info("ShellChannel", "xmwtwh5sqxssgp1") }
    static var webSdkChannel: String { info("ShellWebSdkChannel", "10000") }
    static var sdkApiEndpoint: String { info("ShellSdkApiEndpoint", "https://safthwysdk.antieh.com/") }
    /// Legacy URL interception only; GameOrderEndpointRouter selects the destination by server ID.
    static var gameOrderEndpoint: String {
        info("ShellGameOrderEndpoint", "https://safthwy09.antieh.com/fx/createOrder.php")
    }
    static var gameOrderPlatform: String { info("ShellGameOrderPlatform", "xmwh5xsqsdtt") }
    // iOS never selects a web/Google payment type from remote or bundle config.
    static let payType = "apple"
    static var payChannel: Int { Int(info("ShellPayChannel", "24")) ?? 24 }
    static var paymentApiToken: String { info("ShellPaymentApiToken") }
    static var onlineGameURL: URL? { URL(string: info("ShellOnlineGameURL")) }
    static var contentConfigEndpoint: String { info("ShellContentConfigEndpoint") }
    static var storeKitEnabled: Bool { flag("ShellStoreKitEnabled", true) }
    static var allowSideloadOrderHandshake: Bool { flag("ShellAllowSideloadOrderHandshake", false) }
    static var bundleId: String { Bundle.main.bundleIdentifier ?? "com.stone.primitive.saga" }
    static var versionName: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.12"
    }
    static var versionCode: String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "17"
    }
    static var localGameURL: URL? {
        Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "game")
    }
    static var localGameDirectory: URL? {
        localGameURL?.deletingLastPathComponent()
    }

    #if DEBUG
    static let isDebug = true
    #else
    static let isDebug = false
    #endif

    private static func info(_ key: String, _ fallback: String = "") -> String {
        let value = (Bundle.main.object(forInfoDictionaryKey: key) as? String ?? fallback).trimmingCharacters(in: .whitespacesAndNewlines)
        return value
    }

    private static func flag(_ key: String, _ fallback: Bool) -> Bool {
        let raw = info(key).lowercased()
        if raw.isEmpty {
            return fallback
        }
        return raw == "yes" || raw == "true" || raw == "1"
    }
}

/// Document navigation only. Do not filter game API/CDN resource requests here:
/// those are also used by login and by the existing App Store order handshake.
/// Unknown browser destinations fail closed instead of becoming a web-pay exit.
enum IOSWebNavigationPolicy {
    static func isPrivacyPolicyURL(_ url: URL) -> Bool {
        allowsExternal(url) && url.host?.lowercased() == "d1udhm4c9vjzph.cloudfront.net"
            && url.path == "/ios-legal/privacy-policy.html"
    }

    static func allowsInWebView(_ url: URL, onlineGameURL: URL?, localGameDirectory: URL?) -> Bool {
        if url.isFileURL {
            guard let root = localGameDirectory?.standardizedFileURL.path else { return false }
            return url.standardizedFileURL.path.hasPrefix(root + "/")
        }
        guard isSafeHTTPS(url) else { return false }
        if let game = onlineGameURL, isSafeHTTPS(game),
           url.host?.lowercased() == game.host?.lowercased(),
           normalizedPort(url) == normalizedPort(game),
           url.path == game.path {
            return true
        }
        return isLoginURL(url)
    }

    static func allowsExternal(_ url: URL) -> Bool {
        guard isSafeHTTPS(url) else { return false }
        if isLoginURL(url) { return true }
        // Legal links remain usable, but the entire CDN/domain is not trusted.
        guard url.host?.lowercased() == "d1udhm4c9vjzph.cloudfront.net",
              url.query == nil else { return false }
        return ["/ios-legal/terms-of-service.html", "/ios-legal/privacy-policy.html",
                "/ios-legal/account-deletion.html"].contains(url.path)
    }

    private static func isSafeHTTPS(_ url: URL) -> Bool {
        let segments = url.path.split(separator: "/")
        guard !segments.contains("."), !segments.contains(".."), !url.path.contains("\\") else { return false }
        return url.scheme?.lowercased() == "https" && url.user == nil && url.password == nil
            && normalizedPort(url) == 443 && !(url.host ?? "").isEmpty
    }

    private static func normalizedPort(_ url: URL) -> Int { url.port ?? 443 }

    private static func isLoginURL(_ url: URL) -> Bool {
        // Authentication only. In particular, playstonegame.com is NOT a
        // browser allowlist entry: it hosts both SDK resources and web recharge.
        switch url.host?.lowercased() {
        case "accounts.google.com":
            return true
        case "appleid.apple.com":
            return url.path.hasPrefix("/auth/")
        case "www.facebook.com", "m.facebook.com", "facebook.com":
            return url.path == "/login.php" || url.path.hasPrefix("/login/")
                || url.path == "/dialog/oauth" || url.path.hasPrefix("/dialog/oauth/")
        default:
            return false
        }
    }
}
