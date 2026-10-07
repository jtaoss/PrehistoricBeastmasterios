import Foundation

enum ContentMode: String {
    case miniOnly = "MINI_ONLY"
    case onlineOnly = "ONLINE_ONLY"
    case both = "BOTH"

    static func fromServer(_ value: String?) -> ContentMode {
        let raw = (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        return ContentMode(rawValue: raw) ?? .miniOnly
    }

    var allowsMiniGame: Bool { self != .onlineOnly }
    var allowsOnlineGame: Bool { self != .miniOnly }
    var javascriptValue: String { rawValue.lowercased() }
}

struct ContentConfig {
    let mode: ContentMode
    let onlineGameURL: URL?
    let revision: Int64
    let updatedAt: String

    init(mode: ContentMode = .miniOnly, onlineGameURL: URL? = nil,
         revision: Int64 = 0, updatedAt: String = "") {
        self.mode = mode
        self.onlineGameURL = onlineGameURL
        self.revision = max(0, revision)
        self.updatedAt = updatedAt
    }
}

final class ContentConfigManager {
    private let store: UserDefaults
    // Debug device builds and App Store builds may be installed over one
    // another under the same bundle identifier. Keep their routing revisions
    // separate so a high local/debug revision cannot permanently reject a
    // newer production decision after an overwrite install.
    private var cacheNamespace: String { ShellConfig.isDebug ? "debug" : "release" }
    private var modeKey: String { "shell_content_mode_\(cacheNamespace)" }
    private var onlineGameURLKey: String { "shell_content_online_url_\(cacheNamespace)" }
    private var revisionKey: String { "shell_content_revision_\(cacheNamespace)" }
    private var updatedAtKey: String { "shell_content_updated_at_\(cacheNamespace)" }
    private var lastRefresh: Date = .distantPast
    private var refreshInProgress = false
    private var destroyed = false

    init(store: UserDefaults = .standard) {
        self.store = store
    }

    func cachedOrDefault() -> ContentConfig {
        let mode = ContentMode.fromServer(store.string(forKey: modeKey))
        let url = IOSWebNavigationPolicy.validatedOnlineGameURL(store.string(forKey: onlineGameURLKey) ?? "")
        return ContentConfig(
            mode: mode.allowsOnlineGame && url == nil ? .miniOnly : mode,
            onlineGameURL: url,
            revision: Int64(store.integer(forKey: revisionKey)),
            updatedAt: store.string(forKey: updatedAtKey) ?? ""
        )
    }

    func refresh(force: Bool, completion: @escaping (ContentConfig) -> Void) {
        let endpoint = ShellConfig.contentConfigEndpoint.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !destroyed, !endpoint.isEmpty, isAllowedEndpoint(endpoint) else { return }
        if refreshInProgress || (!force && Date().timeIntervalSince(lastRefresh) < 60) {
            return
        }
        refreshInProgress = true
        lastRefresh = Date()
        Task {
            let accepted = try? await fetch(endpoint)
            // Revisions belong to individual backend rules. Deleting an exact
            // rule can select a fallback with a lower revision, which must win.
            if let config = accepted { save(config) }
            refreshInProgress = false
            if let config = accepted, !destroyed {
                await MainActor.run { completion(config) }
            }
        }
    }

    func destroy() {
        destroyed = true
    }

    private func fetch(_ endpoint: String) async throws -> ContentConfig {
        guard var components = URLComponents(string: endpoint) else {
            throw URLError(.badURL)
        }
        var items = components.queryItems ?? []
        items.append(contentsOf: [
            URLQueryItem(name: "appId", value: ShellConfig.backendAppId),
            URLQueryItem(name: "packageName", value: ShellConfig.bundleId),
            URLQueryItem(name: "channel", value: ShellConfig.channel),
            URLQueryItem(name: "versionCode", value: ShellConfig.versionCode),
            URLQueryItem(name: "versionName", value: ShellConfig.versionName)
        ])
        components.queryItems = items
        guard let url = components.url else { throw URLError(.badURL) }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 5)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else { throw URLError(.badServerResponse) }
        let json = try JSONObject(json: String(data: data, encoding: .utf8) ?? "")
        return try Self.parseResponse(json, lastOnlineGameURL: cachedOrDefault().onlineGameURL)
    }

    static func parseResponse(_ json: JSONObject, lastOnlineGameURL: URL? = nil) throws -> ContentConfig {
        guard json.int("code", -1) == 0, let dataObject = json.jsonObject("data") else {
            throw URLError(.cannotParseResponse)
        }
        guard dataObject.string("appId") == ShellConfig.backendAppId,
              dataObject.string("packageName") == ShellConfig.bundleId,
              dataObject.string("channel") == ShellConfig.channel else {
            throw URLError(.cannotParseResponse)
        }
        let rawMode = dataObject.string("mode")
        let mode = ContentMode.fromServer(rawMode)
        guard mode.rawValue.caseInsensitiveCompare(rawMode) == .orderedSame else {
            throw URLError(.cannotParseResponse)
        }
        let rawURL = dataObject.string("onlineGameURL")
        let parsedURL = IOSWebNavigationPolicy.validatedOnlineGameURL(rawURL)
        guard !mode.allowsOnlineGame || parsedURL != nil else {
            throw URLError(.cannotParseResponse)
        }
        // MINI_ONLY responses may omit the entry; keep the last validated URL
        // until the current remote page has safely returned to the mini-game.
        let gameURL = parsedURL ?? lastOnlineGameURL
        return ContentConfig(mode: mode, onlineGameURL: gameURL,
                             revision: dataObject.int64("revision"), updatedAt: dataObject.string("updatedAt"))
    }

    private func save(_ config: ContentConfig) {
        if let url = config.onlineGameURL { store.set(url.absoluteString, forKey: onlineGameURLKey) }
        store.set(config.mode.rawValue, forKey: modeKey)
        store.set(config.revision, forKey: revisionKey)
        store.set(config.updatedAt, forKey: updatedAtKey)
    }

    private func isAllowedEndpoint(_ endpoint: String) -> Bool {
        guard let url = URL(string: endpoint), let host = url.host, !host.isEmpty else { return false }
        if url.scheme?.caseInsensitiveCompare("https") == .orderedSame {
            return true
        }
        return ShellConfig.isDebug
            && url.scheme?.caseInsensitiveCompare("http") == .orderedSame
            && Self.isLocalDebugHost(host)
    }

    static func isLocalDebugHost(_ host: String) -> Bool {
        let normalized = host.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if ["127.0.0.1", "localhost", "0.0.0.0"].contains(normalized) {
            return true
        }
        let parts = normalized.split(separator: ".").compactMap { Int($0) }
        guard parts.count == 4 else { return false }
        return parts[0] == 10
            || (parts[0] == 192 && parts[1] == 168)
            || (parts[0] == 172 && (16...31).contains(parts[1]))
    }
}

final class ShellPreferences {
    private let store = UserDefaults.standard
    private let privacyKey = "privacy_accepted"

    var isPrivacyAccepted: Bool {
        store.bool(forKey: privacyKey)
    }

    func setPrivacyAccepted(_ accepted: Bool) {
        store.set(accepted, forKey: privacyKey)
    }
}
