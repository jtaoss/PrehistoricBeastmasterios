import Foundation

enum ShellConfig {
    static var backendAppId: String { info("ShellBackendAppId", "1000151") }
    static var channel: String { info("ShellChannel", "xmwtwh5sqxssgp1") }
    static var webSdkChannel: String { info("ShellWebSdkChannel", "10000") }
    static var sdkApiEndpoint: String { ServiceEndpoints.string(.sdkAPI) }
    static let payType = "apple"
    static var payChannel: Int { Int(info("ShellPayChannel", "24")) ?? 24 }
    static var miniGameOrderEndpoint: String { info("ShellMiniGameOrderEndpoint") }
    static var miniGameAuthBaseURL: String { info("ShellMiniGameAuthBaseURL") }
    static func legalURL(_ key: String) -> URL? {
        switch key {
        case "terms": return ServiceEndpoints.url(.legalTerms)
        case "privacy": return ServiceEndpoints.url(.legalPrivacy)
        case "deletion": return ServiceEndpoints.url(.legalDeletion)
        default: return nil
        }
    }
    static var storeKitEnabled: Bool { flag("ShellStoreKitEnabled", true) }
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
    static var moduleCatalogEndpoint: URL? {
        let raw = info("ShellModuleCatalogEndpoint")
        if !raw.isEmpty, let custom = URL(string: raw) {
            return custom
        }
        let base = sdkApiEndpoint.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return URL(string: base + "/v1/app/modules")
    }
    static var moduleHmacSecretKey: String {
        info("ShellModuleHmacSecret", "pbm-route-secret-v1")
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

enum IOSWebNavigationPolicy {
    private static let hostLock = NSLock()
    private static var admittedHosts = Set<String>()

    /// 允许的官方业务与活动域名白名单（禁止任意未知域名动态授权）
    static let approvedBusinessDomains: Set<String> = [
        "primitive-saga.com",
        "api.primitive-saga.com",
        "activity.primitive-saga.com",
        "events.primitive-saga.com"
    ]

    static func isApprovedBusinessHost(_ host: String) -> Bool {
        let normalized = host.lowercased()
        if approvedBusinessDomains.contains(normalized) {
            return true
        }
        if normalized.hasSuffix(".primitive-saga.com") {
            return true
        }
        return false
    }

    /// 当前会话里，目录接口已经接受的 HTTPS 主机。
    static var approvedRemoteGameHosts: Set<String> {
        hostLock.lock()
        defer { hostLock.unlock() }
        return admittedHosts
    }

    static func admitRemoteEntry(_ url: URL) {
        guard isTransportSafe(url),
              let host = url.host?.lowercased(),
              isApprovedBusinessHost(host) else { return }
        hostLock.lock()
        admittedHosts.insert(host)
        hostLock.unlock()
    }

    static func isApprovedRemoteGameURL(_ url: URL?) -> Bool {
        guard let url, isTransportSafe(url), let host = url.host?.lowercased() else { return false }
        guard isApprovedBusinessHost(host) else { return false }
        hostLock.lock()
        defer { hostLock.unlock() }
        return admittedHosts.contains(host)
    }

    static func isApprovedActivityURL(_ url: URL?) -> Bool {
        guard let url, isTransportSafe(url), let host = url.host?.lowercased() else { return false }
        return isApprovedBusinessHost(host)
    }

    static func isTransportSafe(_ url: URL) -> Bool {
        isSafeHTTPS(url)
    }

    static func isPrivacyPolicyURL(_ url: URL) -> Bool {
        matchesApprovedURL(url, ServiceEndpoints.url(.legalPrivacy))
    }

    static func allowsInWebView(_ url: URL, localGameDirectory: URL?) -> Bool {
        if url.isFileURL {
            return isBundledFile(url, in: localGameDirectory)
        }
        return isApprovedRemoteGameURL(url)
    }

    static func allowsExternal(_ url: URL) -> Bool {
        guard isSafeHTTPS(url) else { return false }
        return [ServiceEndpoints.url(.legalTerms), ServiceEndpoints.url(.legalPrivacy), ServiceEndpoints.url(.legalDeletion)]
            .contains { matchesApprovedURL(url, $0) }
    }

    private static func matchesApprovedURL(_ actual: URL, _ expected: URL?) -> Bool {
        guard let expected, isSafeHTTPS(expected) else { return false }
        return actual.scheme?.lowercased() == expected.scheme?.lowercased()
            && actual.host?.lowercased() == expected.host?.lowercased()
            && normalizedPort(actual) == normalizedPort(expected)
            && actual.path == expected.path
            && actual.query == expected.query
            && actual.fragment == expected.fragment
            && actual.user == nil && actual.password == nil
    }

    private static func isSafeHTTPS(_ url: URL) -> Bool {
        let segments = url.path.split(separator: "/")
        guard !segments.contains("."), !segments.contains(".."), !url.path.contains("\\") else { return false }
        return url.scheme?.lowercased() == "https" && url.user == nil && url.password == nil
            && normalizedPort(url) == 443 && !(url.host ?? "").isEmpty
    }

    private static func normalizedPort(_ url: URL) -> Int { url.port ?? 443 }

    static func isBundledFile(_ url: URL?, in directory: URL?) -> Bool {
        guard let url, url.isFileURL,
              let root = directory?.standardizedFileURL.path else { return false }
        return url.standardizedFileURL.path.hasPrefix(root + "/")
    }
}
